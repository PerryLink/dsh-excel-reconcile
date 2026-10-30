# dsh-excel-reconcile — Excel reconcile (Português)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-excel-reconcile?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-excel-reconcile?ref=badge)

`dsh-excel-reconcile` une duas planilhas por uma chave declarada e compara campos declarados com tolerâncias declaradas, produzindo um relatório markdown, um resultado JSON e uma pasta de trabalho de diferenças.

Concilia, não julga: uma diferença significa que os dois lados não coincidem, não que um esteja errado. O dinheiro é comparado em unidades menores inteiras e não em ponto flutuante, então `12.3` e `12.30000000001` são o mesmo valor com duas casas, e uma chave repetida é reportada em vez de emparelhada com a primeira ocorrência.

## Install

```sh
dsh plugin --profile <name> add dsh-excel-reconcile
dsh --profile <name> --dump-config | grep 'dsh-excel-reconcile'
```

## What it looks like

![Workflow diagram for dsh-excel-reconcile: document → rule pack → findings.](docs/assets/dsh-excel-reconcile-flow.svg)

*Workflow overview: document → rule pack → findings.*

**Limite:** é uma ferramenta de comparação, não uma auditoria. Não decide qual lado está correto, não verifica se existe uma nota fiscal e não avalia se um pagamento era devido. Uma chave duplicada é reportada e deixada sem comparação em vez de emparelhada arbitrariamente, porque emparelhar a primeira ocorrência esconde a diferença que importa. Tolerâncias são configuração, não norma.

## What it answers

- Quais chaves existem em um lado e não no outro?
- Quais linhas emparelhadas divergem, em qual campo e quanto?
- A divergência excede a tolerância configurada?
- Quais chaves não podem ser comparadas por estarem duplicadas?

## Standards it follows

Este pacote não codifica nenhuma cláusula. O esquema de conciliação é próprio: chaves, campos comparados, modo de junção, tolerância e severidade. É deliberado: uma conciliação não tem base normativa a citar, e inventá-la faria o relatório parecer mais autoritativo do que é.

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
