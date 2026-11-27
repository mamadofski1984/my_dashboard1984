"""Run this file manually with F5 in Spyder. This is the sole collector entry point."""
from contextlib import closing
from decimal import Decimal
from pathlib import Path
from subprocess import CalledProcessError
import json
import sqlite3
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from canonical_codal import ISSUER_REGISTRY, canonicalize, trace_number
from fetch_codal_evidence import CACHE, RateLimited, TICKERS, page
from fetch_codal_workbooks import download

ARCHIVES = ROOT.parent / "public" / "Dashboard_Data"
STATE = CACHE / "checkpoints.sqlite"
WORKBOOKS = CACHE / "workbooks"
ISSUERS = {ticker: row["code"] for ticker, row in ISSUER_REGISTRY.items()}
# Use None for all issuers, or specify one Persian ticker for a targeted run.
TARGET_TICKER = None

# Enable for one ticker. Leave enabled when resuming with F5.
REFRESH_SEARCH = False
DOCUMENTS_ONLY = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS checkpoints (
    issuer_id TEXT NOT NULL, task_type TEXT NOT NULL, period_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','partial','done','rate_limited')),
    detail TEXT NOT NULL,
    PRIMARY KEY(issuer_id,task_type,period_key)
);
CREATE TABLE IF NOT EXISTS pages (
    issuer_id TEXT NOT NULL, year INTEGER NOT NULL, page_no INTEGER NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(issuer_id,year,page_no)
);
"""


def checkpoint(db, issuer, task, period, status, detail=""):
    db.execute("""INSERT INTO checkpoints VALUES(?,?,?,?,?)
        ON CONFLICT(issuer_id,task_type,period_key)
        DO UPDATE SET status=excluded.status,detail=excluded.detail""",
        (issuer, task, str(period), status, detail))


def save_evidence(path, letters, complete):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"complete": complete, "letters": list(letters.values())},
                                    ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def get_evidence(db, ticker, issuer):
    refresh = REFRESH_SEARCH
    # Keep parent-only pagination separate from older cached search pages.
    page_key = f"{issuer}:parent_only" if refresh else issuer
    task = "parent_search" if refresh else "search"
    destination = CACHE / f"{ticker}.json"
    existing = json.loads(destination.read_bytes()) if destination.is_file() else {}
    refreshed = db.execute(
        "SELECT status FROM checkpoints WHERE issuer_id=? AND task_type='search_refresh' AND period_key='all'",
        (issuer,),
    ).fetchone()
    if existing.get("complete") and (not refresh or refreshed == ("done",)):
        with db:
            for year in range(1400, 1406):
                checkpoint(db, issuer, "search", year, "done", "Complete pre-existing evidence")
        return existing
    letters = {trace_number(row): row for row in (existing.get("letters", []) if not refresh else []) if trace_number(row)}
    for year in range(1400, 1406):
        start = f"{year}/01/01"
        end = f"{year}/12/{30 if year == 1403 else 29}"
        saved = dict(db.execute("SELECT page_no,payload FROM pages WHERE issuer_id=? AND year=?", (page_key,year)))
        page_count = json.loads(saved[1])["Page"] if 1 in saved else 1
        number = 1
        while number <= page_count:
            if number in saved:
                response = json.loads(saved[number])
            else:
                try:
                    response = page(ticker, number, start, end, parent_only=refresh)
                except Exception as error:
                    with db:
                        checkpoint(db,issuer,task,year,"rate_limited" if isinstance(error,RateLimited) else "partial",str(error))
                    if not refresh:
                        save_evidence(destination, letters, False)
                    raise
                with db:
                    db.execute("INSERT INTO pages VALUES(?,?,?,?)",
                               (page_key,year,number,json.dumps(response,ensure_ascii=False)))
                    checkpoint(db,issuer,task,year,"partial",f"Page {number} checkpointed")
                saved[number] = json.dumps(response, ensure_ascii=False)
            page_count = max(1, json.loads(saved[1])["Page"])
            letters.update((trace_number(row),row) for row in response["Letters"] if trace_number(row))
            number += 1

        expected = json.loads(saved[1])["Total"]
        observed = {trace_number(row) for payload in saved.values() for row in json.loads(payload)["Letters"]
                    if trace_number(row)}
        if len(observed) < expected:
            with db:
                checkpoint(db,issuer,task,year,"partial","Pagination changed before all expected traces were captured")
                # A changed pagination window needs re-enumeration. The already
                # captured filing metadata remains preserved in the cache.
                db.execute("DELETE FROM pages WHERE issuer_id=? AND year=?", (page_key,year))
            if not refresh:
                save_evidence(destination, letters, False)
            raise RuntimeError(f"{year}: Codal pagination did not cover the expected entries")
        with db:
            checkpoint(db,issuer,task,year,"done",f"{len(observed)} traces")
    save_evidence(destination, letters, True)
    if refresh:
        with db:
            checkpoint(db, issuer, "search_refresh", "all", "done", "Parent-only search completed")
            db.execute("DELETE FROM pages WHERE issuer_id=?", (page_key,))
            for year in range(1400, 1406):
                checkpoint(db, issuer, "search", year, "done", "Parent-only search completed")
    return json.loads(destination.read_bytes())


def checkpoint_canonical(db, issuer, canonical, audit, evidence):
    complete = evidence.get("complete", False)
    monthly = {row["period"] for row in canonical["monthly_sales"]}
    missing = {f"{year}/{month:02}" for year,month in audit["missing_monthly"]}
    monthly_periods = monthly | missing
    blocked_annual = {"published_extraction_missing", "source_coverage_unverified"}
    # Portfolio filings are verified source records with no operating sales metric.
    portfolio = set(audit.get("portfolio_months", []))
    known_months = monthly_periods | portfolio
    if known_months:
        latest = max(known_months)
        known_months |= {f"{year}/{month:02}" for year in range(1403, 1406)
                         for month in range(1,13) if f"{year}/{month:02}" <= latest}
    for period in sorted(known_months):
        status = "partial" if period in missing else "done"
        detail = "Published, no verified total" if period in missing else "Portfolio activity" if period in portfolio else "Verified extraction" if period in monthly else "No eligible report found"
        checkpoint(db,issuer,"monthly_sales",period,status,detail)
    for year in range(1400,1406):
        outcome = audit["missing_financial"].get(year)
        checkpoint(db,issuer,"annual_statement" if year < 1405 else "interim_statement",year,
                   "partial" if outcome in blocked_annual else "done",
                   outcome or "Verified extraction")
    db.execute("DELETE FROM checkpoints WHERE issuer_id=? AND task_type='disclosure'", (issuer,))
    for row in canonical["important_disclosures"]:
        checkpoint(db,issuer,"disclosure",row["tracing_no"],"done",row["group"])
    for group in ("الف", "ب"):
        checkpoint(db,issuer,"disclosure_group",group,"done","Original notices selected")
    report_periods = {row["period"] for row in canonical["interpretive_reports"]}
    for statement in canonical["financial_statements"]:
        period = statement["period"]
        status = "done" if period in report_periods else "partial"
        checkpoint(db,issuer,"interpretive_report",period,status,
                   "Matched report" if period in report_periods else "Matching source not verified")
    unfinished = bool(missing or audit["missing_financial"] and any(
        outcome in {"published_extraction_missing","source_coverage_unverified"} for outcome in audit["missing_financial"].values()
    ) or audit.get("interpretive_unverified"))
    checkpoint(db,issuer,"issuer","all","done" if complete and not unfinished else "partial",
               "Canonical tasks resolved" if complete and not unfinished else "Unresolved canonical tasks")
    return complete and not unfinished


def process_issuer(db, ticker, issuer):
    with db:
        checkpoint(db,issuer,"issuer","all","partial","In progress")
        for year in range(1400,1406):
            for task in ("search", "annual_statement" if year < 1405 else "interim_statement"):
                db.execute("INSERT OR IGNORE INTO checkpoints VALUES(?,?,?,?,?)",
                           (issuer,task,str(year),"pending",""))
        for group in ("الف","ب"):
            db.execute("INSERT OR IGNORE INTO checkpoints VALUES(?,?,?,?,?)",
                       (issuer,"disclosure_group",group,"pending",""))
    evidence = get_evidence(db,ticker,issuer)
    archive_path = ARCHIVES / f"{ticker}_Archive.json"
    archive = json.loads(archive_path.read_bytes(), parse_float=Decimal) if archive_path.is_file() else {"meta":{"ticker":ticker}}
    _, audit = canonicalize(ticker,archive,evidence,WORKBOOKS,ARCHIVES.parent / "Codal_DB")
    interrupted = set(db.execute(
        "SELECT task_type,period_key FROM checkpoints WHERE issuer_id=? AND status IN ('partial','rate_limited')",
        (issuer,),
    ))
    def candidate_key(candidate):
        return "workbook_" + candidate["category"], "/".join(map(str,candidate["period"]))

    for candidate in sorted(audit["extraction_needed"], key=lambda item: candidate_key(item) not in interrupted):
        letter = candidate["letter"]
        task, period = candidate_key(candidate)
        try:
            download(letter,WORKBOOKS)
        except RateLimited:
            with db:
                checkpoint(db,issuer,task,period,"rate_limited",trace_number(letter))
                checkpoint(db,issuer,"issuer","all","rate_limited","HTTP 429")
            raise
        except (RuntimeError, ValueError, OSError, CalledProcessError) as error:
            with db:
                checkpoint(db,issuer,task,period,"partial",str(error))
        else:
            with db:
                checkpoint(db,issuer,task,period,"done","Workbook cached; extraction verified separately")
    canonical, audit = canonicalize(ticker,archive,evidence,WORKBOOKS,ARCHIVES.parent / "Codal_DB")
    with db:
        unresolved_workbooks = {candidate_key(item) for item in audit["extraction_needed"]}
        for task, period in interrupted - unresolved_workbooks:
            if task.startswith("workbook_"):
                checkpoint(db,issuer,task,period,"done","Workbook no longer required for an unresolved canonical slot")
        return checkpoint_canonical(db,issuer,canonical,audit,evidence)


def collect():
    if REFRESH_SEARCH and TARGET_TICKER not in ISSUERS:
        raise ValueError("REFRESH_SEARCH requires one known Persian TARGET_TICKER")
    CACHE.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(STATE)) as db:
        db.executescript(SCHEMA)
        states = dict(db.execute("SELECT issuer_id,status FROM checkpoints WHERE task_type='issuer'"))
        requested = [TARGET_TICKER] if TARGET_TICKER else list(TICKERS)
        if TARGET_TICKER is None:
            requested.sort(key=lambda ticker: (
                states.get("ISS_"+ISSUERS[ticker]) not in {"partial","rate_limited"},
                f"{ticker}.json" in {path.name for path in CACHE.glob("*.json")} and
                json.loads((CACHE / f"{ticker}.json").read_bytes()).get("complete",False),
            ))
        for ticker in requested:
            issuer = "ISS_" + ISSUERS[ticker]
            if TARGET_TICKER and not REFRESH_SEARCH:
                with db:
                    db.execute("DELETE FROM checkpoints WHERE issuer_id=? AND task_type='search_refresh'", (issuer,))
            if states.get(issuer) == "done" and not REFRESH_SEARCH:
                continue
            try:
                done = process_issuer(db,ticker,issuer)
            except Exception as error:
                if isinstance(error, RateLimited):
                    with db:
                        checkpoint(db,issuer,"issuer","all","rate_limited",str(error))
                print(f"{ticker}: {error}. Saved progress. Resume this issuer with F5.", flush=True)
                return
            if not done:
                print(f"{ticker}: unresolved tasks remain. See {STATE}. Resume with F5 before advancing.", flush=True)
                return
            print(f"{ticker}: checkpoint complete", flush=True)


if __name__ == "__main__":
    from codal_documents import document_content
    from export_fixture import export

    if not DOCUMENTS_ONLY:
        collect()
    export()
    try:
        document_content(fetch=True, ticker=TARGET_TICKER)
    except RateLimited as error:
        print(f"{error}. Resume later; finished documents remain cached.")
