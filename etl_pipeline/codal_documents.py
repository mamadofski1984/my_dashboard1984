"""Cache document content for active Fundashboard issuers. Offline unless --fetch is supplied."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
from subprocess import CalledProcessError, TimeoutExpired, run
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urljoin, urlsplit

from canonical_codal import EVIDENCE, ISSUER_REGISTRY, period, publication, normalized
from fetch_codal_evidence import RateLimited, request

ROOT = EVIDENCE.parents[1]
DATA = ROOT / "public" / "data"
CACHE = EVIDENCE / "document_content"
FOLDERS = ROOT / "public" / "Codal_DB"
BLOCKS = {"p", "div", "li", "br", "section", "article", "h1", "h2", "h3", "label"}
SKIP = {"script", "style", "noscript", "head"}


def clean(text):
    return " ".join(normalized(text).split())


class DocumentHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.buffer = []
        self.paragraphs = []
        self.tables = []
        self.rows = []
        self.row = []
        self.cell = None
        self.links = []

    def flush(self):
        if text := clean(" ".join(self.buffer)):
            self.paragraphs.append(text)
        self.buffer.clear()

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        if self.skip:
            return
        attrs = dict(attrs)
        if tag in BLOCKS and self.cell is None:
            self.flush()
        if tag == "table":
            self.rows = []
        elif tag == "tr":
            self.row = []
        elif tag in {"th", "td"}:
            self.cell = []
        elif tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        elif tag == "iframe" and attrs.get("src"):
            self.links.append(attrs["src"])
        elif tag in {"input", "textarea"} and attrs.get("type", "").lower() not in {"hidden", "submit", "button"}:
            self.handle_data(attrs.get("value", ""))

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        if self.skip:
            return
        if tag in {"th", "td"} and self.cell is not None:
            self.row.append(clean(" ".join(self.cell)))
            self.cell = None
        elif tag == "tr" and any(self.row):
            self.rows.append(self.row)
        elif tag == "table" and self.rows:
            self.tables.append(self.rows)
            self.rows = []
        elif tag in BLOCKS:
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            (self.buffer if self.cell is None else self.cell).append(data)


def iranian_text(text):
    return len(re.findall(r"[\u0600-\u06ff]", text)) >= 35


def has_verified_body(documents):
    for document in documents:
        paragraphs = document["paragraphs"]
        tables = document["tables"]
        if document["method"] == "html":
            if any("کد امنیتی" in text or "چند لحظه صبر کنید" in text for text in paragraphs):
                continue
            paragraphs = [text for text in paragraphs if "{{" not in text and "نسخه جدیدتر" not in text]
            tables = [table for table in tables if not any(
                "{{" in str(row) or "تاریخ افزوده شدن" in str(row) for row in table
            )]
            if not tables and not any(len(text) >= 80 for text in paragraphs):
                continue
        if iranian_text(" ".join(paragraphs) + json.dumps(tables, ensure_ascii=False)):
            return True
    return False


def pdf_text(payload):
    from io import BytesIO
    from pypdf import PdfReader

    pages = [clean(page.extract_text() or "") for page in PdfReader(BytesIO(payload)).pages]
    if any(iranian_text(page) for page in pages):
        return [page for page in pages if page], "pdf_text"
    if not all(shutil.which(tool) for tool in ("pdftoppm", "tesseract")):
        return [], "ocr_required"
    with TemporaryDirectory() as folder:
        path = Path(folder) / "report.pdf"
        path.write_bytes(payload)
        run(["pdftoppm", "-r", "220", "-png", str(path), str(path.with_suffix(""))],
            check=True, capture_output=True, timeout=300)
        pages = []
        for image in sorted(path.parent.glob("report-*.png"), key=lambda item: int(item.stem.split("-")[-1])):
            result = run(["tesseract", str(image), "stdout", "-l", "fas+eng"], capture_output=True, check=True, timeout=90)
            pages.append(clean(result.stdout.decode("utf-8", errors="replace")))
    return [page for page in pages if page], "ocr"


def parse_payload(payload, url):
    if payload.startswith(b"%PDF"):
        paragraphs, method = pdf_text(payload)
        return {"paragraphs": paragraphs, "tables": [], "method": method, "url": url}, []
    if payload.startswith((b"PK\x03\x04", b"\xd0\xcf\x11\xe0")):
        javascript = """const x=require('xlsx'); const f=require('fs');
const w=x.read(f.readFileSync(0)); console.log(JSON.stringify(w.SheetNames.map(n=>x.utils.sheet_to_json(w.Sheets[n],{header:1,blankrows:false}))));"""
        result = run(["node", "-e", javascript], input=payload, capture_output=True, check=True, cwd=ROOT, timeout=60)
        return {"paragraphs": [], "tables": json.loads(result.stdout), "method": "spreadsheet", "url": url}, []
    html = payload.decode("utf-8-sig", errors="replace")
    parser = DocumentHTML()
    parser.feed(html)
    parser.flush()
    return {"paragraphs": parser.paragraphs, "tables": parser.tables, "method": "html", "url": url}, parser.links


def codal_url(base, href):
    url = urljoin(base, href)
    parts = urlsplit(url)
    if parts.scheme == "https" and parts.hostname in {"www.codal.ir", "codal.ir"} and not parts.username:
        return url
    return None


def download_document(source_url, letter):
    pending = [source_url]
    pending.extend(codal_url("https://www.codal.ir/Reports/", letter[key]) for key in ("PdfUrl", "AttachmentUrl", "ExcelUrl") if letter.get(key))
    visited, documents, errors = set(), [], []
    while pending and len(visited) < 20:
        url = pending.pop(0)
        if not url or url in visited:
            continue
        visited.add(url)
        try:
            document, links = parse_payload(request(url), url)
            documents.append(document)
        except RateLimited:
            raise
        except (RuntimeError, ValueError, ImportError, OSError, CalledProcessError, TimeoutExpired) as error:
            errors.append(str(error))
            continue
        for href in links:
            link = codal_url(url, href)
            if link and re.search(r"DownloadFile|Attachment\.aspx|\.(?:html?|pdf|xlsx?|csv|txt)(?:$|\?)", link, re.I):
                pending.append(link)
    return documents, errors


def today_jalali():
    script = """const p=Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date).map(p=>[p.type,p.value]));console.log([p.year,p.month,p.day].join('/'));"""
    return run(["node", "-e", script], capture_output=True, text=True, check=True).stdout.strip()


def release_documents():
    get = lambda file: json.loads(file.read_bytes())["data"]
    manifest = get(DATA / "manifest.json")
    instruments = get(DATA / manifest["masterIndex"]["path"])["instruments"]
    today = today_jalali()
    cutoff = str(int(today[:4])-1) + today[4:7]
    for instrument in instruments:
        asset = instrument["detail"]
        if not asset:
            continue
        detail = get(DATA / asset["path"])
        sources = {row["id"]: row for row in detail["sources"]}
        reports = sorted(detail["summaries"], key=lambda row: sources[row["sourceId"]]["archiveDate"] or "", reverse=True)
        commentaries = [row for row in reports if row["summaryType"] == "interpretive_report"]
        disclosures = [row for row in reports if row["summaryType"] == "material_disclosure"
                       and cutoff <= (sources[row["sourceId"]]["archiveDate"] or "")[:10] <= today]
        for row in commentaries[:1] + disclosures[:20]:
            yield instrument, row, sources[row["sourceId"]]


def document_content(fetch=False, ticker=None):
    counts = {}
    insight_path = DATA / "analyst_insights.json"
    insights = json.loads(insight_path.read_bytes()) if insight_path.is_file() else {"issuers": {}}
    for instrument, report, source in release_documents():
        symbol = instrument["tickerFa"]
        if ticker and symbol != ticker:
            continue
        issuer = instrument["issuerId"]
        source_id = report["sourceId"]
        path = CACHE / issuer / f"{source_id}.json"
        prior = json.loads(path.read_bytes()) if path.is_file() else {}
        if prior.get("status") == "full_text" and has_verified_body(prior.get("documents", [])) and not fetch:
            counts[issuer, report["summaryType"], "full_text"] = counts.get((issuer, report["summaryType"], "full_text"), 0) + 1
            continue
        documents, errors = [], []
        if report["summaryType"] == "interpretive_report":
            parsed = period(report["titleFa"])
            if parsed and parsed[3]:
                files = list(FOLDERS.glob(f"*/{symbol}/04_Interpretive_Reports/{parsed[0]}_{parsed[3]:02}M_*.pdf"))
                if len(files) == 1:
                    try:
                        documents.append(parse_payload(files[0].read_bytes(), files[0].relative_to(ROOT).as_posix())[0])
                    except (ImportError, ValueError, OSError, CalledProcessError, TimeoutExpired) as error:
                        errors.append(str(error))
        if report["summaryType"] == "material_disclosure" and source["url"]:
            serial = parse_qs(urlsplit(source["url"]).query).get("LetterSerial")
            folder_pattern = f"*/{symbol}/03_Important_Disclosures/*.json"
            for metadata_path in FOLDERS.glob(folder_pattern):
                metadata = json.loads(metadata_path.read_bytes())
                local_url = metadata.get("Url") or metadata.get("link") or ""
                if not serial or parse_qs(urlsplit(local_url).query).get("LetterSerial") != serial:
                    continue
                for suffix in (".html", ".htm", ".pdf", ".xlsx", ".xls", ".txt"):
                    local = metadata_path.with_suffix(suffix)
                    if local.is_file():
                        try:
                            documents.append(parse_payload(local.read_bytes(), local.relative_to(ROOT).as_posix())[0])
                        except (ImportError, ValueError, OSError, CalledProcessError, TimeoutExpired) as error:
                            errors.append(str(error))
                break
        if fetch and source["url"] and not has_verified_body(documents):
            search = EVIDENCE / f"{symbol}.json"
            letters = json.loads(search.read_bytes()).get("letters", []) if search.is_file() else []
            serial = parse_qs(urlsplit(source["url"]).query).get("LetterSerial")
            letter = next((row for row in letters if serial and parse_qs(urlsplit(row.get("Url") or "").query).get("LetterSerial") == serial), {})
            remote, issues = download_document(source["url"], letter)
            documents.extend(remote)
            errors.extend(issues)
        if not has_verified_body(documents) and has_verified_body(prior.get("documents", [])):
            documents = prior["documents"]
        status = "full_text" if has_verified_body(documents) else "ocr_required" if any(d["method"] == "ocr_required" for d in documents) else "missing_body"
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(issuerId=issuer, sourceId=source_id, summaryType=report["summaryType"], title=report["titleFa"],
                       source=source, status=status, documents=documents, errors=errors)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
        entries = insights["issuers"].setdefault(issuer, {})
        if report["summaryType"] == "material_disclosure":
            entries.setdefault(source_id, {
                "analysis": "متن و ارقام اطلاعیه هنوز تأیید نشده‌اند.",
                "transactionIrr": None,
                "estimatedNetProfitEffectIrr": None,
            })
        key = issuer, report["summaryType"], status
        counts[key] = counts.get(key, 0) + 1
    temporary = insight_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(insights, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(insight_path)
    for key, count in sorted(counts.items()):
        print(*key, count)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--ticker", choices=ISSUER_REGISTRY)
    args = parser.parse_args()
    try:
        document_content(args.fetch, args.ticker)
    except RateLimited as error:
        print(f"{error}. Resume later; finished documents remain cached.")
