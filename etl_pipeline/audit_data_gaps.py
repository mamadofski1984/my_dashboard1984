"""Read-only Codal data audit. No downloader imports or network operations."""
from collections import Counter
from decimal import Decimal
from pathlib import Path
from subprocess import run
import json

from canonical_codal import PARENT_NAMES, audited, amended, compact, period, publication, verified_parent, trace_number

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / "codal_evidence"
DATA = ROOT / "public" / "data"
ARCHIVES = ROOT / "public" / "Dashboard_Data"
REPORT = HERE / "data_gap_audit.md"
METRICS = ("REVENUE", "COST_OF_REVENUE", "OPERATING_PROFIT", "NET_PROFIT", "TOTAL_EQUITY")

# Inspect the original cell and current-period column independently of the production parser.
INSPECT = r"""
const X=require('xlsx'), fs=require('node:fs');
const [file,date]=process.argv.slice(2), bytes=fs.readFileSync(file);
const norm=v=>String(v??'').normalize('NFKC').replace(/[يك‌]/g,c=>({'ي':'ی','ك':'ک','‌':''}[c]))
 .replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'?0x6f0:0x660)));
const key=v=>norm(v).replace(/[^\p{L}\p{N}]/gu,'');
const patterns={REVENUE:/^(?:جمع)?درآمد(?:های)?عملیاتی$/,COST_OF_REVENUE:/^بهایتمامشده(?:درآمد(?:های)?عملیاتی|فروش)?$/,
 OPERATING_PROFIT:/^سود(?:زیان)?عملیاتی$/,NET_PROFIT:/^سود(?:زیان)?خالص(?:دوره|سال)?$/,
 TOTAL_EQUITY:/^(?:جمع|کل)?حقوق(?:مالکانه|صاحبانسهام)$/};
const units=new Set(), rows=[], grids=[]; const header=/کلیه مبالغ[^<\n]{0,85}|(?:هزار|میلیون|میلیارد)\s*(?:ریال|تومان)/g;
for(const x of norm(bytes.toString('utf8')).match(header)??[])units.add(x);
try {
 const book=X.read(bytes);
 for(const name of book.SheetNames){
  const sheet=X.utils.sheet_to_json(book.Sheets[name],{header:1,blankrows:false});
  for(const row of sheet.slice(0,12))for(const c of row)for(const x of norm(c).match(header)??[])units.add(x);
  const first=sheet[0]??[];
  if(key(first[0])==='شرح') grids.push({sheet:name,columnHeader:norm(first[1]),
    headerBelow:norm(sheet[1]?.[1]),productionDateGate:norm(first[1]).includes(date)&&/^(دوره منتهی|به تاریخ)/.test(norm(first[1])),
    productionAuditGate:/حسابرسی (شده|نشده)/.test(norm(sheet[1]?.[1]))});
  for(let i=1;i<first.length;i++){
   const h=norm(first[i]);if(!h.includes(date)||! /^(دوره منتهی|به تاریخ)/.test(h))continue;
   for(const line of sheet.slice(1))for(const [metric,pattern] of Object.entries(patterns)){
    if(!pattern.test(key(line[0])))continue;
    const raw=norm(line[i]).trim(),n=raw.replace(/[,٬\s]/g,'').replace(/^\((.*)\)$/,'-$1');
    if(/^-?\d+(?:\.\d+)?$/.test(n)) rows.push({metric,label:String(line[0]),raw,value:n,sheet:name});
   }
  }
 }
 console.log(JSON.stringify({sheets:book.SheetNames,units:[...units],rows,grids}));
} catch(e){console.log(JSON.stringify({sheets:[],units:[...units],rows,grids,error:e.message}));}
"""


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"), parse_float=Decimal)


def candidate_date(p):
    return f"{p[0]}/{p[1]:02}/{p[2]:02}"


def workbook_index():
    result = {}
    for path in sorted(CACHE.rglob("*")):
        if path.suffix.lower() in {".xls", ".xlsx", ".html", ".htm"} and path.stem.isascii() and path.stem.isdecimal():
            result.setdefault(path.stem, []).append(path)
    return result


def inspect(path, when):
    result = run(["node", "-", str(path), when], input=INSPECT, text=True, encoding="utf-8",
                 capture_output=True, cwd=ROOT, check=True)
    # With node - the script receives its arguments after the stdin sentinel.
    findings = json.loads(result.stdout)
    parsed = run(["node", str(HERE / "extract_codal_workbook.mjs"), str(path), "financial_statements", when],
                 capture_output=True, encoding="utf-8", cwd=ROOT)
    if parsed.returncode:
        findings["parser"] = next((line.strip() for line in parsed.stderr.splitlines()
                                   if line.startswith(("Error:", "TypeError:", "SyntaxError:"))),
                                  parsed.stderr.strip() or "Parser failed without a reason")
        findings["facts"] = {}
    else:
        findings["parser"] = "Parsed current grid"
        findings["facts"] = json.loads(parsed.stdout)
    return findings


def nearest_factor(a, b):
    return max(abs(a / b), abs(b / a))


def main():
    manifest = read(DATA / "manifest.json")["data"]
    index = read(DATA / manifest["masterIndex"]["path"])["data"]["instruments"]
    files = workbook_index()
    report = ["# Offline Codal data gap audit", "", f"Release: `{manifest['releaseId']}`.",
              "Scope: canonical parent standalone filings. Amounts exported in IRR; archive raw values are million IRR.",
              "Only tracing-number-linked workbooks are used. A missing local file does not establish that it was never downloaded elsewhere.",
              "Ratio jumps are screening flags. Interim versus annual comparisons are explicitly marked incomparable.", ""]
    totals = Counter()
    inspected = {}

    def check_workbook(path, when):
        key = path, when
        if key not in inspected:
            inspected[key] = inspect(path, when)
        return inspected[key]

    for instrument in index:
        ticker = instrument["tickerFa"]
        evidence_path = CACHE / f"{ticker}.json"
        evidence = read(evidence_path) if evidence_path.is_file() else {}
        archive = read(ARCHIVES / f"{ticker}_Archive.json")["financial_statements"]
        detail = read(DATA / instrument["detail"]["path"])["data"] if instrument["detail"] else {}
        by_year = {row["fiscalYear"]:row for row in detail.get("statements", [])
                   if not row["isFixture"] and row["consolidationScope"] == "standalone"}
        source_map = {row["id"]:row for row in detail.get("sources", [])}
        from urllib.parse import parse_qs, urlsplit
        def serial(url):
            return (parse_qs(urlsplit(url or "").query).get("LetterSerial") or [None])[0]
        eligible, excluded = {}, Counter()
        for row in evidence.get("letters", []):
            p = period(row.get("Title"))
            if not p or compact(row.get("LetterCode")) != "ن10":
                continue
            if not ((1400 <= p[0] <= 1404 and p[3] == 12) or (p[0] == 1405 and p[3] in {3,6,9})):
                continue
            if not verified_parent(ticker,row) or row.get("IsEstimate"):
                excluded[p[0]] += 1
                continue
            eligible.setdefault(p[0],[]).append((p,row))
        report.extend([f"## {instrument['issuerId']} · {ticker}", "",
                       f"Search cache: {len(evidence.get('letters', []))} notices, complete={bool(evidence.get('complete'))}.", ""])
        previous = {}
        for year in range(1400,1406):
            statement = by_year.get(year)
            facts = {x["code"]:Decimal(x["value"]) if x["value"] is not None else None
                     for x in (statement or {}).get("facts", [])}
            candidates = sorted(eligible.get(year, []), key=lambda item: (
                item[0][3], audited(item[1]["Title"]) is True, amended(item[1]["Title"]),
                publication(item[1]["PublishDateTime"]), int(trace_number(item[1]) or 0)), reverse=True)
            source = source_map.get((statement or {}).get("sourceId"), {})
            actual_serial = serial(source.get("url"))
            exact = next(((p,r) for p,r in candidates if actual_serial and serial(r.get("Url")) == actual_serial),None)
            selected = exact or (candidates[0] if candidates else None)
            local_rows = [row for row in archive if str(row.get("period","")).startswith(str(year))
                          and (year == 1405 and not row["period"].endswith("12M") or year < 1405 and row["period"].endswith("12M"))]
            missing = [key for key in METRICS if facts.get(key) is None or facts.get(key) == 0]
            status = "EXPORTED" if statement else "NOT_IN_SEARCH_CACHE"
            selected_files = files.get(trace_number(selected[1]),[]) if selected else []
            if not statement or missing:
                if selected:
                    status = "WORKBOOK_EXISTS_UNPARSED" if selected_files else "SEARCH_METADATA_ONLY"
                    if statement:
                        status = "EXPORTED_WITH_ZERO_OR_NULL / " + status
            totals[status.split(" / ")[-1]] += 1
            label = f'{statement["periodMonths"]}M' if statement else f'{selected[0][3]}M' if selected else 'latest interim' if year==1405 else '12M'
            report.extend([f"### {year} · {label} · {status}", "",
                f"Eligible notices: {len(candidates)}. Excluded identity/scope/estimate notices: {excluded[year]}.",
                "Legacy archive: " + ("; ".join(f'{r["period"]}: {r.get("title","")}' for r in local_rows) or "no matching period") + "."])
            if not evidence.get("complete") and not selected:
                report.append("The cache is incomplete; publication status is unverified.")
            if selected:
                report.append(f"Selected trace: {trace_number(selected[1])} ({candidate_date(selected[0])}) · {selected[1]['Title']}.")
            report.append("Exported IRR: " + (", ".join(f"{key}={facts.get(key)}" for key in METRICS) if statement else "none"))
            observations = []
            if selected:
                for p,row in candidates:
                    for path in files.get(trace_number(row), []):
                        result = check_workbook(path, candidate_date(p))
                        report.append(f"- Workbook `{path.relative_to(ROOT).as_posix()}` · trace {trace_number(row)} · "
                                      f"sheets: {', '.join(result['sheets']) or 'none readable'} · "
                                      f"unit headers: {'; '.join(result['units']) or 'not found'} · parser: {result['parser']}")
                        if result["parser"] != "Parsed current grid":
                            for grid in result.get("grids", []):
                                report.append(f'  - Grid {grid["sheet"]}: «{grid["columnHeader"]}» / «{grid["headerBelow"]}»; '
                                              f'date gate={grid["productionDateGate"]}, audit gate={grid["productionAuditGate"]}.')
                        if trace_number(row) != trace_number(selected[1]):
                            continue
                        observations.extend(result["rows"])
                        report.append("  - Parser raw extracted values: " + (json.dumps(result["facts"],ensure_ascii=False) if result["facts"] else "none"))
                        for cell in result["rows"]:
                            metric = cell["metric"]
                            if metric in missing and Decimal(cell["value"]) != 0:
                                report.append(f"  - NONZERO_WORKBOOK_ROW: {metric} · {cell['sheet']} · «{cell['label']}» = {cell['raw']}.")
                                totals["NONZERO_WORKBOOK_ROW"] += 1
            if statement:
                current_units = sorted({unit for path in selected_files for unit in
                                        check_workbook(path, candidate_date(selected[0]))["units"]})
                for metric in ("REVENUE","NET_PROFIT","TOTAL_EQUITY"):
                    value = facts.get(metric)
                    older = previous.pop(metric,None)
                    if value is not None:
                        previous[metric] = (year,statement["periodMonths"],value)
                    if not older or older[0] != year-1 or not older[2] or not value:
                        continue
                    factor = nearest_factor(older[2],value)
                    if factor > 10:
                        comparable = metric == "TOTAL_EQUITY" or older[1] == statement["periodMonths"]
                        raw = "; ".join(f'{x["sheet"]} «{x["label"]}»: {x["raw"]}'
                                        for x in observations if x["metric"] == metric)
                        report.append(f"- SCALE_REVIEW {metric}: {older[0]}={older[2]} IRR → {year}={value} IRR "
                                      f"({factor:.2f}× magnitude, {'comparable duration or balance' if comparable else 'annual vs interim — incomparable flow'}). "
                                      f"Current workbook raw: {raw or 'unavailable'}; "
                                      f"unit headers: {', '.join(current_units) or 'unavailable'}. ")
                        totals["SCALE_REVIEW"] += 1
            report.append("")
    report.extend(["## Counters", "", *[f"- {key}: {value}" for key,value in sorted(totals.items())]])
    REPORT.write_text("\n".join(report)+"\n", encoding="utf-8")
    print(json.dumps({"report":str(REPORT),"issuers":len(index),"periods":len(index)*6,
                      "workbook_periods_inspected":len(inspected),"counts":dict(totals)},ensure_ascii=True))


if __name__ == "__main__":
    main()
