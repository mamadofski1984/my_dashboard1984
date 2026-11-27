# Supplemental dashboard data

These optional files live in public/data and are copied into the production build. Empty objects or arrays are supported.

- usd_history.json uses an observations array of objects with dateJalali (YYYY/MM/DD) and rateIrr (positive number, Iranian rials for one USD). Supply observations from 1399/01/01 onward. The midpoint uses the first observation near the start and the last near the end, at most six days inside each boundary month.
- tsetmc_history.json uses an instruments object keyed by instrumentId, such as INS_AKHABER. Each value is an array of objects with dateJalali and closeIrr, the unadjusted closing price per share in rials. Provide a complete trading series. An optional epsIrrByRevisionId object maps each statement revisionId to the matching period EPS in rials. Use the same share basis for EPS and price.
- analyst_insights.json uses an issuers object keyed by issuerId, then sourceId from the corresponding interpretive report or disclosure. Interpretive reports accept perspective, expansion, risks and outlook strings. Disclosures accept analysis, transactionIrr (gross transaction magnitude) and estimatedNetProfitEffectIrr (signed estimated change in net profit). Generated analysis belongs in this file after a separate generation and review step. Keep API credentials on a server.
- The core ratio inputs are in each financial statement's facts. Relevant codes include CURRENT_ASSETS, CURRENT_LIABILITIES, INVENTORY, PREPAYMENTS, CASH, TRADE_RECEIVABLES, NET_CREDIT_SALES, REVENUE, TOTAL_ASSETS and NET_PROFIT. Trade receivables and total assets need matching opening and closing balances for DSO and ROA.
- Core financial ratio cards use the latest available chart period. DSO uses net credit sales when published and revenue as its proxy otherwise. Interim day counts are prorated from 365 days. ROA uses period profit without annualization.

## Issuer onboarding and Codal document review

Add one issuer to public/Dashboard_Data/index.json with ticker, code (stable ASCII suffix), industry, codalName (exact published issuer name), displayName, and sectorTemplate (manufacturing, banking, holding, exchange_service, or other). Optional isin and venue become instrument metadata. Local legacy archives are optional. The collector reads the same registry as the canonical export. The exporter produces the statement and ratio contracts, including period EPS. Run scripts/fetch_tsetmc_history.py separately with network access to fill historical prices for a new instrument.

The manual Spyder runner refreshes the release and caches the latest report and capped disclosure documents. To fetch those documents from an existing search cache, set DOCUMENTS_ONLY = True in run_codal_spyder.py and use TARGET_TICKER = None for all symbols or the registered ticker for a single symbol. Requires Python requirements, curl, and Node. Persian OCR additionally needs pdftoppm, Tesseract, and the fas and eng language data. Review OCR output against the source, especially figures.

Review the files in etl_pipeline/codal_evidence/document_content/<issuerId>/<sourceId>.json. For each verified interpretive report, write perspective, expansion, risks and outlook in Persian. For a disclosure, write analysis, transactionIrr, and estimatedNetProfitEffectIrr under the matching issuerId and sourceId in public/data/analyst_insights.json. Cite the source page or table, distinguish a contractual face amount from revenue, preserve sign and scale, and use null for figures the source does not support. Use existing verified entries when re-running the cache stage.

## Milestone data sources

The USD series uses TGJU's free-market `price_dollar_rl` closing price per USD in Iranian rials. Refresh it with `node scripts/import_usd_history.mjs` or pass a saved TGJU JSON response as the first argument. The opening anchor on 1399/01/01 carries forward the last pre-holiday quote and is marked with its source date. Annual and interim charts average boundary rates. Monthly sales use the last recorded quote in the month. The manually editable 2,900,000 IRR spot fallback is separate from the archive.

TODO: Complete full-body material disclosure collection using publisher-provided downloads or a permitted, user-authenticated Codal session. Preserve the current captcha/session access checks.
