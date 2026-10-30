# dsh-excel-reconcile — Excel reconcile (हिन्दी)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-excel-reconcile?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-excel-reconcile?ref=badge)

`dsh-excel-reconcile` दो स्प्रेडशीट को घोषित कुंजी पर जोड़ता है और घोषित सहनशीलता के साथ घोषित फ़ील्ड की तुलना करता है, जिससे मार्कडाउन रिपोर्ट, JSON परिणाम और अंतर-कार्यपुस्तिका बनती है।

यह मिलान करता है, निर्णय नहीं: अंतर का अर्थ है कि दोनों पक्ष सहमत नहीं हैं, यह नहीं कि कोई गलत है। राशि पूर्णांक लघु-इकाइयों में तुलना की जाती है, फ़्लोटिंग पॉइंट में नहीं, इसलिए `12.3` और `12.30000000001` दो दशमलव पर समान हैं, और दोहराई गई कुंजी पहली मिलान से जोड़े जाने के बजाय सूचित की जाती है।

## Install

```sh
dsh plugin --profile <name> add dsh-excel-reconcile
dsh --profile <name> --dump-config | grep 'dsh-excel-reconcile'
```

## What it looks like

![Workflow diagram for dsh-excel-reconcile: document → rule pack → findings.](docs/assets/dsh-excel-reconcile-flow.svg)

*Workflow overview: document → rule pack → findings.*

**सीमा:** यह तुलना उपकरण है, ऑडिट नहीं। यह तय नहीं करता कि कौन-सा पक्ष सही है, चालान के अस्तित्व की पुष्टि नहीं करता, और यह नहीं आँकता कि भुगतान देय था या नहीं। दोहरी कुंजी सूचित की जाती है और बिना तुलना छोड़ दी जाती है, क्योंकि पहली मिलान से जोड़ना असली अंतर छिपा देता है। सहनशीलता कॉन्फ़िगरेशन है, नियम नहीं।

## What it answers

- कौन-सी कुंजियाँ एक पक्ष में हैं और दूसरे में नहीं?
- कौन-सी जोड़ी गई पंक्तियाँ भिन्न हैं, किस फ़ील्ड में और कितनी?
- क्या अंतर कॉन्फ़िगर की गई सहनशीलता से अधिक है?
- कौन-सी कुंजियाँ दोहरी होने के कारण तुलना योग्य नहीं हैं?

## Standards it follows

यह पैकेज कोई खंड कूटबद्ध नहीं करता। मिलान का स्कीमा इसका अपना है: कुंजियाँ, तुलना किए गए फ़ील्ड, जॉइन मोड, सहनशीलता और गंभीरता। यह जानबूझकर है — मिलान के पास उद्धृत करने योग्य कोई नियामक आधार नहीं है, और गढ़ना रिपोर्ट को वास्तविकता से अधिक आधिकारिक बना देगा।

## Compatibility

| Surface | Status |
|---|---|
| Harness | peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | all (pure ESM; no native code, no network, no model call) |

## What it does

The tool takes two file paths and a YAML configuration (`a.table`/`a.keys`, `b.table`/`b.keys`, `join`, `compare[]`, `duplicates`, `scale`). Findings are typed: `number-diff`, `text-diff`, `date-diff`, `not-a-number`, `missing-in-a`, `missing-in-b`, `duplicate-key`, `empty-key`.

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

The diff workbook has five sheets: 汇总, 差异明细 (one row per difference, filterable), 仅A存在, 仅B存在, 合并结果.

## Rule sources

There is no evidence directory because there is nothing to cite: the rule pack is empty by design and each reconciliation carries its own configuration. `pnpm run check:citations` expects 0 segments, 0 placeholders, 0 untraceable. Known limits: single-level join, duplicate keys never paired, money compared at the configured scale, and a column missing on one side produces a difference on every matched row.

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
