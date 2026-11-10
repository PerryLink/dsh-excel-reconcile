#!/usr/bin/env node
/**
 * End-to-end SEC XBRL cross-filing reconciliation.
 *
 * Calls the real dsh-excel-reconcile tool from ../../lib/index.mjs. Side A and
 * side B are two public SEC XBRL filing snapshots of the same fiscal year.
 * Clean rows should reconcile; a one-cell mutation of B should be reported.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../../lib/index.mjs'
import { buildTables } from './adapter.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const document = JSON.parse(await readFile(join(here, '.data', 'aapl-companyfacts.json'), 'utf8'))
const { a, b } = buildTables(document)

const registered = []
plugin.apply({ tools: { register: (tool) => { registered.push(tool); return () => {} } } }, plugin.Config ? plugin.Config({}) : {})
const tool = registered.find((item) => item.name === plugin.TOOL_NAME)
if (!tool) throw new Error('excel-reconcile tool not registered')

const config = `a: { table: A, keys: [metric, end] }
b: { table: B, keys: [metric, end] }
join: full
compare:
  - { a: value, kind: number, abs: 0.01 }
`

function csv(rows) {
  return ['metric,end,value', ...rows.map((row) => `${row.metric},${row.end},${row.value}`)].join('\n') + '\n'
}

const root = await mkdtemp(join(tmpdir(), 'dsh-sec-xbrl-'))
let tp = 0, fp = 0, fn = 0, tn = 0
for (const [index, row] of b.entries()) {
  const dir = join(root, `case-${index}`)
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }))
  const cleanB = b.map((item) => ({ ...item }))
  const mutatedB = b.map((item, i) => i === index ? { ...item, value: String(Number(item.value) + 1000) } : ({ ...item }))
  for (const [kind, rows] of [['clean', cleanB], ['mutated', mutatedB]]) {
    const fileA = join(dir, `${kind}-a.csv`)
    const fileB = join(dir, `${kind}-b.csv`)
    await writeFile(fileA, csv(a))
    await writeFile(fileB, csv(rows))
    const result = await tool.execute({ fileA, fileB, config, outFile: join(dir, `${kind}-diff.xlsx`) }, { signal: new AbortController().signal })
    const found = Number(result.findingCount ?? 0)
    if (kind === 'clean') {
      if (found === 0) tn += 1
      else fp += 1
    } else {
      if (found === 1) tp += 1
      else fn += 1
    }
  }
}

const precision = tp + fp === 0 ? null : tp / (tp + fp)
const recall = tp + fn === 0 ? null : tp / (tp + fn)
const output = {
  dataset: 'SEC XBRL companyfacts: Apple FY2023 10-K vs FY2024 10-K comparative',
  source: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
  license: 'public domain (US federal work)',
  rows: a.length,
  generatedAt: new Date().toISOString(),
  total: { tp, fp, fn, tn, precision, recall },
  limitations: [
    'The two sides are XBRL facts, not HTML table extraction.',
    'This tests cross-filing consistency, not the correctness of the accounting.',
    'Apple is one issuer; no industry-wide claim.',
    'The mutation is synthetic; clean rows are real public facts.',
  ],
}
await writeFile(join(here, 'summary.json'), JSON.stringify(output, null, 2) + '\n')
console.log(`rows: ${a.length}`)
console.log(`precision ${precision === null ? 'n/a' : precision.toFixed(3)} · recall ${recall === null ? 'n/a' : recall.toFixed(3)} (TP ${tp} FP ${fp} FN ${fn} TN ${tn})`)
