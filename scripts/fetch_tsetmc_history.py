"""Build the dashboard's unadjusted TSETMC price history from its active manifest."""

import argparse
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import quote


DATA_DIR = Path(__file__).resolve().parents[1] / "public" / "data"
API = "https://cdn.tsetmc.com/api"
START_GREGORIAN = date(2020, 3, 20)
EPS_CODES = ("EPS", "BASIC_EPS", "EARNINGS_PER_SHARE")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://www.tsetmc.com/",
    "Accept": "application/json",
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def request_json(path):
    command = [
        "curl", "--silent", "--show-error", "--fail", "--connect-timeout", "8",
        "--max-time", "18", "--retry", "2", "--retry-max-time", "40",
    ]
    for name, value in HEADERS.items():
        command.extend(("--header", f"{name}: {value}"))
    command.append(f"{API}/{path}")
    response = subprocess.run(command, capture_output=True, timeout=60, check=False)
    if response.returncode:
        raise ValueError(response.stderr.decode("utf-8", errors="replace").strip())
    return json.loads(response.stdout)


def jalali_date(day):
    """Convert Gregorian to the Solar Hijri date used by TSETMC consumers."""
    year, month = day.year, day.month
    cumulative = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334)
    leap_year = year + (month > 2)
    days = (355666 + 365 * year + (leap_year + 3) // 4
            - (leap_year + 99) // 100 + (leap_year + 399) // 400
            + day.day + cumulative[month - 1])
    cycles, days = divmod(days, 12053)
    jalali_year = -1595 + 33 * cycles
    cycles, days = divmod(days, 1461)
    jalali_year += 4 * cycles
    if days > 365:
        cycles, days = divmod(days - 1, 365)
        jalali_year += cycles
    if days < 186:
        jalali_month, jalali_day = divmod(days, 31)
        jalali_month += 1
    else:
        jalali_month, jalali_day = divmod(days - 186, 30)
        jalali_month += 7
    return f"{jalali_year:04}/{jalali_month:02}/{jalali_day + 1:02}"


def normalize_symbol(symbol):
    return "".join(str(symbol).translate(str.maketrans("يك", "یک")).split()).replace("\u200c", "")


def numeric_code(value):
    code = str(value)
    return code if code.isascii() and code.isdecimal() and int(code) > 0 else None


def resolve_code(instrument, overrides):
    for value in (overrides.get(instrument["instrumentId"]), instrument.get("insCode"), instrument.get("tsetmcInsCode")):
        if code := numeric_code(value):
            return code
    ticker = instrument["tickerFa"]
    result = request_json(f"Instrument/GetInstrumentSearch/{quote(ticker, safe='')}")
    candidates = result.get("instrumentSearch")
    if not isinstance(candidates, list):
        raise ValueError("unexpected TSETMC search response")
    if instrument.get("isin"):
        matches = [row for row in candidates if instrument["isin"] in (row.get("cIsin"), row.get("instrumentID"))]
    else:
        matches = [row for row in candidates if normalize_symbol(row.get("lVal18AFC")) == normalize_symbol(ticker)]
    codes = {code for row in matches if (code := numeric_code(row.get("insCode")))}
    if len(codes) > 1:
        active_codes = {code for row in matches if row.get("lastDate") == 1
                        and (code := numeric_code(row.get("insCode")))}
        if len(active_codes) == 1:
            return active_codes.pop()
    if len(codes) != 1:
        raise ValueError(f"expected one exact match, found {len(codes)} ({', '.join(sorted(codes)) or 'none'}); supply insCode override")
    return codes.pop()


def get_prices(code):
    result = request_json(f"ClosingPrice/GetClosingPriceDailyList/{code}/0")
    rows = result.get("closingPriceDaily")
    if not isinstance(rows, list):
        raise ValueError("unexpected TSETMC closing price response")
    by_date = {}
    for row in rows:
        try:
            raw_date = str(row["dEven"])
            if len(raw_date) != 8:
                continue
            day = datetime.strptime(raw_date, "%Y%m%d").date()
            close = Decimal(str(row["pClosing"]))
        except (KeyError, ValueError, InvalidOperation):
            continue
        if day >= START_GREGORIAN and close.is_finite() and close > 0:
            key = jalali_date(day)
            if key in by_date and by_date[key] != close:
                raise ValueError(f"conflicting prices for {key}")
            by_date[key] = close
    if not by_date:
        raise ValueError("no valid closing prices from 1399/01/01 onward")
    return [{"dateJalali": key, "closeIrr": int(value) if value == int(value) else float(value)}
            for key, value in sorted(by_date.items())]


def statement_eps(statement):
    facts = {fact["code"]: fact for fact in statement.get("facts", [])}
    for code in EPS_CODES:
        fact = facts.get(code, {})
        if fact.get("unit") != "IRR" or fact.get("isAdjusted") is True:
            continue
        try:
            value = Decimal(str(fact.get("value")))
        except InvalidOperation:
            continue
        if value.is_finite():
            return int(value) if value == int(value) else float(value)
    return None


def write_history(path, payload):
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as temp:
            temp_path = Path(temp.name)
            json.dump(payload, temp, ensure_ascii=False, separators=(",", ":"), sort_keys=True, allow_nan=False)
            temp.write("\n")
        temp_path.replace(path)
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inscodes", type=Path, help="JSON mapping instrument IDs to verified TSETMC insCodes")
    args = parser.parse_args()
    overrides = read_json(args.inscodes) if args.inscodes else {}
    manifest = read_json(DATA_DIR / "manifest.json")["data"]
    master = read_json(DATA_DIR / manifest["masterIndex"]["path"])["data"]
    destination = DATA_DIR / "tsetmc_history.json"
    history = read_json(destination) if destination.exists() else {"instruments": {}, "epsIrrByRevisionId": {}}
    prices, eps = history["instruments"], history["epsIrrByRevisionId"]
    failures, missing_eps = [], []
    updated = 0
    for instrument in master["instruments"]:
        instrument_id = instrument["instrumentId"]
        detail_asset = instrument.get("detail")
        statements = read_json(DATA_DIR / detail_asset["path"])["data"]["statements"] if detail_asset else []
        superseded = {statement.get("restatedFromRevisionId") for statement in statements if not statement.get("isFixture")}
        active = [statement for statement in statements if not statement.get("isFixture") and not statement.get("isSuperseded")
                  and statement["revisionId"] not in superseded]
        missing = 0
        for statement in active:
            if (value := statement_eps(statement)) is not None:
                eps[statement["revisionId"]] = value
            elif statement["revisionId"] not in eps:
                missing += 1
        if missing:
            missing_eps.append(f"{instrument_id}: {missing}/{len(active)} active revisions")
        try:
            code = resolve_code(instrument, overrides)
            candles = get_prices(code)
            prices[instrument_id] = candles
            updated += 1
            print(f"{instrument_id}: {code}, {len(candles)} closes ({candles[0]['dateJalali']}–{candles[-1]['dateJalali']})", flush=True)
        except (subprocess.TimeoutExpired, OSError, ValueError) as error:
            failures.append((instrument_id, str(error)))
            print(f"{instrument_id}: {error}; retained {len(prices.get(instrument_id, []))} saved closes", flush=True)
    write_history(destination, history)
    print(f"Updated {updated}/{len(master['instruments'])} instruments; {sum(bool(rows) for rows in prices.values())} saved series; {len(eps)} EPS entries.")
    if failures:
        print("Price retrieval failures:")
        for instrument_id, reason in failures:
            print(f"  {instrument_id}: {reason}")
    if missing_eps:
        print("Missing explicit period EPS (verify weighted-average shares or supply unadjusted period EPS):")
        for entry in missing_eps:
            print(f"  {entry}")


if __name__ == "__main__":
    main()
