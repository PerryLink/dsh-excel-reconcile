# Changelog

## 0.1.1

**Fixes a silent-failure bug in 0.1.0.** The bundled `shared/yaml.ts` predated the
flow-collection fix, so an inline map in `compare:` — the natural way to write it —

```yaml
compare:
  - {a: 金额, kind: money}
```

was read as the literal string `{a: 金额, kind: money}`. The config then had no
usable comparison entries and **value differences were not reported at all**: a
reconciliation over two invoices differing by 500.00 returned only the missing-key
findings and looked clean.

This is the worst failure mode for a reconciliation tool — silence reads as
agreement. The reader is re-synced, a regression test now asserts that an inline
map is read as a mapping and that the difference is reported, and the bundle that
embeds this package is rebuilt.

No API change. Anyone who reconciled with an inline `compare` list should re-run:
differences they were not shown may exist.


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
