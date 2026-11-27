import type { FinancialStatement, SymbolDetailData, SymbolRatio } from '../types/marketContract';
import { parseDecimalSafe } from './contractViewMapper';
import { jalaliKey, periodStart, type Close } from './supplementalMarketData';

export const coreRatioCodes=['QUICK_RATIO','DSO','ROA','CASH_RATIO','CURRENT_RATIO'] as const;
export type CoreRatioCode=(typeof coreRatioCodes)[number];

export function statementFact(row:FinancialStatement|undefined, ...codes:string[]) {
  for (const code of codes) {
    const value=parseDecimalSafe(row?.facts.find(f=>f.code===code)?.value);
    if(value!==null)return value;
  }
  return null;
}

export function coreRatios(statement:FinancialStatement|undefined, opening:FinancialStatement|undefined, sector:SymbolDetailData['sectorTemplate']|undefined):SymbolRatio[] {
  const fact=(...codes:string[])=>statementFact(statement,...codes);
  const average=(code:string)=>{
    const start=fact("OPENING_"+code) ?? statementFact(opening,code), end=fact(code);
    return start===null||end===null?null:(start+end)/2;
  };
  const current=fact('CURRENT_ASSETS'), inventory=fact('INVENTORY'), prepaid=fact('PREPAYMENTS','PREPAID_EXPENSES');
  const liabilities=fact('CURRENT_LIABILITIES');
  const cash=fact('CASH_AND_CASH_EQUIVALENTS','CASH_AND_EQUIVALENTS','CASH');
  const rows:[CoreRatioCode,number|null,number|null,number,SymbolRatio['unit']][]=[
    ['QUICK_RATIO', current===null||inventory===null||prepaid===null?null:current-inventory-prepaid,liabilities,1,'TIMES'],
    ['DSO',average('TRADE_RECEIVABLES'),fact('NET_CREDIT_SALES','REVENUE'),365*(statement?.periodMonths??12)/12,'DAYS'],
    ['ROA',fact('NET_PROFIT'),average('TOTAL_ASSETS'),100,'PCT'],
    ['CASH_RATIO',cash,liabilities,1,'TIMES'],
    ['CURRENT_RATIO',current,liabilities,1,'TIMES'],
  ];
  return rows.map(([code,numerator,denominator,scale,unit])=>{
    const status=['banking','holding','exchange_service'].includes(sector??'')
      ? 'not_applicable' : numerator===null||denominator===null ? 'missing_input' : denominator<=0 ? 'invalid_denominator' : 'ok';
    return {code,unit,status,value:status==='ok'&&numerator!==null&&denominator!==null?(numerator/denominator*scale).toFixed(2):null,
      formulaVersion:'fundashboard-1',missingInputs:[],inputStatementIds:[statement?.revisionId,opening?.revisionId].filter((id):id is string=>!!id)};
  });
}

export function historicalValuation(row:FinancialStatement|undefined, prices:Close[], epsByRevision:Record<string,number>) {
  const end=jalaliKey(row?.periodEndJalali??'');
  if(!end || !row)return {pe:null,pb:null,ps:null};
  const start=periodStart(end,row.periodMonths);
  const price=prices.findLast(item=>item.dateJalali<=end && item.dateJalali>=start);
  const earnings=statementFact(row,'NET_PROFIT');
  const shares=statementFact(row,'WEIGHTED_AVERAGE_SHARES');
  const eps=epsByRevision[row.revisionId]??statementFact(row,'EPS','BASIC_EPS','EARNINGS_PER_SHARE')??(earnings!==null && shares!==null && shares>0?earnings/shares:null);
  const capital=statementFact(row,'CAPITAL','SHARE_CAPITAL');
  const periodShares=capital!==null && capital>0 ? capital/1000 : null;
  const equity=statementFact(row,'TOTAL_EQUITY');
  const revenue=statementFact(row,'REVENUE');
  const multiple=(perShare:number|null)=>price && perShare!==null && perShare>0 ? price.closeIrr/perShare : null;
  return {pe:multiple(eps), pb:multiple(equity!==null && periodShares ? equity/periodShares : null),
    ps:multiple(revenue!==null && periodShares ? revenue/periodShares : null)};
}

export const historicalPe = (...args: Parameters<typeof historicalValuation>) => historicalValuation(...args).pe;
