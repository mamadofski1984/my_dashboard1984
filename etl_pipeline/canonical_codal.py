from concurrent.futures import ThreadPoolExecutor
"""Canonical parent-issuer selection against first-party Codal search metadata."""
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from subprocess import run
import json
from urllib.parse import parse_qs, urljoin, urlsplit
import re
import unicodedata

EVIDENCE = Path(__file__).resolve().parent / "codal_evidence"
CODAL = "https://www.codal.ir/"
REGISTRY_PATH = Path(__file__).resolve().parents[1] / "public" / "Dashboard_Data" / "index.json"
ISSUER_REGISTRY = {row["ticker"]: row for row in json.loads(REGISTRY_PATH.read_bytes())}
PARENT_NAMES = {ticker: row["codalName"] for ticker, row in ISSUER_REGISTRY.items()}
DIGITS = str.maketrans("يكۀةى۱۲۳۴۵۶۷۸۹۰١٢٣٤٥٦٧٨٩٠", "یکههی12345678901234567890")
DATE = re.compile(r"(?<!\d)(14\d{2})[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?!\d)")


def normalized(value):
    return unicodedata.normalize("NFKC", str(value or "")).translate(DIGITS).replace("أ", "ا").replace("\u200c", " ")


def compact(value):
    return "".join(character for character in normalized(value) if character.isalnum())


def publication(value):
    raw = normalized(value)
    date = DATE.search(raw)
    clock = re.search(r"\b(\d{1,2}):(\d{2})(?::(\d{2}))?", raw)
    if not date:
        return ""
    stamp = "/".join(part.zfill(2) for part in date.groups())
    return stamp + (" " + ":".join((part or "00").zfill(2) for part in clock.groups()) if clock else "")


def standalone_title(title, parent_name, *, allow_combined=False):
    text = normalized(title)
    if not allow_combined and "تلفیقی" in text and not re.search(r"غیر[\s-]*تلفیقی", text):
        return False
    # The qualifier can contain nested legal-form parentheses and may be
    # followed by an amendment marker. Check every company qualifier.
    expected = compact(parent_name).removeprefix("شرکت")
    for match in re.finditer(r"\(\s*(?:شرکت\s+)+([^()]+)", text):
        name = compact(match[1]).removesuffix("سهامیخاص").removesuffix("سهامیعام")
        if name != expected:
            return False
    return True


def verified_parent(ticker, official, *, allow_combined=False):
    return (compact(official.get("Symbol")) == compact(ticker)
            and compact(official.get("CompanyName")).removeprefix("شرکت") == compact(PARENT_NAMES[ticker])
            and standalone_title(official.get("Title"), PARENT_NAMES[ticker], allow_combined=allow_combined))


def period(title):
    text = normalized(title)
    end = DATE.search(text)
    if end is None:
        return None
    month_count = re.search(r"(\d+)\s*ماهه", text)
    months = int(month_count[1]) if month_count else 12 if "سال مالی منتهی" in text else None
    return (int(end[1]), int(end[2]), int(end[3]), months)


def amended(title):
    return "اصلاحیه" in normalized(title)


def audited(title):
    text = compact(title)
    if "حسابرسینشده" in text:
        return False
    return True if "حسابرسیشده" in text else None


def official_url(row):
    value = row.get("Url") or ""
    url = urljoin(CODAL, value)
    return url if value and urlsplit(url).hostname in {"codal.ir", "www.codal.ir"} and url.startswith("https://") else ""


def serial(url):
    return (parse_qs(urlsplit(url or "").query).get("LetterSerial") or [""])[0]


def trace_number(row):
    trace = str(row.get("TracingNo") or "")
    return trace if trace.isascii() and trace.isdecimal() else ""


def pick(rows, slot, rank):
    groups = defaultdict(list)
    for row in rows:
        groups[slot(row)].append(row)
    winners = {key: max(items, key=rank) for key,items in groups.items()}
    return winners, len(rows) - len(winners)


def local_statement_workbooks(root, ticker):
    if root is None:
        return []
    candidates = []
    for file in sorted(root.glob(f"*/{ticker}/02_Financial_Statements/*.xls")):
        match = re.match(r"(14\d{2})_(0?[369]|12)M_", file.name)
        if match:
            candidates.append((file, *match.groups()))

    def parse(candidate):
        file, year, months = candidate
        result = run(["node", str(Path(__file__).with_name("extract_codal_workbook.mjs")), str(file),
                      "financial_statements", year, "--audit", "standalone_sections"],
                     capture_output=True, check=False)
        if result.returncode:
            return None
        payload = json.loads(result.stdout)
        return dict(file=file, year=int(year), months=int(months), date=payload["periodEndJalali"],
                    audited=audited(file.stem.replace("_", " ")), amended=amended(file.stem),
                    facts={key: Decimal(value) for key, value in payload["facts"].items()})

    with ThreadPoolExecutor(max_workers=4) as pool:
        return [item for item in pool.map(parse, candidates) if item is not None]


def canonicalize(ticker, archive, evidence, workbook_dir=None, local_codal_dir=None):
    if compact(archive.get("meta", {}).get("ticker")) != compact(ticker):
        raise ValueError(f"Archive identity mismatch: {ticker}")
    rows = evidence.get("letters", [])
    report = Counter()
    identity_rejections = []
    announcements = []
    official_matches = Counter((compact(letter.get("Title")), publication(letter.get("PublishDateTime"))) for letter in rows)
    for row in rows:
        if not trace_number(row) or not official_url(row) or not publication(row.get("PublishDateTime")):
            continue
        combined_financial = (compact(row.get("LetterCode")) == "ن10"
                              and re.search(r"صورت\s*های مالی", normalized(row.get("Title"))))
        if not verified_parent(ticker, row, allow_combined=combined_financial):
            identity_rejections.append(row)
            continue
        if not row.get("IsEstimate"):
            announcements.append(row)
    report["rejected_identity_or_scope"] = len(identity_rejections)

    financial, monthly, interpretations, disclosures = [], [], [], []
    periods = {}
    for row in announcements:
        title = normalized(row["Title"])
        parsed = period(title)
        if parsed:
            year, month, day, months = parsed
            periods[trace_number(row)] = (year, month, day, months)
            if "گزارش فعالیت ماهانه" in title and months == 1 and 1403 <= year <= 1405:
                monthly.append(row)
            elif "گزارش تفسیری مدیریت" in title and months in {3, 6, 9, 12}:
                interpretations.append(row)
            elif compact(row.get("LetterCode")) == "ن10" and re.search(r"صورت\s*های مالی", title) and (
                (1400 <= year <= 1404 and months == 12) or (year == 1405 and months in {3, 6, 9})
            ):
                financial.append(row)
        if re.search(r"افشای اطلاعات با\s*اهمیت", title) and re.search(r"گروه\s*[الفب]+\b", title):
            disclosures.append(row)

    def date_rank(row):
        return publication(row["PublishDateTime"]), int(trace_number(row))

    def audit_rank(row):
        return audited(row["Title"]) is True, amended(row["Title"]), *date_rank(row)

    def annual_rank(row):
        return verified_parent(ticker, row), periods[trace_number(row)][3], *audit_rank(row)

    finance, report["financial_replacements"] = pick(financial, lambda row: periods[trace_number(row)][0], annual_rank)
    sales, report["monthly_replacements"] = pick(monthly, lambda row: periods[trace_number(row)][:2],
                                                 lambda row: (amended(row["Title"]), *date_rank(row)))
    report["monthly_codal_slots"] = len(sales)
    report["monthly_amended_slots"] = sum(amended(row["Title"]) for row in sales.values())
    report["published_financial_slots"] = len(finance)
    sources = defaultdict(list)
    for category in ("financial_statements", "monthly_sales", "interpretive_reports"):
        for local in archive.get(category, []):
            title = re.sub(r"^گزارش\s+تفسیری\s+مدیریت\s*[-–:]\s*", "", normalized(local.get("title")))
            sources[(category, compact(title), publication(local.get("publish_date")))].append(local)

    def extracted(category, row):
        if not verified_parent(ticker, row):
            return None
        matches = sources[(category, compact(row["Title"]), publication(row["PublishDateTime"]))]
        # A legacy record needs a one-to-one match to the official filing.
        if len(matches) != 1:
            return None
        fingerprint = (compact(row["Title"]), publication(row["PublishDateTime"]))
        return matches[0] if official_matches[fingerprint] == 1 else None

    def workbook_facts(category, row):
        if workbook_dir is None:
            return None
        file = workbook_dir / (trace_number(row) + ".xls")
        if not file.is_file():
            return None
        year, month, day, _ = periods[trace_number(row)]
        proc = run(["node", str(Path(__file__).with_name("extract_codal_workbook.mjs")), str(file),
                    category, f"{year}/{month:02}/{day:02}", "",
                    "standalone_sections" if not verified_parent(ticker, row) else ""],
                   capture_output=True, check=False)
        if proc.returncode:
            report["workbook_extraction_errors"] += 1
            return None
        return {key: Decimal(value) for key,value in json.loads(proc.stdout).items()}

    def has_financial_facts(local):
        return local is not None and any(type(local.get(key)) in (int, Decimal) for key in
                                         ("revenue", "net_profit", "total_equity", "total_assets"))

    def tagged(local, official, period_label):
        return {**local, "period": period_label, "title": official["Title"],
                "publish_date": publication(official["PublishDateTime"]), "codal_url": official_url(official),
                "tracing_no": trace_number(official), "is_audited": audited(official["Title"])}

    canonical = dict(financial_statements=[], monthly_sales=[], interpretive_reports=[], important_disclosures=[])
    missing_financial = {}
    finance_slots = {}
    extraction_needed = []
    portfolio_months = []
    unlinked_disclosure_traces = []
    local_workbooks = local_statement_workbooks(local_codal_dir, ticker)
    for year in range(1400, 1406):
        row = finance.get(year)
        if row is None:
            missing_financial[year] = "not_found_in_codal_search" if evidence.get("complete") else "source_coverage_unverified"
            continue
        fiscal_period = periods[trace_number(row)]
        finance_slots[year] = fiscal_period
        local = extracted("financial_statements", row)
        verified_facts = workbook_facts("financial_statements", row)
        y, month, day, duration = fiscal_period
        matches = [item for item in local_workbooks if item["date"] == f"{y}/{month:02}/{day:02}"
                   and item["months"] == duration and item["audited"] == audited(row["Title"])
                   and item["amended"] == amended(row["Title"])]
        if verified_facts or len(matches) == 1:
            local = {**(local or {}), **(matches[0]["facts"] if len(matches) == 1 else {}), **(verified_facts or {})}
        if not has_financial_facts(local):
            extraction_needed.append({"category":"financial_statements", "period":list(fiscal_period), "letter":row})
            # The source of a backfilled statement remains the exact older
            # official filing, never the unextracted preferred filing.
            fallback = None
            if year <= 1404:
                known = sorted((candidate for candidate in financial
                                if candidate is not row and periods[trace_number(candidate)] == fiscal_period),
                               key=audit_rank, reverse=True)
                for candidate in known:
                    older = extracted("financial_statements", candidate)
                    if has_financial_facts(older):
                        fallback = (candidate, older)
                        break
            if fallback is None:
                missing_financial[year] = "published_extraction_missing"
                continue
            row, local = fallback
            finance[year] = row
            report["verified_annual_backfills"] += 1
        canonical["financial_statements"].append(tagged(local, row, f"{year}_{fiscal_period[3]:02}M"))

    # Safe fallback for reports available only in the issuer-scoped archive.
    for year in sorted(missing_financial.keys() & set(range(1400, 1405))):
        matches = [item for item in local_workbooks if item["year"] == year and item["months"] == 12
                   and has_financial_facts(item["facts"])]
        if not matches:
            continue
        selected = max(matches, key=lambda item: (item["audited"] is True, item["amended"], item["file"].name))
        canonical["financial_statements"].append(dict(
            selected["facts"], period=f"{year}_12M", title=f"صورت‌های مالی سالانه منتهی به {selected['date']}",
            is_audited=selected["audited"], codal_url=None, publish_date=None, local_workbook=selected["file"].name))
        del missing_financial[year]
        report["verified_annual_backfills"] += 1

    for (year,month),row in sorted(sales.items()):
        if compact(row.get("LetterCode")) == "ن31":
            # Portfolio activity states holdings, disposals and dividends; it
            # does not establish consolidated monthly sales from operations.
            report["monthly_portfolio_not_comparable"] += 1
            portfolio_months.append(f"{year}/{month:02}")
            continue
        local = extracted("monthly_sales", row)
        if local is None or type(local.get("monthly_revenue")) not in (int,Decimal):
            local = workbook_facts("monthly_sales", row)
        if local is None or type(local.get("monthly_revenue")) not in (int,Decimal):
            report["monthly_extraction_missing"] += 1
            extraction_needed.append({"category":"monthly_sales", "period":[year,month], "letter":row})
            continue
        canonical["monthly_sales"].append(tagged(local,row,f"{year}/{month:02}"))

    statement_by_year = {int(row["period"][:4]): row for row in canonical["financial_statements"]}
    for year, fiscal_period in finance_slots.items():
        statement = statement_by_year.get(year)
        if not statement:
            continue
        exact = [row for row in interpretations if periods[trace_number(row)] == fiscal_period
                 and audited(row["Title"]) == statement["is_audited"]]
        if exact:
            report_row = max(exact,key=audit_rank)
        else:
            official_statement = finance.get(year)
            if official_statement is None or extracted("interpretive_reports", official_statement) is None:
                report["interpretive_unverified"] += 1
                continue
            report_row = official_statement
        canonical["interpretive_reports"].append(tagged({},report_row,statement["period"]))

    # A report may be filed as an attachment to a financial notice. Verify
    # its title, publication and parent issuer independently of financial scope.
    verified_commentaries = list(interpretations)
    for notice in announcements:
        key = ("interpretive_reports", compact(notice["Title"]), publication(notice["PublishDateTime"]))
        if len(sources[key]) == 1 and official_matches[key[1:]] == 1 and periods.get(trace_number(notice), (None, None, None, None))[3] in {3, 6, 9, 12}:
            verified_commentaries.append(notice)
    if verified_commentaries:
        latest_report = max(verified_commentaries, key=date_rank)
        if trace_number(latest_report) not in {row["tracing_no"] for row in canonical["interpretive_reports"]}:
            year, _, _, months = periods[trace_number(latest_report)]
            canonical["interpretive_reports"].append(tagged({}, latest_report, f"{year}_{months:02}M"))

    groups = {"الف":"گروه_الف","ب":"گروه_ب"}
    valid_disclosures = [row for row in disclosures if re.search(r"گروه\s*(الف|ب)\b", normalized(row["Title"]))]
    for row in valid_disclosures:
        if amended(row['Title']) or row.get('ParentTracingNo') or row.get('OriginalTracingNo'):
            continue
        group = re.search(r"گروه\s*(الف|ب)\b",normalized(row["Title"]))[1]
        canonical["important_disclosures"].append({**tagged({},row,""), "group":groups[group]})
    report["exported_monthly_amendments"] = sum(amended(row["title"]) for row in canonical["monthly_sales"])
    audit = {**report, "portfolio_months":portfolio_months, "unlinked_disclosure_traces":unlinked_disclosure_traces, "missing_monthly": [item["period"] for item in extraction_needed if item["category"] == "monthly_sales"], "codal_search_complete": evidence.get("complete",False), "missing_financial":missing_financial,
             "monthly_count":len(canonical["monthly_sales"]), "interpretive_count":len(canonical["interpretive_reports"]),
             "disclosure_count":len(canonical["important_disclosures"]),
             "statements":[{"period":row["period"],"audited":row["is_audited"],"tracingNo":row.get("tracing_no"), "localWorkbook":row.get("local_workbook")}
                           for row in canonical["financial_statements"]], "extraction_needed":extraction_needed}
    return canonical, audit
