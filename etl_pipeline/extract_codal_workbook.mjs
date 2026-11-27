import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

// The downloader keys cached workbooks by the verified Codal tracing number.
const [path, category, expectedDate, mode, scope] = process.argv.slice(2);
const payload = readFileSync(path);
const workbook = XLSX.read(payload);
const normalize = value => String(value ?? '').normalize('NFKC')
  .replace(/[يكۀةى]/g, char => ({ ي: 'ی', ك: 'ک', ۀ: 'ه', ة: 'ه', ى: 'ی' })[char])
  .replace(/[۰-۹٠-٩]/g, char => String(char.charCodeAt(0) - (char >= '۰' ? 0x6f0 : 0x660)))
  .replace(/[\u200c\u200e\u200f\u00ad]/g, '').replace(/\s+/g, ' ').trim();
const label = value => normalize(value).replace(/[^\p{L}\p{N}]/gu, '');
const sheets = workbook.SheetNames.map(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false }));

function amount(value) {
  const text = normalize(value).replace(/[,٬\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  // Reject unsupported formats and unsafe numeric cells instead of coercing them.
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  return /^-?\d+$/.test(text) ? text : null;
}

function noFinancialGrid(message) {
  const firstHeader = (sheets[0]?.[0] ?? []).map(label);
  if (sheets.length === 1 && firstHeader.some(cell => cell.includes('امضاکنندهصورتمالی'))
      && firstHeader.some(cell => cell.includes('هیاتمدیره') || cell.includes('هئیتمدیره') || cell.includes('هیئتمدیره'))) {
    throw new Error('Board/signatory attachment only; obtain the financial statement workbook');
  }
  if (firstHeader.some(cell => cell.startsWith('اطلاعاتاینفرمگزیدهایازاطلاعاتگزارشتفسیریمدیریت'))) {
    throw new Error('Management commentary attachment; no verified current-period financial grid');
  }
  throw new Error(message);
}

function financial() {
  const fields = {
    revenue: ['درآمدهای عملیاتی', 'درآمد عملیاتی', 'جمع درآمدهای عملیاتی'],
    cost_of_revenue: ['بهای تمام شده درآمدهای عملیاتی', 'بهای تمام شده درآمد عملیاتی'],
    operating_profit: ['سود (زیان) عملیاتی'],
    net_profit: ['سود (زیان) خالص'],
    gross_profit: ['سود (زیان) ناخالص'],
    total_equity: ['جمع حقوق مالکانه', 'جمع حقوق صاحبان سهام'],
    total_assets: ['جمع دارایی‌ها'],
    total_liabilities: ['جمع بدهی‌ها'],
    current_assets: ['جمع دارایی‌های جاری'],
    current_liabilities: ['جمع بدهی‌های جاری'],
    inventory: ['موجودی مواد و کالا', 'موجودی کالا', 'موجودی کالا و مواد'],
    cash: ['موجودی نقد', 'وجه نقد و معادل های نقد', 'نقد و معادل نقد', 'وجه نقد'],
    capital: ['سرمایه', 'سرمایه ثبت شده'],
    prepayments: ['پیش پرداخت'],
    trade_receivables: ['دریافتنی های تجاری', 'حساب ها و اسناد دریافتنی تجاری'],
    eps: ['سود پایه هر سهم', 'سود (زیان) پایه هر سهم', 'سود پایه هر سهم پس از کسر مالیات', 'سود (زیان) پایه هر سهم پس از کسر مالیات'],
    operating_cash_flow: ['جریان خالص ورود (خروج) نقد حاصل از فعالیت‌های عملیاتی',
      'جریان خالص نقد حاصل از فعالیت‌های عملیاتی'],
  };
  const datedUnit = sheets.some(rows => rows.some(row => row.some(value => {
    const text = normalize(value);
    return text.includes(expectedDate) && /میلیون\s*ریال/.test(text);
  })));
  // Excel HTML exports can keep the global reporting unit in a DIV that is
  // discarded when SheetJS reads only the tabular cells.
  const declaredUnit = /کلیهمبالغ(?:درجشده)?بهمیلیونریال(?:است|میباشد)/.test(label(payload.toString('utf8')));
  if (!datedUnit && !declaredUnit) noFinancialGrid('Explicit million-IRR declaration not found');
  // SheetJS drops headings outside tables in Codal HTML workbooks.
  // Read each explicitly labelled statement section independently.
  const html = payload.toString('utf8');
  const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const statementNames = new Set(['صورتسودوزیان', 'صورتوضعیتمالی', 'صورتجریانهاینقدی', 'صورتجریانوجوهنقد']);
  const sections = headings.flatMap((heading, index) => {
    const name = label(heading[1].replace(/<[^>]+>/g, ''));
    if (!statementNames.has(name) && !statementNames.has(name.replace(/غیرتلفیقی$/, ''))) return [];
    const part = XLSX.read(html.slice(heading.index, headings[index + 1]?.index), { type: 'string' });
    return part.SheetNames.map(sheet => ({
      sheet: name + '/' + sheet,
      rows: XLSX.utils.sheet_to_json(part.Sheets[sheet], { header: 1, blankrows: false }),
    }));
  });
  const mixed = headings.some(heading => /تلفیقی/.test(normalize(heading[1])) &&
    !/غیر[\s‌-]*تلفیقی/.test(normalize(heading[1])));
  const requireSections = mixed || scope === 'standalone_sections';
  const grids = requireSections ? sections : sheets.map((rows, index) => ({ rows, sheet: workbook.SheetNames[index] }));
  const dates = new Set();
  const facts = {};
  const provenance = {};
  const conflicts = new Set();
  for (const { sheet, rows } of grids) {
    const headerIndex = rows.findIndex(row => row.some(cell => label(cell) === 'شرح') &&
      row.some(cell => /دوره منتهی|به تاریخ/.test(normalize(cell))));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    const columns = header.flatMap((cell, column) => {
      const heading = normalize(cell);
      if (!/^(دوره منتهی|به تاریخ|واقعی دوره منتهی|پایان عملکرد واقعی منتهی به)/.test(heading) ||
          /تجدید|مشابه|سال قبل|برآورد|پیش بینی/.test(heading)) return [];
      const below = normalize(rows[headerIndex + 1]?.[column]);
      const inlineDate = heading.match(/\d{4}\/\d{2}\/\d{2}/)?.[0];
      const date = inlineDate ?? below;
      if (expectedDate.length === 4
        ? !/^\d{4}\/\d{2}\/\d{2}$/.test(date) || !date.startsWith(expectedDate + '/')
        : date !== expectedDate) return [];
      if (inlineDate && !/^(حسابرسی (?:شده|نشده)|جهت ارائه به حسابرس)$/.test(below)) return [];
      const labelColumn = header.slice(0, column).findLastIndex(cell => label(cell) === 'شرح');
      return labelColumn < 0 ? [] : [{ column, labelColumn, date }];
    });
    for (const { column, labelColumn, date } of columns) {
      if (columns.filter(candidate => candidate.labelColumn === labelColumn).length !== 1) continue;
      const table = rows.slice(headerIndex + 1);
      const balance = /صورتوضعیتمالی/.test(sheet) ||
        table.some(row => label(row[labelColumn]) === 'جمعداراییها');
      const income = /صورتسودوزیان/.test(sheet) ||
        table.some(row => fields.revenue.some(candidate => label(candidate) === label(row[labelColumn])));
      const adjacent = normalize(header[column + 1]);
      const openingDate = adjacent.match(/\d{4}\/\d{2}\/\d{2}/)?.[0] ??
        normalize(rows[headerIndex + 1]?.[column + 1]);
      const openingVerified = balance && /به تاریخ|(?:دوره|سال)(?: مالی)? منتهی به/.test(adjacent) &&
        !/مشابه|پیش بینی|برآورد/.test(adjacent) && /^\d{4}\/\d{2}\/\d{2}$/.test(openingDate) && openingDate < date;
      const record = (key, row, value, rowColumn, entryDate) => {
        if (key in facts && facts[key] !== value) conflicts.add(key);
        facts[key] = value;
        dates.add(date);
        const isEps = key === 'eps';
        (provenance[key] ??= []).push({sheet, date: entryDate, label: row[labelColumn], raw: row[rowColumn], value,
          unit: isEps ? 'IRR per share' : 'million IRR',
          normalizedIrr: (BigInt(value) * (isEps ? 1n : 1000000n)).toString()});
      };
      for (const [key, labels] of Object.entries(fields)) {
        if (['capital','cash','prepayments','trade_receivables'].includes(key) && !balance) continue;
        if (key === 'eps' && !income) continue;
        const matching = table.filter(row => labels.some(candidate => {
          const actual = label(row[labelColumn]);
          const expected = label(candidate);
          if (key === 'prepayments') return actual.startsWith(expected) || actual.startsWith('سفارشات و پیش پرداخت'.replace(/ /g, ''));
          if (key === 'trade_receivables') return actual.startsWith(expected) && !/غیرجاری|بلندمدت/.test(actual);
          return actual === expected;
        }));
        if (key === 'prepayments' && !matching.length && table.some(row => label(row[labelColumn]) === 'جمعداراییهایجاری')) {
          record(key, [], '0', column, date);
        }
        const values = matching.map(row => ({row, value: amount(row[column])})).filter(item => item.value !== null);
        const distinct = new Set(values.map(item => item.value));
        if (distinct.size > 1) conflicts.add(key);
        if (distinct.size !== 1) continue;
        const [{row, value}] = values;
        record(key,row,value,column,date);
        if (openingVerified && ['total_assets','trade_receivables'].includes(key)) {
          const opening = amount(row[column + 1]);
          if (opening !== null) record('opening_' + key,row,opening,column + 1,openingDate);
        }
      }
    }
  }
  for (const key of conflicts) {
    delete facts[key];
    delete provenance[key];
  }
  if (facts.revenue === undefined && facts.net_profit === undefined && facts.total_assets === undefined) {
    noFinancialGrid('No verified financial statement rows');
  }
  if (dates.size !== 1) noFinancialGrid('Ambiguous current statement period');
  return mode === "--audit" ? {facts, provenance, periodEndJalali: [...dates][0]} : facts;
}

function monthly() {
  const candidates = new Set();
  for (const rows of sheets) {
    for (let index = 0; index < Math.min(rows.length, 8); index++) {
      const header = rows[index];
      const context = rows[index - 1] ?? [];
      let periodHeader = '';
      for (let column = 1; column < header.length; column++) {
        if (context[column]) periodHeader = normalize(context[column]);
        const heading = normalize(header[column]);
        if (!/مبلغ فروش.*میلیون\s*ریال/.test(heading) ||
            !periodHeader.includes(expectedDate) ||
            !/1\s*ماهه|یک\s*ماهه/.test(periodHeader)) continue;
        const totals = rows.filter(row => ['جمعکل', 'جمعکلفروش'].includes(label(row[0])));
        if (totals.length === 1) {
          const value = amount(totals[0][column]);
          if (value !== null) candidates.add(value);
        }
      }
    }
  }
  if (candidates.size !== 1) throw new Error('No unique dated monthly total in million IRR');
  return { monthly_revenue: [...candidates][0] };
}

console.log(JSON.stringify(category === 'financial_statements' ? financial() : monthly()));
