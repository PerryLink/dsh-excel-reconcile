# Results — SEC XBRL cross-filing

Rows: 9; source: SEC XBRL companyfacts (Apple FY2023 10-K vs FY2024 10-K comparative).

**Overall: precision 1.000 · recall 1.000 (TP 9 · FP 0 · FN 0 · TN 9)**

| check | TP | FP | FN | TN | precision | recall |
|---|---:|---:|---:|---:|---:|---:|
| value reconciliation | 9 | 0 | 0 | 9 | 1.000 | 1.000 |

## Limits

- One issuer, nine facts, one fiscal year.
- XBRL facts, not HTML table extraction.
- Cross-filing consistency does not prove the accounting is correct.
- The mutation is synthetic; clean rows are real public facts.
