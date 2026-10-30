# dsh-excel-reconcile — 两份表格逐字段对账

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

<!-- topblock:v1 -->
> **这是什么**　把两份表按主键对齐，逐字段告诉你哪里不一致。
> **给谁用**　财务、数据核对岗。
> **你交什么**　两份 Excel/CSV 表，按主键逐字段比较；不改原件。
> **它不做什么**　不判合规、不认定责任、不替代审核人；只列材料内部能逐条指认的差异。
> **怎么开始**　命令行安装（暂未单独上架）：
> `dsh plugin --profile <name> add dsh-excel-reconcile`
<!-- /topblock:v1 -->

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-excel-reconcile?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-excel-reconcile?ref=badge)

`dsh-excel-reconcile` 按声明的主键对齐两份表格，按声明的容差比较声明的字段，输出 Markdown 报告、JSON 结果与差异工作簿。

它对账，不裁决：出现差异说明两侧不一致，不说明哪一侧错了。金额按整数最小单位比较而非浮点，所以 `12.3` 与 `12.30000000001` 在两位小数下是同一笔；主键重复时报告出来、不做任意配对。

## Install

```sh
dsh plugin --profile <name> add dsh-excel-reconcile
dsh --profile <name> --dump-config | grep 'dsh-excel-reconcile'
```

## What it looks like

![Workflow diagram for dsh-excel-reconcile: document → rule pack → findings.](docs/assets/dsh-excel-reconcile-flow.svg)

*Workflow overview: document → rule pack → findings.*

**边界：** 这是比较工具，不是审计。它不判断哪一侧正确、不核实发票是否存在、也不判断款项是否该付。主键重复时报告并整键跳过，而不是随手配一条——配第一条会把真正重要的差异藏起来。容差是配置不是法规：报告里明确这么写，默认值只吸收舍入误差。

## What it answers

- 哪些主键只有一侧有？
- 哪些匹配上的行不一致、不一致在哪个字段、差多少？
- 这个差是否超出我配置的容差？
- 哪些主键因为重复而根本无法比较？

## Standards it follows

本包不编码任何条款。对账的 schema 是它自己的：主键、比较字段、连接方式、容差、严重度。这是刻意的——对账没有可引用的规范性依据，编一个会让报告显得比实际更权威。

它只依赖 OOXML 表格格式的部件（`sharedStrings.xml`、`cellXfs`/`numFmtId`、`workbook.xml` 与 `_rels`），由 `dsh-table-ingest` 读取。

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

工具接收两个文件路径与一份 YAML 配置：

| 字段 | 含义 |
|---|---|
| `a.table`、`a.keys` | A 侧表名与主键字段 |
| `b.table`、`b.keys` | B 侧表名与主键字段（与 A 按位置对应） |
| `join` | `full`（默认）、`left`、`inner`、`right` |
| `compare[]` | 要比较的字段：`a`、`b`、`kind`（`number`/`text`/`date`）、`abs`、`rel`、`severity`、`label` |
| `duplicates` | `reject`（默认）报告并跳过；`aggregate` 为分组求和 |
| `scale` | 金额小数位，默认 2 |

发现类型：`number-diff`、`text-diff`、`date-diff`、`not-a-number`、`missing-in-a`、`missing-in-b`、`duplicate-key`、`empty-key`。

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

差异工作簿 5 张表：汇总、差异明细（一行一条差异，可筛选）、仅A存在、仅B存在、合并结果。差异明细的列固定为：序号、问题类型、严重程度、主键、字段、A 侧、B 侧、差异、说明、建议处理、处理状态。

## Rule sources

没有取证目录，因为没有可引用的东西：规则库按设计为空，每份对账自带配置。

```sh
pnpm run check:citations   # 期望 0 segments, 0 placeholders, 0 untraceable
```

已知边界：连接只有一层（不做链式 join）；同一主键出现多次时永不配对；金额按配置的小数位比较，超过的位会被舍入；某一侧缺列时，每一行匹配行都会报差异，而不是跳过。

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

完整清单（62 个核查器 + 通用插件）见 [按材料选核查器](https://perrylink.github.io/zh/checkers/choose/)；本仓只是其中一个。

## License

[Apache License 2.0](LICENSE) © 2026 dsh-excel-reconcile contributors.
