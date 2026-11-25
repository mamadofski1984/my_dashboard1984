type Facts = Record<string, unknown>;
type Amount = number | null;
function fact(row: Facts, key: string): Amount {
  const value = row[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function ratio(a: Amount, b: Amount, scale = 1) {
  return a === null || b === null || b <= 0 ? null : Number((a / b * scale).toFixed(2));
}

export function calculateRatios(row: Facts, opening: Facts, industry: string) {
  const industrial = !/بانک|اعتباری|سرمایه.?گذاری|چند رشته|نهادهای مالی|بیمه/.test(industry);
  const get = (key: string) => fact(row, key);
  const average = (key: string) => {
    const start = fact(opening, key), end = get(key);
    return start === null || end === null ? null : (start + end) / 2;
  };
  const revenue = get('revenue'), cost = get('cost_of_revenue');
  const current = get('current_assets'), inventory = get('inventory');
  return {
    roe: ratio(get('net_profit'), average('total_equity'), 100),
    roa: ratio(get('net_profit'), average('total_assets'), 100),
    equity: ratio(get('total_equity'), get('total_assets'), 100),
    debt: ratio(get('total_liabilities'), get('total_assets'), 100),
    quality: ratio(get('operating_cash_flow'), get('net_profit')),
    efficiency: industrial && cost !== null ? ratio(Math.abs(cost), revenue, 100) : null,
    quick: industrial && current !== null && inventory !== null ? ratio(current - inventory, get('current_liabilities')) : null,
    collection: industrial && (get('period_days') ?? 0) > 0 ? ratio(average('receivables'), get('credit_sales'), get('period_days') ?? 0) : null,
    netMargin: ratio(get('net_profit'), revenue, 100),
    opMargin: ratio(get('operating_profit'), revenue, 100),
  };
}

export function ratioPeriods(rows: Facts[]) {
  const parse = (r: Facts) => /^(\d{4})_(\d{1,2})M$/.exec(String(r.period));
  const order = (r: Facts) => {
    const match = parse(r);
    return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
  };
  const sorted = rows.filter(parse).sort((a,b) => order(b) - order(a) || String(b.publish_date).localeCompare(String(a.publish_date)));
  const related = (row: Facts, months: number) => sorted.find(candidate =>
    order(candidate) === (Math.floor(order(row)/100)-1)*100 + months &&
    String(candidate.title).includes('تلفیقی') === String(row.title).includes('تلفیقی')) ?? {};
  const latest = sorted[0] ?? {};
  return { latest, previous: related(latest, order(latest)%100), opening: (r: Facts) => related(r,12) };
}
