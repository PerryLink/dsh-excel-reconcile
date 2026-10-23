# Changelog

## 0.1.0

First release.

- Reconcile two tables by a declared composite key, comparing declared fields as
  numbers, text or dates with absolute and relative tolerances.
- **Money is compared as integer minor units (BigInt)**, so `12.3` and
  `12.30000000001` are the same amount at two decimal places. Floating-point
  accumulation would drift away from the customer's own total.
- Join modes `full` (default), `left`, `inner`, `right`.
- **A duplicated key is reported and left uncompared**, never paired with the
  first match: pairing hides the difference that matters.
- A non-numeric cell in a numeric field is its own finding rather than being
  coerced to zero, and an empty key is reported rather than matched to another
  empty key.
- Output: markdown report, JSON result, and a five-sheet diff workbook
  (汇总 / 差异明细 / 仅A存在 / 仅B存在 / 合并结果) with a frozen header,
  autofilter and no merged cells — merged header cells disable autofilter.
- The hand-written OOXML writer keeps a long identifier as text, so a 20-digit
  number does not become `2.6E+19`.
- 23 tests, including a write-then-read round trip of the diff workbook.
