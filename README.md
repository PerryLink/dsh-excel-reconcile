# dsh-excel-reconcile — Excel reconcile

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

<!-- topblock:v1 -->
> **What it is** — Aligns two tables on a key and reports every field that differs.
> **Who it is for** — finance and reconciliation staff.
> **What you give it** — two Excel/CSV files compared field by field on a key
> **What it does not do** — no compliance verdict, no liability finding, no replacement for the reviewer; differences only.
> **How to start** — from the command line (not sold separately yet):
> `dsh plugin --profile <name> add dsh-excel-reconcile`
<!-- /topblock:v1 -->

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-excel-reconcile?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-excel-reconcile?ref=badge)

`dsh-excel-reconcile` joins two spreadsheets on a declared key and compares declared fields with declared tolerances, producing a markdown report, a JSON result and a diff workbook.

It reconciles; it does not adjudicate. A difference means the two sides disagree, not that either is wrong. Money is compared as integer minor units rather than floating point, so `12.3` and `12.30000000001` are the same amount at two decimal places, and a key that appears twice is reported instead of being paired with the first match.

## Install

```sh
dsh plugin --profile <name> add dsh-excel-reconcile
dsh --profile <name> --dump-config | grep 'dsh-excel-reconcile'
```

## What it looks like

![Workflow diagram for dsh-excel-reconcile: document → rule pack → findings.](docs/assets/dsh-excel-reconcile-flow.svg)

*Workflow overview: document → rule pack → findings.*

**Boundary:** this is a comparison tool, not an audit. It does not decide which side is correct, does not verify that an invoice exists, and does not evaluate whether a payment was due. A duplicate key is reported and left uncompared rather than paired arbitrarily, because pairing the first of several matches hides the difference that matters. Tolerances are configuration, not regulation: the report says so, and the defaults only absorb rounding.

## What it answers

- Which keys exist on one side and not the other?
- Which matched rows disagree, on which field, and by how much?
- Is the disagreement bigger than the tolerance I configured?
- Which keys cannot be compared at all because they are duplicated?

## Standards it follows

This package encodes no clause. The reconciliation schema is its own: keys, compared fields, join mode, tolerance and severity. That is deliberate — a reconciliation has no normative basis to cite, and inventing one would make the report look more authoritative than it is.

The only format-level standards it depends on are the OOXML spreadsheet parts (`sharedStrings.xml`, `cellXfs`/`numFmtId`, `workbook.xml` plus `_rels`), which are read by `dsh-table-ingest`.

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

The tool takes two file paths and a YAML configuration:

| Field | Meaning |
|---|---|
| `a.table`, `a.keys` | Side A's table name and key fields |
| `b.table`, `b.keys` | Side B's, positionally matched to A's keys |
| `join` | `full` (default), `left`, `inner`, `right` |
| `compare[]` | Fields to compare: `a`, `b`, `kind` (`number`/`text`/`date`), `abs`, `rel`, `severity`, `label` |
| `duplicates` | `reject` (default) reports and skips, `aggregate` would sum |
| `scale` | Decimal places for money, default 2 |

Findings are typed: `number-diff`, `text-diff`, `date-diff`, `not-a-number`, `missing-in-a`, `missing-in-b`, `duplicate-key`, `empty-key`.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `rulesFile` | `rules/excel-reconcile.yaml` | 规则库路径 |

## Material format

```yaml
a: { table: 应收, keys: [合同号] }
b: { table: 对账单, keys: [合同号] }
join: full
compare:
  - { a: 客户, kind: text }
  - { a: 金额, kind: number, abs: 0.01 }
  - { a: 到期日, kind: date }
```

The diff workbook has five sheets: 汇总, 差异明细 (one row per difference, filterable), 仅A存在, 仅B存在, 合并结果. The difference sheet's columns are fixed: 序号, 问题类型, 严重程度, 主键, 字段, A 侧, B 侧, 差异, 说明, 建议处理, 处理状态.

## Rule sources

There is no evidence directory because there is nothing to cite: the rule pack is empty by design and each reconciliation carries its own configuration.

```sh
pnpm run check:citations   # expects 0 segments, 0 placeholders, 0 untraceable
```

Known limits: the join is single-level (no chained joins); a key present twice is never paired; money is compared at the configured scale, so a value carrying more decimals than that is rounded; and a column missing on one side produces a difference on every matched row rather than being skipped.

## Troubleshooting

- **The plugin installs but the tool never appears**: check that `main` resolves to `lib/index.mjs` and that `pnpm run build` produced it.
- **`dsh plugin add` rejects the package**: the peer range covers `0.1.x` and `0.2.x`; outside it, grant an explicit exemption.
- **A rule did not run**: read the `skipped` array.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-excel-reconcile
```

## PerryLink DSH Plugin Family

Full family index: [choose a checker by material](https://perrylink.github.io/zh/checkers/choose/) and [all plugins](https://github.com/PerryLink). This repository is one of them.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-excel-reconcile contributors.
