"""Workbook acquisition helpers for the manual Spyder Codal runner."""
from urllib.parse import urlsplit

from fetch_codal_evidence import request


def download(letter, directory):
    parsed = urlsplit(letter.get("ExcelUrl") or "")
    if parsed.scheme != "https" or parsed.netloc != "excel.codal.ir" or not parsed.path.startswith("/service/Excel/GetAll/"):
        raise ValueError("No supported official Excel link")
    trace = str(letter["TracingNo"])
    if not trace.isascii() or not trace.isdecimal():
        raise ValueError("Invalid Codal tracing number")
    destination = directory / f"{trace}.xls"
    if destination.is_file():
        return destination
    payload = request(parsed.geturl(), follow_redirects=True)
    # Codal may respond with HTML even for Excel. A login/error page is not a workbook.
    if not (payload.startswith((b"PK", b"\xd0\xcf\x11\xe0")) or b"<table" in payload.lower()):
        raise ValueError("Codal did not return a workbook containing a table")
    directory.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(payload)
    temporary.replace(destination)
    return destination


if __name__ == "__main__":
    print("Open run_codal_spyder.py in Spyder and press F5 to resume workbook acquisition.")
