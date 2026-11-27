from pathlib import Path
import json
import re
import hashlib
import os
import argparse
from decimal import Decimal
from datetime import datetime, timezone
from jsonschema import Draft202012Validator, FormatChecker
from canonical_codal import EVIDENCE, ISSUER_REGISTRY, canonicalize, period
from codal_documents import CACHE as DOCUMENT_CACHE, iranian_text

ROOT = Path(__file__).resolve().parent
ARCHIVES = ROOT.parent / "public" / "Dashboard_Data"
OUTPUT = ROOT.parent / "public" / "data"
CONTRACTS = ROOT / "contracts" / "v1"
IDS = {ticker: row["code"] for ticker, row in ISSUER_REGISTRY.items()}

def obj(**fields):
    return dict(type="object", properties=fields, required=list(fields), additionalProperties=False)

def arr(items):
    return dict(type="array", items=items)

def enum(*values):
    return dict(enum=list(values))

def nullable(field):
    return dict(anyOf=[field, {"type": "null"}])

TEXT = {"type": "string"}
ID = {"type": "string", "pattern": "^[A-Z0-9][A-Z0-9_-]{0,63}$"}
DEC = {"type": "string", "pattern": r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$"}
NUMBER = nullable(DEC)
BOOL = {"type": "boolean"}
INT = {"type": "integer", "minimum": 0}
TIME = {"type": "string", "format": "date-time", "pattern": "Z$"}
FILE = obj(path={"type":"string", "pattern":r"^objects/[a-z0-9_-]+/[a-f0-9]{64}/[A-Za-z0-9_-]+\.(json|webp|png)$"},
           sha256={"type":"string", "pattern":"^[a-f0-9]{64}$"}, bytes=INT)
SOURCE = obj(id=ID, archiveDate=nullable(TEXT), url=nullable(TEXT))
RATIO = obj(code=ID, value=NUMBER, unit=enum("PCT","TIMES","DAYS"),
            status=enum("ok","missing_input","invalid_denominator","not_applicable"),
            formulaVersion=TEXT, missingInputs=arr(ID), inputStatementIds=arr(ID))
RATIO["allOf"] = [{"if": {"properties":{"status":{"const":"ok"}}},
                  "then":{"properties":{"value":DEC}}, "else":{"properties":{"value":{"type":"null"}}}}]
TEMPLATE = enum("manufacturing","banking","holding","exchange_service","other")
STATEMENT = obj(isFixture=BOOL, revisionId=ID, sourceId=ID, fiscalYear=INT, periodMonths=enum(3,6,9,12),
                periodEndJalali=nullable(TEXT), isAudited=nullable(BOOL),
                consolidationScope=enum("standalone","consolidated","unknown"),
                restatedFromRevisionId=nullable(ID), facts=arr(obj(code=ID,value=NUMBER,unit=enum("IRR"))),
                ratios=arr(RATIO))
SUMMARY = obj(summaryType=enum("interpretive_report","material_disclosure"), sourceId=ID,
              titleFa=TEXT, disclosureGroup=nullable(enum("A","B")), impactTag=nullable(enum("positive","negative_short_term","warning","neutral")),
              plainLanguageSummary=nullable(TEXT), investorTakeaway=nullable(TEXT),
              evidenceLocators=arr(obj(docId=ID,page=nullable(INT),section=nullable(TEXT),quote=nullable(TEXT))),
              reviewStatus=enum("source_only","auto_generated","human_verified"))
SUMMARY["properties"]["pdfContent"] = obj(
    status=enum("full_text", "missing_body"),
    main_text=nullable(TEXT),
    attachments=arr(obj(description=TEXT, uploadDate=nullable(TEXT), url=TEXT, text=nullable(TEXT))),
)
VENUE = enum("IME","IRENEX")
QTY = obj(amount=DEC,unit=TEXT)
PRICE = obj(amount=DEC,currency=TEXT,perUnit=TEXT)
SCHEMAS = {
 "manifest": obj(releaseId=ID,publishedAt=TIME,masterIndex=FILE,commodityChain=FILE,macroIndicators=FILE,
                 sourceFreshness=arr(obj(source=TEXT,asOfUtc=nullable(TIME),status=enum("archived","fixture")))),
 "master_index": obj(sectors=arr(obj(id=ID,parentId=nullable(ID),nameFa=TEXT)),
   instruments=arr(obj(instrumentId=ID,issuerId=ID,tickerFa=TEXT,issuerNameFa=nullable(TEXT),
     isin=nullable(TEXT),venue=nullable(enum("TSE","IFB")),aliasesFa=arr(TEXT),searchKey=TEXT,
     sectorId=ID,isPrimaryInstrument=BOOL,coverageState=enum("full","partial","index_only"),
     detail=nullable(FILE),image=nullable(FILE),snapshot=nullable(obj(closePrice=NUMBER,marketCapIrr=NUMBER,peTtm=NUMBER,pb=NUMBER,asOfUtc=TIME))))),
 "symbol": obj(issuerId=ID,sectorTemplate=TEMPLATE,sources=arr(SOURCE),statements=arr(STATEMENT),
    monthlySales=arr(obj(periodJalali=TEXT,sourceId=ID,revenueIrr=NUMBER,productId=nullable(ID),market=enum("total"))),
    summaries=arr(SUMMARY)),
 "commodity_chain": obj(isFixture=BOOL,products=arr(obj(id=ID,nameFa=TEXT)),
    partitions=arr(obj(venue=VENUE,month=TEXT,file=FILE))),
 "commodity_partition": obj(isFixture=BOOL,sources=arr(SOURCE),offers=arr(obj(offerId=ID,productId=ID,sourceId=ID,
    offerVolume=nullable(QTY),demandVolume=nullable(QTY),basePrice=nullable(PRICE))),
    trades=arr(obj(tradeId=ID,offerId=ID,sourceId=ID,tradeDate={"type":"string","format":"date"},tradedVolume=nullable(QTY),
    discoveredPrice=nullable(PRICE),settlementPrice=nullable(PRICE),sellerIssuerId=nullable(ID),buyerIssuerId=nullable(ID),
    buyerVerification=enum("verified_codal_ime","undisclosed","unresolved"),buyerEvidenceSourceIds=arr(ID)))),
 "macro_indicators": obj(isFixture=BOOL,series=arr(obj(id=ID,nameFa=TEXT,family=enum("fx","interest","inflation","money","commodity"),
    unit=TEXT,frequency=enum("daily","monthly","quarterly","annual"),methodologyId=ID,regimeId=nullable(ID),
    partitions=arr(obj(year=INT,file=FILE))))),
 "macro_partition": obj(isFixture=BOOL,seriesId=ID,sources=arr(SOURCE),observations=arr(obj(referencePeriod=TEXT,
    availableAtUtc=TIME,revisionNumber={"type":"integer","minimum":1},isPreliminary=BOOL,value=NUMBER,sourceId=ID))),
}
SCHEMAS["symbol"]["properties"]["periodCoverageNotes"] = arr(obj(
    fiscalYear=INT, periodMonths=enum(12),
    status=enum("published_unextracted", "no_eligible_filing_found"), reason=TEXT,
))

SCHEMAS["symbol"]["properties"]["missingMonthlyPeriods"] = arr(TEXT)

SCHEMAS = {name: {"$schema":"https://json-schema.org/draft/2020-12/schema", "$id":f"urn:market:v1:{name}",
                  **obj(schemaVersion={"const":"1.0"},data=body)} for name,body in SCHEMAS.items()}

def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",",":"), allow_nan=False).encode() + b"\n"

def digest(payload):
    return hashlib.sha256(payload).hexdigest()

def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"), parse_float=Decimal)

def validate(name, data):
    document = {"schemaVersion":"1.0","data":data}
    Draft202012Validator(SCHEMAS[name], format_checker=FormatChecker()).validate(document)
    return encode(document)

def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == payload:
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, path)

def asset(folder, name, payload):
    hash_value = digest(payload)
    path = f"objects/{folder}/{hash_value}/{name}"
    atomic_write(OUTPUT / path, payload)
    return {"path":path,"sha256":hash_value,"bytes":len(payload)}

def symbol_image(ticker, instrument_id):
    for extension in ("png", "webp"):
        path = ARCHIVES.parent / "images" / f"{ticker}.{extension}"
        if path.is_file():
            return asset("images", f"{instrument_id}.{extension}", path.read_bytes())
    return None


def write_contracts():
    for name, schema in SCHEMAS.items():
        Draft202012Validator.check_schema(schema)
        atomic_write(CONTRACTS / f"{name}.schema.json", encode(schema))


def publish_manifest(pointers, source_freshness):
    release = "REL_" + digest(encode(pointers))[:24].upper()
    path = OUTPUT / "manifest.json"
    previous = read(path) if path.exists() else None
    if previous and previous["data"]["releaseId"] == release:
        return
    if previous:
        atomic_write(OUTPUT / "releases" / (previous["data"]["releaseId"] + ".json"), path.read_bytes())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    data = dict(releaseId=release, publishedAt=now, sourceFreshness=source_freshness, **pointers)
    atomic_write(path, validate("manifest", data))


def refresh_symbol_images():
    write_contracts()
    manifest = read(OUTPUT / "manifest.json")["data"]
    master = read(OUTPUT / manifest["masterIndex"]["path"])["data"]
    for instrument in master["instruments"]:
        image = symbol_image(instrument["tickerFa"], instrument["instrumentId"])
        if image is not None:
            instrument["image"] = image
    pointers = {key: manifest[key] for key in ("commodityChain", "macroIndicators")}
    pointers["masterIndex"] = asset("master", "master_index.json", validate("master_index", master))
    publish_manifest(pointers, manifest["sourceFreshness"])


def money(value):
    return None if value is None else format(Decimal(str(value))*1_000_000,"f")

def search_key(value):
    value = value.translate(str.maketrans("يك۱۲۳۴۵۶۷۸۹۰١٢٣٤٥٦٧٨٩٠\u200c", "یک12345678901234567890 "))
    return " ".join(value.casefold().split())

def template(issuer):
    return next((row["sectorTemplate"] for row in ISSUER_REGISTRY.values() if row["code"] == issuer), "other")


def add_statement_ratios(statements, profile):
    def amount(row, code):
        return facts.get(row["revisionId"], {}).get(code) if row else None

    def period_month(row):
        match = re.fullmatch(r"([0-9]{4})/([0-9]{2})/[0-9]{2}", row["periodEndJalali"] or "")
        return int(match[1]) * 12 + int(match[2]) - 1 if match else None

    def percentage(code, numerator, denominator, invalid_inputs=(), applicable=True, inputs=()):
        missing = list(invalid_inputs)
        value = None
        if not applicable:
            status = "not_applicable"
        elif missing:
            status = "missing_input"
        elif denominator <= 0:
            status = "invalid_denominator"
        else:
            status = "ok"
            value = format(numerator / denominator * 100, ".2f")
        return dict(code=code,value=value,unit="PCT",status=status,formulaVersion="1.1",
                    missingInputs=missing if status=="missing_input" else [],inputStatementIds=list(inputs))

    facts = {row["revisionId"]: {fact["code"]: Decimal(fact["value"]) if fact["value"] is not None else None
                                for fact in row["facts"]} for row in statements}
    superseded = {row["restatedFromRevisionId"] for row in statements}
    closing_statements = {}
    for row in statements:
        if row["periodMonths"] != 12 or row["revisionId"] in superseded or row["consolidationScope"] == "unknown":
            continue
        month = period_month(row)
        if month is None:
            continue
        key = (row["consolidationScope"], month)
        existing = closing_statements.get(key)
        if existing is None or existing["isAudited"] is not True or row["isAudited"] is True:
            closing_statements[key] = row

    industrial = profile == "manufacturing"
    financial_profile = profile in {"banking", "holding", "exchange_service"}
    for row in statements:
        revision = row["revisionId"]
        scope = row["consolidationScope"]
        month = period_month(row)
        opening = closing_statements.get((scope, month - row["periodMonths"])) if month is not None else None

        def from_facts(code, numerator_key, denominator_key, applicable=True, absolute=False):
            numerator = amount(row, numerator_key)
            denominator = amount(row, denominator_key)
            missing = [key for key, value in [(numerator_key,numerator), (denominator_key,denominator)] if value is None]
            if absolute and numerator is not None:
                numerator = abs(numerator)
            return percentage(code, numerator, denominator, missing, applicable, [revision])

        profit = amount(row, "NET_PROFIT")
        closing_equity = amount(row, "TOTAL_EQUITY")
        opening_equity = amount(opening, "TOTAL_EQUITY")
        average_equity = (opening_equity + closing_equity) / 2 if opening_equity is not None and closing_equity is not None else None
        missing_roe = [key for key, value in [
            ("NET_PROFIT",profit), ("CLOSING_EQUITY",closing_equity), ("OPENING_EQUITY",opening_equity)] if value is None]
        ratios = [
            from_facts("NET_MARGIN","NET_PROFIT","REVENUE",not financial_profile),
            from_facts("EQUITY_TO_ASSETS","TOTAL_EQUITY","TOTAL_ASSETS"),
            from_facts("LIABILITIES_TO_ASSETS","TOTAL_LIABILITIES","TOTAL_ASSETS"),
            from_facts("GROSS_MARGIN","GROSS_PROFIT","REVENUE",not financial_profile),
            from_facts("OPERATING_MARGIN","OPERATING_PROFIT","REVENUE"),
            percentage("ROE", profit, average_equity, missing_roe, inputs=[revision] + ([opening["revisionId"]] if opening_equity is not None else [])),
            from_facts("COST_TO_REVENUE","COST_OF_REVENUE","REVENUE",industrial,absolute=True),
        ]
        if profile == "banking":
            ratios.append(from_facts("BANK_COST_TO_INCOME","BANK_OPERATING_EXPENSE","BANK_OPERATING_INCOME",absolute=True))
        row["ratios"] = ratios


def symbol(ticker, code, archive):
    sources = []
    statements = []
    sales = []
    summaries = []

    def source(row, category):
        stable = str(row.get("publish_date")) + str(row.get("title")) + str(row.get("codal_url"))
        source_id = "SRC_" + digest(f"{code}:{category}:{stable}".encode())[:20].upper()
        url = row.get("codal_url") or ""
        sources.append(dict(id=source_id,archiveDate=row.get("publish_date"),
                            url=url if url.startswith("https://") else None))
        return source_id

    rows = sorted(archive["financial_statements"], key=lambda row: row.get("publish_date") or "")
    profile = template(code)
    for row in rows:
        match = re.fullmatch(r"(\d{4})_(0?[369]|12)M",row["period"])
        if not match:
            raise ValueError(f"{ticker}: unsupported period {row['period']}")
        year, months = map(int, match.groups())
        end = period(row["title"])
        date = f"{end[0]}/{end[1]:02}/{end[2]:02}" if end else None
        source_id = source(row, "financial")
        revision = "REV_" + source_id[4:]
        values = {key.upper(): value for key,value in row.items()
                  if key not in {"period","is_audited","is_revision","publish_date","title","codal_url","tracing_no"} and
                  (value is None or type(value) in (int,Decimal))}
        capital = values.get("CAPITAL") if values.get("CAPITAL") is not None else values.get("SHARE_CAPITAL")
        if capital is not None and capital > 0:
            values["CAPITAL"] = capital
        if values.get("EPS") is None and capital is not None and capital > 0 and values.get("NET_PROFIT") is not None:
            values["EPS"] = Decimal(values["NET_PROFIT"]) * 1000 / Decimal(capital)
        statements.append(dict(isFixture=False,revisionId=revision,sourceId=source_id,fiscalYear=year,periodMonths=months,
            periodEndJalali=date,isAudited=row.get("is_audited"),
            consolidationScope="standalone",restatedFromRevisionId=None,
            facts=[dict(code=key,value=format(Decimal(value),"f") if key=="EPS" and value is not None else money(value),unit="IRR") for key,value in sorted(values.items())],ratios=[]))
    statements = list({item["revisionId"]: item for item in statements}.values())
    add_statement_ratios(statements, profile)
    for row in archive["monthly_sales"]:
        sales.append(dict(periodJalali=row["period"],sourceId=source(row,"monthly"),
                          revenueIrr=money(row.get("monthly_revenue")),productId=None,market="total"))
    for category, key in [("interpretive_report","interpretive_reports"),("material_disclosure","important_disclosures")]:
        for row in archive[key]:
            ref = source(row, category)
            group = {"گروه_الف":"A","گروه_ب":"B"}.get(row.get("group"))
            summaries.append(dict(summaryType=category,sourceId=ref,titleFa=row.get("title") or "",
              disclosureGroup=group,impactTag=None,plainLanguageSummary=None,investorTakeaway=None,
              evidenceLocators=[],reviewStatus="source_only"))
            document_path = DOCUMENT_CACHE / f"ISS_{code}" / f"{ref}.json"
            if category == "material_disclosure" and document_path.is_file():
                document = json.loads(document_path.read_bytes())
                if "pdfStatus" in document:
                    main = document.get("main_text")
                    attachments = document.get("attachments", [])
                    verified = any(iranian_text(text or "") for text in
                                   [main, *(attachment["text"] for attachment in attachments)])
                    summaries[-1]["pdfContent"] = dict(
                        status="full_text" if verified else "missing_body",
                        main_text=main, attachments=[
                            {key: item[key] for key in ("description", "uploadDate", "url", "text")}
                            for item in attachments
                        ],
                    )
    sources_by_id = {item["id"]:item for item in sources}
    return dict(issuerId=f"ISS_{code}",sectorTemplate=profile,sources=list(sources_by_id.values()),
                statements=list({item["revisionId"]:item for item in statements}.values()),
                monthlySales=sales,summaries=summaries)

def fixtures():
    evidence = [dict(id="SRC_FIXTURE",archiveDate=None,url=None)]
    qty = dict(amount="20",unit="TONNE")
    price = dict(amount="100000",currency="IRR",perUnit="TONNE")
    trades = dict(isFixture=True,sources=evidence,offers=[dict(offerId="OFF_FIXTURE",productId="PRD_FIXTURE",
       sourceId="SRC_FIXTURE",offerVolume=qty,demandVolume=qty,basePrice=price)],
       trades=[dict(tradeId="TRD_FIXTURE",offerId="OFF_FIXTURE",sourceId="SRC_FIXTURE",tradeDate="2026-11-21",
           tradedVolume=qty,discoveredPrice=price,settlementPrice=None,sellerIssuerId=None,buyerIssuerId=None,
           buyerVerification="undisclosed",buyerEvidenceSourceIds=[])])
    macro = dict(isFixture=True,seriesId="CPI_FIXTURE",sources=evidence,observations=[
        dict(referencePeriod="1405-07",availableAtUtc=date,revisionNumber=number,isPreliminary=number==1,
             value=value,sourceId="SRC_FIXTURE")
        for number,date,value in [(1,"2026-11-05T00:00:00Z","120"),(2,"2026-11-21T00:00:00Z","121")]])
    commodity_file = asset("commodity","IME-2026-11.json",validate("commodity_partition",trades))
    macro_file = asset("macro","CPI_FIXTURE-2026.json",validate("macro_partition",macro))
    return (dict(isFixture=True,products=[dict(id="PRD_FIXTURE",nameFa="کالای آزمایشی")],
                 partitions=[dict(venue="IME",month="2026-11",file=commodity_file)]),
            dict(isFixture=True,series=[dict(id="CPI_FIXTURE",nameFa="شاخص آزمایشی",family="inflation",
                unit="INDEX",frequency="monthly",methodologyId="FIXTURE",regimeId=None,partitions=[dict(year=2026,file=macro_file)])]))

def export(audit_only=False):
    if not audit_only and not any(
        path.is_file() and read(path).get("letters") for path in (EVIDENCE / f"{ticker}.json" for ticker in IDS)
    ):
        raise ValueError("No verified Codal evidence cache. Run fetch_codal_evidence.py before exporting.")
    write_contracts()
    instruments, sectors = [], {}
    diagnostics = {}
    extraction_needed = []
    for entry in read(ARCHIVES / "index.json"):
        ticker = entry["ticker"]
        code = IDS[ticker]
        sector = entry["industry"]
        sector_id = "SEC_" + digest(search_key(sector).encode())[:12].upper()
        sectors[sector_id]=dict(id=sector_id,parentId=None,nameFa=sector)
        archive_path = ARCHIVES / f"{ticker}_Archive.json"
        archive = read(archive_path) if archive_path.is_file() else {"meta": {"ticker": ticker}}
        evidence_path = EVIDENCE / f"{ticker}.json"
        evidence = read(evidence_path) if evidence_path.is_file() else {}
        canonical, audit = canonicalize(ticker, archive, evidence, EVIDENCE / "workbooks", ARCHIVES.parent / "Codal_DB")
        extraction_needed.extend(audit.pop("extraction_needed"))
        diagnostics[code] = audit
        if audit_only:
            continue
        has_data = any(canonical.values())
        normalized = symbol(ticker, code, canonical)
        coverage_reasons = {
            "published_extraction_missing": ("published_unextracted", "گزارش غیرتلفیقی پیدا شد؛ استخراج تأیید نشده است."),
            "not_found_in_codal_search": ("no_eligible_filing_found", "گزارش غیرتلفیقی واجد شرایط در جست‌وجوی این نسخه پیدا نشد."),
        }
        normalized["periodCoverageNotes"] = [
            dict(fiscalYear=year,periodMonths=12,status=coverage_reasons[outcome][0],reason=coverage_reasons[outcome][1])
            for year,outcome in audit["missing_financial"].items() if year <= 1404 and outcome in coverage_reasons
        ]
        normalized["missingMonthlyPeriods"] = sorted({
            f"{year}/{month:02}" for year, month in audit["missing_monthly"]
        })
        detail = asset("symbols", f"ISS_{code}.json",validate("symbol",normalized))
        image = symbol_image(ticker, f"INS_{code}")
        name = entry["displayName"]
        aliases = [legacy for legacy, actual in {"kala":"کالا","nan":"نان"}.items() if actual==ticker]
        instruments.append(dict(instrumentId=f"INS_{code}",issuerId=f"ISS_{code}",tickerFa=ticker,issuerNameFa=name,
          isin=entry.get("isin"),venue=entry.get("venue"),aliasesFa=aliases,searchKey=search_key(" ".join([ticker,name or "",*aliases])),
          sectorId=sector_id,isPrimaryInstrument=True,coverageState="partial" if has_data else "index_only",detail=detail if has_data else None,image=image,snapshot=None))
    atomic_write(EVIDENCE / "extraction_plan.json", encode(extraction_needed))
    atomic_write(EVIDENCE / "canonical_audit.json", encode(diagnostics))
    if audit_only:
        return
    commodity, macro = fixtures()
    pointers = dict(
        masterIndex=asset("master","master_index.json",validate("master_index",dict(sectors=list(sectors.values()),instruments=instruments))),
        commodityChain=asset("commodity","commodity_chain.json",validate("commodity_chain",commodity)),
        macroIndicators=asset("macro","macro_indicators.json",validate("macro_indicators",macro)))
    history_path = OUTPUT / "tsetmc_history.json"
    if history_path.exists():
        history = read(history_path)
        eps = history.setdefault("epsIrrByRevisionId", {})
        for instrument in instruments:
            if not instrument["detail"]:
                continue
            statements = read(OUTPUT / instrument["detail"]["path"])["data"]["statements"]
            for statement in statements:
                if statement["isFixture"]:
                    continue
                value = next((fact["value"] for fact in statement["facts"] if fact["code"] == "EPS"), None)
                if value is not None:
                    eps[statement["revisionId"]] = float(value)
        atomic_write(history_path, encode(history))
    publish_manifest(pointers, [
        dict(source="codal_verified_archive", asOfUtc=None, status="archived"),
        dict(source="synthetic", asOfUtc=None, status="fixture"),
    ])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--audit-only", action="store_true")
    modes.add_argument("--images-only", action="store_true")
    options = parser.parse_args()
    if options.images_only:
        refresh_symbol_images()
    else:
        export(options.audit_only)
