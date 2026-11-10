# Public-data benchmark: SEC XBRL cross-filing

End-to-end benchmark for `dsh-excel-reconcile` using public SEC XBRL facts.

- Source: <https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json>
- Publisher: U.S. Securities and Exchange Commission
- License: **U.S. Government work; public domain in the United States**
- SEC requires a descriptive User-Agent and fair-access rate limiting.
  `fetch.mjs` makes one request and stores the JSON under `.data/` (gitignored).
- SEC blocks `dsh-public-bench/1.0 (...)`-style User-Agents; use the plain
  `PerryLink dsh-public-bench contact@example.com` form or set
  `SEC_USER_AGENT`. This is documented because it is a real access constraint,
  not a bug in the data.

## What is compared

Apple's FY2023 values as reported in the **FY2023 10-K** (filed 2023-11-03)
against the same FY2023 comparative values in the **FY2024 10-K** (filed
2024-11-01). Nine `us-gaap` facts with an `end` of 2023-09-30 are selected.

This is a **cross-filing consistency** check, not 10-K HTML table extraction.
The values are the XBRL facts themselves. Clean rows should match; a one-cell
mutation of side B should produce one finding.

## Run

```bash
node bench/public-sec-xbrl/fetch.mjs
node bench/public-sec-xbrl/adapter.mjs bench/public-sec-xbrl/.data/aapl-companyfacts.json bench/public-sec-xbrl/.data/tables
node bench/public-sec-xbrl/evaluate.mjs
```

`evaluate.mjs` imports the real tool from `../../lib/index.mjs`; it writes
side A/B CSVs to a fresh temp directory and calls `execute({fileA,fileB,config})`.
No financial data is committed.

## Limits

- One issuer (Apple), nine facts, one fiscal year; not an industry benchmark.
- XBRL facts, not a rendered 10-K table; table extraction is not tested.
- The mutation is synthetic; clean rows are real public facts.
- Cross-filing consistency is not a judgment that the accounting is correct.
