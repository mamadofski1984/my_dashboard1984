"""HTTP helpers for the manual Spyder Codal runner."""
from pathlib import Path
from subprocess import run
from urllib.parse import urlencode
import json

from canonical_codal import ISSUER_REGISTRY

TICKERS = list(ISSUER_REGISTRY)
API = "https://search.codal.ir/api/search/v2/q"
CACHE = Path(__file__).resolve().parent / "codal_evidence"


class RateLimited(Exception):
    """Stop the current issuer without retrying in the same run."""


def request(url, timeout=20, follow_redirects=False):
    command = ["curl", "-sS", "--max-time", str(timeout), "-w", "\n%{http_code}"]
    if follow_redirects:
        command += ["-L", "--proto-redir", "=https"]
    result = run([*command, url], capture_output=True, check=True)
    body, _, raw_status = result.stdout.rpartition(b"\n")
    status = int(raw_status)
    if status == 429:
        raise RateLimited("HTTP 429 from Codal")
    if status != 200:
        raise RuntimeError(f"Codal returned HTTP {status}")
    return body


def page(ticker, number, start, end, *, parent_only=False):
    query = urlencode({"Symbol": ticker, "PageNumber": number, "FromDate": start, "ToDate": end})
    if parent_only:
        query += "&Childs=false"
    body = json.loads(request(API + "?" + query))
    if (body.get("IsAttacker") or not isinstance(body.get("Letters"), list) or
            not isinstance(body.get("Page"), int) or not isinstance(body.get("Total"), int)):
        raise ValueError("Invalid Codal search response")
    return body


if __name__ == "__main__":
    print("Open run_codal_spyder.py in Spyder and press F5 to run the checkpointed collector.")
