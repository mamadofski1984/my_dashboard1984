"""Cache document content for active Fundashboard issuers. Offline unless --fetch is supplied."""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
from random import uniform
from time import sleep
from subprocess import CalledProcessError, TimeoutExpired, run
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit

from canonical_codal import EVIDENCE, ISSUER_REGISTRY, period, publication, normalized
from fetch_codal_evidence import RateLimited, request

ROOT = EVIDENCE.parents[1]
DATA = ROOT / "public" / "data"
CACHE = EVIDENCE / "document_content"
PDF_DEPS = Path(__file__).resolve().parent / ".pdf_deps"
if PDF_DEPS.is_dir():
    sys.path.insert(0, str(PDF_DEPS))
FOLDERS = ROOT / "public" / "Codal_DB"
BLOCKS = {"p", "div", "li", "br", "section", "article", "h1", "h2", "h3", "label"}
SKIP = {"script", "style", "noscript", "head"}
BASE = "https://codal.ir/"
DOCUMENT_ERRORS = (RuntimeError, ValueError, ImportError, OSError, CalledProcessError, TimeoutExpired)


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
        self.attachment_rows = []
        self.row_links = []

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
            self.row_links = []
        elif tag in {"th", "td"}:
            self.cell = []
        elif tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
            self.row_links.append(attrs["href"])
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
            if self.row_links:
                self.attachment_rows.append((self.row, self.row_links))
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
    missing = [index for index, page in enumerate(pages) if not iranian_text(page)]
    if not missing:
        return [page for page in pages if page], "pdf_text"
    if not all(shutil.which(tool) for tool in ("pdftoppm", "tesseract")):
        return [page for page in pages if iranian_text(page)], "pdf_text" if len(missing) < len(pages) else "ocr_required"
    with TemporaryDirectory() as folder:
        path = Path(folder) / "report.pdf"
        path.write_bytes(payload)
        run(["pdftoppm", "-r", "220", "-png", str(path), str(path.with_suffix(""))],
            check=True, capture_output=True, timeout=300)
        for image in sorted(path.parent.glob("report-*.png"), key=lambda item: int(item.stem.split("-")[-1])):
            index = int(image.stem.split("-")[-1]) - 1
            if index not in missing:
                continue
            result = run(["tesseract", str(image), "stdout", "-l", "fas+eng"], capture_output=True, check=True, timeout=90)
            pages[index] = clean(result.stdout.decode("utf-8", errors="replace"))
    return [page for page in pages if page], "ocr"


def parse_payload(payload, url):
    if payload.startswith(b"%PDF"):
        from io import BytesIO
        from pypdf.errors import PdfReadError

        try:
            paragraphs, method = pdf_text(payload)
        except PdfReadError as error:
            raise ValueError(str(error)) from error
        tables = []
        try:
            import pdfplumber
        except ImportError:
            pass
        else:
            with pdfplumber.open(BytesIO(payload)) as pdf:
                tables = [[[clean(cell or "") for cell in row] for row in table]
                          for page in pdf.pages for table in page.extract_tables()]
        return {"paragraphs": paragraphs, "tables": tables, "method": method, "url": url}, []
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


def letter_serial(url):
    query = parse_qs(urlsplit(url or "").query)
    return (query.get("LetterSerial") or query.get("hs") or [""])[0]


def disclosure_content(symbol, source_id, source_url, letter, fetch):
    serial = (unquote(str(letter["LetterSerial"])) if letter.get("LetterSerial") else
              letter_serial(letter.get("PdfUrl")) or letter_serial(letter.get("Url")) or letter_serial(source_url))
    trace = str(letter.get("TracingNo") or source_id)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", trace):
        raise ValueError("Invalid disclosure tracing number")
    folder = CACHE / "disclosures" / symbol
    token = quote(serial, safe="")
    main_url = codal_url(BASE, letter.get("PdfUrl") or "")
    if not main_url or not urlsplit(main_url).path.lower().endswith("/downloadfile.aspx"):
        main_url = codal_url(BASE, letter.get("Url") or "")
    if not main_url or not urlsplit(main_url).path.lower().endswith("/downloadfile.aspx"):
        main_url = BASE + f"DownloadFile.aspx?hs={token}&ft=1005&let=11" if token else None
    listing_url = BASE + f"Reports/Attachment.aspx?LetterSerial={token}" if token else None
    errors, documents, attachments = [], [], []

    def log(message):
        if fetch:
            line = f"{symbol} {trace} {message}"
            encoding = sys.stdout.encoding or "utf-8"
            print(line.encode(encoding, errors="backslashreplace").decode(encoding), flush=True)

    def response(label):
        return lambda status, mime, magic: log(
            f"{label}: HTTP {status}, Content-Type={mime or '—'}, first20={magic!r}"
        )

    def cached(path, url, *, pdf):
        payload = path.read_bytes() if path.is_file() else b""
        if payload and (not pdf or payload.startswith(b"%PDF-")):
            log(f"{path.name}: reused {path}, first20={payload[:20]!r}")
            return payload
        if not fetch or not url:
            return None
        sleep(uniform(2.5, 4.5))
        payload = request(url, headers={
            "User-Agent": "Mozilla/5.0 Fundashboard",
            "Accept": "application/pdf,*/*" if pdf else "text/html,*/*",
            "Referer": BASE + "ReportList.aspx",
        }, diagnostics=response(path.name))
        if pdf and not payload.startswith(b"%PDF-"):
            raise ValueError("non_pdf_response")
        folder.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(payload)
        temporary.replace(path)
        log(f"downloaded {path}")
        return payload

    def read_pdf(path, url):
        try:
            if payload := cached(path, url, pdf=True):
                record = dict(url=url, path=str(path.relative_to(CACHE)), paragraphs=[], tables=[],
                              method="pdf_saved")
                documents.append(record)
                document, _ = parse_payload(payload, url)
                record.update(document)
                log(f"{path.name}: {document['method']}, verified Persian text={has_verified_body([document])}")
                lines = document["paragraphs"] + [
                    " | ".join(row) for table in document["tables"] for row in table
                ]
                return "\n".join(lines)
        except DOCUMENT_ERRORS as error:
            errors.append(f"{path.name}: {error}")
            log(errors[-1])
        return None

    main_text = read_pdf(folder / f"{trace}_main.pdf", main_url)
    try:
        # Cache parsed metadata only, so an error or challenge page stays retryable.
        listing = folder / f"{trace}_attachments.json"
        if listing.is_file():
            entries = json.loads(listing.read_bytes())
        elif fetch and listing_url:
            sleep(uniform(2.5, 4.5))
            parser = DocumentHTML()
            parser.feed(request(listing_url, headers={"User-Agent": "Mozilla/5.0 Fundashboard",
                        "Accept": "text/html,*/*", "Referer": BASE + "ReportList.aspx"},
                        diagnostics=response("attachment list")).decode("utf-8-sig", errors="replace"))
            entries = []
            for cells, links in parser.attachment_rows:
                for link in links:
                    url = codal_url(listing_url, link)
                    if url and urlsplit(url).path.lower() == "/reports/downloadfile.aspx" and parse_qs(urlsplit(url).query).get("id"):
                        entries.append(dict(description=" ".join(cell for cell in cells if cell),
                                            uploadDate=next((cell for cell in cells if re.search(r"\d{4}/\d{1,2}/\d{1,2}", cell)), None),
                                            url=url))
            entries = list({entry["url"]: entry for entry in entries}.values())
            if entries:
                folder.mkdir(parents=True, exist_ok=True)
                listing.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
        else:
            entries = []
        for index, entry in enumerate(entries, 1):
            path = folder / f"{trace}_att_{index}.pdf"
            attachment_text = read_pdf(path, codal_url(BASE, entry["url"]))
            saved = any(document.get("path") == str(path.relative_to(CACHE)) for document in documents)
            attachments.append(dict(entry, text=attachment_text,
                                    path=str(path.relative_to(CACHE)) if saved else None))
    except DOCUMENT_ERRORS as error:
        errors.append(str(error))
        log(f"attachment list: {error}")
    return documents, errors, main_text, attachments


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
    cutoff = str(int(today[:4])-1) + today[4:]
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
        is_disclosure = report["summaryType"] == "material_disclosure"
        if not is_disclosure and prior.get("status") == "full_text" and has_verified_body(prior.get("documents", [])):
            counts[issuer, report["summaryType"], "full_text"] = counts.get((issuer, report["summaryType"], "full_text"), 0) + 1
            continue
        documents, errors = [], []
        main_text, attachments = None, []
        if report["summaryType"] == "interpretive_report":
            parsed = period(report["titleFa"])
            if parsed and parsed[3]:
                files = list(FOLDERS.glob(f"*/{symbol}/04_Interpretive_Reports/{parsed[0]}_{parsed[3]:02}M_*.pdf"))
                if len(files) == 1:
                    try:
                        documents.append(parse_payload(files[0].read_bytes(), files[0].relative_to(ROOT).as_posix())[0])
                    except (ImportError, ValueError, OSError, CalledProcessError, TimeoutExpired) as error:
                        errors.append(str(error))
        if is_disclosure and source["url"]:
            search = EVIDENCE / f"{symbol}.json"
            letters = json.loads(search.read_bytes()).get("letters", []) if search.is_file() else []
            serial_token = letter_serial(source["url"])
            letter = next((row for row in letters if serial_token and serial_token in {
                letter_serial(row.get("Url")), letter_serial(row.get("PdfUrl")),
                unquote(str(row.get("LetterSerial") or "")),
            }), {})
            documents, errors, main_text, attachments = disclosure_content(symbol, source_id, source["url"], letter, fetch)
        if is_disclosure and source["url"] and not has_verified_body(documents):
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
        if fetch and not is_disclosure and source["url"] and not has_verified_body(documents):
            search = EVIDENCE / f"{symbol}.json"
            letters = json.loads(search.read_bytes()).get("letters", []) if search.is_file() else []
            serial = parse_qs(urlsplit(source["url"]).query).get("LetterSerial")
            letter = next((row for row in letters if serial and parse_qs(urlsplit(row.get("Url") or "").query).get("LetterSerial") == serial), {})
            remote, issues = download_document(source["url"], letter)
            documents.extend(remote)
            errors.extend(issues)
        if not has_verified_body(documents) and has_verified_body(prior.get("documents", [])):
            documents.extend(prior["documents"])
        if is_disclosure and prior.get("pdfStatus") == "full_text":
            main_text = main_text if iranian_text(main_text or "") else prior.get("main_text")
            previous_attachments = {item["url"]: item for item in prior.get("attachments", [])}
            for item in attachments:
                previous = previous_attachments.get(item["url"], {})
                previous_attachments[item["url"]] = {
                    **item,
                    "text": item["text"] if iranian_text(item["text"] or "") else previous.get("text"),
                    "path": item["path"] or previous.get("path"),
                }
            attachments = list(previous_attachments.values())
        status = "full_text" if has_verified_body(documents) else "ocr_required" if any(d["method"] == "ocr_required" for d in documents) else "missing_body"
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(issuerId=issuer, sourceId=source_id, summaryType=report["summaryType"], title=report["titleFa"],
                       source=source, status=status, documents=documents, errors=errors)
        if is_disclosure:
            payload.update(main_text=main_text, attachments=attachments,
                           pdfStatus="full_text" if any(iranian_text(text or "") for text in
                               [main_text, *(attachment["text"] for attachment in attachments)]) else
                               "pdf_saved" if any(doc.get("path") for doc in documents) else "missing_body")
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
