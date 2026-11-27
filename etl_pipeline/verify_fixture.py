import json
from pathlib import Path
from tempfile import TemporaryDirectory
from shutil import copytree

import export_fixture as etl
from canonical_codal import canonicalize, verified_parent

TICKER = "فملی"


def letter(trace, title, date, code="ن-۱۰", **fields):
    return {"TracingNo":trace, "Title":title, "PublishDateTime":date, "LetterCode":code,
            "Symbol":TICKER, "CompanyName":"ملی صنایع مس ایران",
            "Url":f"/Reports/Decision.aspx?LetterSerial=TEST{trace}", **fields}


def local(row, **facts):
    return {"title":row["Title"], "publish_date":row["PublishDateTime"], **facts}


def check_selection():
    annual = "صورت‌های مالی سال مالی منتهی به 1404/12/29"
    interim = "اطلاعات و صورت‌های مالی میان‌دوره‌ای دوره"
    activity = "گزارش فعالیت ماهانه دوره 1 ماهه منتهی به 1403/01/31"
    disclosure = "افشای اطلاعات بااهمیت (گروه ب)"
    letters = [
        letter(1,annual+" (حسابرسی نشده)","1405/03/01"),
        letter(2,annual+" (حسابرسی شده)","1405/04/01"),
        letter(3,annual+" (حسابرسی شده)(اصلاحیه)","1405/04/02"),
        letter(4,annual+" (حسابرسی شده) (شرکت فرعی)","1405/04/03"),
        letter(5,annual.replace("مالی سال","مالی تلفیقی سال")+" (حسابرسی شده)","1405/04/04"),
        letter(6,interim+" 3 ماهه منتهی به 1405/03/31 (حسابرسی شده)","1405/04/05"),
        letter(7,interim+" 6 ماهه منتهی به 1405/06/31 (حسابرسی نشده)","1405/07/05"),
        letter(8,activity,"1403/02/02","ن-۳۰"),
        letter(9,activity+" (اصلاحیه)","1403/02/05","ن-۳۰"),
        letter(10,disclosure,"1404/06/02","الف-ب"),
        letter(11,disclosure+" (اصلاحیه)","1404/06/03","الف-ب",ParentTracingNo=10),
        letter(12,"گزارش تفسیری مدیریت - "+annual+" (حسابرسی شده)","1405/04/02"),
        letter(13,annual+" (حسابرسی شده)","1405/04/06"),
        {**letter(14,disclosure+" (اصلاحیه)","1404/06/04","الف-ب"),"CompanyName":"ناشر دیگر"},
    ]
    assert not verified_parent(TICKER, letter(15, annual + " (شرکت فرعی (سهامی خاص))(اصلاحیه)", "1405/04/01"))
    assert not verified_parent(TICKER, letter(16, annual + " (شرکت فرعی)(اصلاحیه)", "1405/04/01"))
    assert verified_parent(TICKER, letter(17, annual + " (شرکت ملی صنایع مس ایران (سهامی عام))", "1405/04/01"))
    archive = {"meta":{"ticker":TICKER},
               "financial_statements":[local(row,revenue=1) for row in letters if row["TracingNo"] in range(1,8)],
               "monthly_sales":[local(letters[7],monthly_revenue=5),local(letters[8],monthly_revenue=0)],
               "interpretive_reports":[]}
    canonical, audit = canonicalize(TICKER,archive,{"complete":True,"letters":letters})
    assert [r["tracing_no"] for r in canonical["financial_statements"]] == ["3","7"]
    assert [r["tracing_no"] for r in canonical["monthly_sales"]] == ["9"]
    assert canonical["monthly_sales"][0]["monthly_revenue"] == 0
    assert [r["tracing_no"] for r in canonical["important_disclosures"]] == ["10"]
    assert [r["tracing_no"] for r in canonical["interpretive_reports"]] == ["12"]
    assert audit["missing_financial"][1400] == "not_found_in_codal_search"
    archive["financial_statements"].pop(2)
    canonical, audit = canonicalize(TICKER,archive,{"complete":True,"letters":letters})
    assert [row["tracing_no"] for row in canonical["financial_statements"] if row["period"] == "1404_12M"] == ["2"]
    assert audit["verified_annual_backfills"] == 1
    archive["financial_statements"] = [row for row in archive["financial_statements"] if "1404/12/29" not in row["title"]]
    canonical, audit = canonicalize(TICKER,archive,{"complete":True,"letters":letters})
    assert audit["missing_financial"][1404] == "published_extraction_missing"
    assert all(row["period"] != "1404_12M" for row in canonical["financial_statements"])


def check_public_contract():
    local_evidence = etl.EVIDENCE
    with TemporaryDirectory() as scratch:
        root = Path(scratch)
        copytree(etl.ARCHIVES, root / "inputs")
        etl.ARCHIVES = root / "inputs"
        etl.OUTPUT = root / "data"
        etl.CONTRACTS = root / "contracts"
        etl.EVIDENCE = root / "evidence"
        etl.EVIDENCE.mkdir()
        for file in local_evidence.glob("*.json"):
            if file.stem in etl.IDS:
                (etl.EVIDENCE / file.name).write_bytes(file.read_bytes())
        etl.export()
        manifest = etl.OUTPUT / "manifest.json"
        first = manifest.read_bytes()
        etl.export()
        assert manifest.read_bytes() == first

        def content(ref):
            payload = (etl.OUTPUT / ref["path"]).read_bytes()
            assert len(payload) == ref["bytes"] and etl.digest(payload) == ref["sha256"]
            return json.loads(payload)["data"]

        index = content(json.loads(first)["data"]["masterIndex"])
        assert len(index["instruments"]) == 10
        for instrument in index["instruments"]:
            if instrument["detail"] is None:
                assert instrument["coverageState"] == "index_only"
                continue
            data = content(instrument["detail"])
            assert len(data["statements"]) <= 6
            assert all(row["consolidationScope"] == "standalone" and not row["isFixture"] for row in data["statements"])
            assert all(row["periodMonths"] == 12 if row["fiscalYear"] <= 1404 else row["periodMonths"] in (3,6,9)
                       for row in data["statements"])
            assert len({row["fiscalYear"] for row in data["statements"]}) == len(data["statements"])
            months = [row["periodJalali"] for row in data["monthlySales"]]
            assert months == sorted(set(months)) and all("1403/01" <= month <= "1405/12" for month in months)
            assert sum(row["summaryType"] == "interpretive_report" for row in data["summaries"]) <= len(data["statements"]) + 1


if __name__ == "__main__":
    check_selection()
    check_public_contract()
    print("Identity, amendment precedence, missing extraction, ten issuer contracts and deterministic exports passed")
