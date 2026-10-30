# dsh-excel-reconcile — Excel reconcile (Español)

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-excel-reconcile?metric=downloads)](https://dshfind.com/en/plugins/PerryLink/dsh-excel-reconcile?ref=badge)

`dsh-excel-reconcile` une dos hojas de cálculo por una clave declarada y compara campos declarados con tolerancias declaradas, produciendo un informe markdown, un resultado JSON y un libro de diferencias.

Concilia, no dictamina: una diferencia significa que los dos lados no coinciden, no que uno esté mal. El dinero se compara en unidades menores enteras y no en coma flotante, así que `12.3` y `12.30000000001` son el mismo importe con dos decimales, y una clave repetida se informa en lugar de emparejarse con la primera coincidencia.

## Install

```sh
dsh plugin --profile <name> add dsh-excel-reconcile
dsh --profile <name> --dump-config | grep 'dsh-excel-reconcile'
```

## What it looks like

![Workflow diagram for dsh-excel-reconcile: document → rule pack → findings.](docs/assets/dsh-excel-reconcile-flow.svg)

*Workflow overview: document → rule pack → findings.*

**Límite:** es una herramienta de comparación, no una auditoría. No decide qué lado es correcto, no verifica que exista una factura y no evalúa si un pago era exigible. Una clave duplicada se informa y se deja sin comparar en lugar de emparejarse arbitrariamente, porque emparejar la primera coincidencia oculta la diferencia que importa. Las tolerancias son configuración, no normativa.

## What it answers

- ¿Qué claves están en un lado y no en el otro?
- ¿Qué filas emparejadas discrepan, en qué campo y cuánto?
- ¿Supera la discrepancia la tolerancia configurada?
- ¿Qué claves no pueden compararse por estar duplicadas?

## Standards it follows

Este paquete no codifica ninguna cláusula. El esquema de conciliación es propio: claves, campos comparados, modo de unión, tolerancia y severidad. Es deliberado: una conciliación no tiene una base normativa que citar, e inventarla haría que el informe pareciera más autoritativo de lo que es.

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
