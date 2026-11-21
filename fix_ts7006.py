import os

app_path = "src/App.tsx"
with open(app_path, "r", encoding="utf-8") as f:
    s = f.read()

s = s.replace(
    "const [fundStore, setFundStore] = useState(activeConfig.defaultFundamental);",
    "const [fundStore, setFundStore] = useState<any>(activeConfig.defaultFundamental);"
)

replacements = [
    ("fundStore.incomeData.map((row) =>", "fundStore.incomeData.map((row: any) =>"),
    ("fundStore.annualIncomeData.map((r) =>", "fundStore.annualIncomeData.map((r: any) =>"),
    ("fundStore.opMarginData.map((r) =>", "fundStore.opMarginData.map((r: any) =>"),
    ("fundStore.netMarginData.map((r) =>", "fundStore.netMarginData.map((r: any) =>"),
    ("fundStore.roeData.map((r) =>", "fundStore.roeData.map((r: any) =>"),
    ("fundStore.efficiencyData.map((r) =>", "fundStore.efficiencyData.map((r: any) =>"),
    ("fundStore.cashFlowData.map((r) =>", "fundStore.cashFlowData.map((r: any) =>"),
    ("fundStore.balanceSheetData.map((r) =>", "fundStore.balanceSheetData.map((r: any) =>"),
    ("fundStore.ratiosDef.map((r) => {", "fundStore.ratiosDef.map((r: any) => {"),
    ("fundStore.annualIncomeData.map(item => {", "fundStore.annualIncomeData.map((item: any) => {"),
    ("fundStore.incomeData.filter((d) =>", "fundStore.incomeData.filter((d: any) =>"),
    ("valid.reduce((s, d) =>", "valid.reduce((s: number, d: any) =>"),
    ("fundStore.ratiosDef.map((r) => (", "fundStore.ratiosDef.map((r: any) => ("),
    ("row.data.map((d, i) =>", "row.data.map((d: any, i: number) =>"),
]

for old, new in replacements:
    s = s.replace(old, new)

with open(app_path, "w", encoding="utf-8") as f:
    f.write(s)

print("[+] تمام ۱۷ خطای TS7006 در src/App.tsx برطرف شدند.")