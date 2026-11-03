/**
 * Minimal first run for dsh-excel-reconcile.
 *
 * Input: two hand-written synthetic CSVs in `input/`. Side A is an accounts
 * receivable ledger, side B is the customer statement; they differ in one
 * amount and each has one row the other lacks.
 *
 *   node samples/quickstart/run.mjs           human-readable summary
 *   node samples/quickstart/run.mjs --json    the same summary as JSON
 *   node samples/quickstart/run.mjs --check   compare against expected/result.json
 */
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as plugin from '../../lib/index.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// The tool also writes a difference workbook. Put it in the OS temp directory so
// running the sample never touches the checkout.
const outFile = join(tmpdir(), 'dsh-excel-reconcile-quickstart', 'reconcile-diff.xlsx')
try { await mkdir(dirname(outFile), { recursive: true }) } catch { /* read-only temp is fine */ }

// Reconciliation configuration, passed as YAML text (the tool accepts YAML or JSON).
const config = `a: { table: 应收, keys: [合同号] }
b: { table: 对账单, keys: [合同号] }
join: full
compare:
  - { a: 客户, kind: text }
  - { a: 金额, kind: number, abs: 0.01 }
  - { a: 到期日, kind: date }
`

const registered = []
const ctx = { tools: { register: (tool) => { registered.push(tool); return () => {} } } }
plugin.apply(ctx, plugin.Config({}))
const tool = registered.find((t) => t.name === plugin.TOOL_NAME)
if (!tool) throw new Error('tool not registered: ' + plugin.TOOL_NAME)

const result = await tool.execute(
  {
    fileA: join(here, 'input', 'ar-ledger-a.csv'),
    fileB: join(here, 'input', 'ar-ledger-b.csv'),
    config,
    outFile,
  },
  { signal: new AbortController().signal },
)

const summary = {
  tool: tool.name,
  summary: result.summary,
  findingCount: result.findingCount,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2))
} else if (process.argv.includes('--check')) {
  const expected = JSON.parse(await readFile(join(here, 'expected', 'result.json'), 'utf8'))
  if (JSON.stringify(summary, null, 2) !== JSON.stringify(expected, null, 2)) {
    console.error('quickstart: output differs from expected/result.json')
    console.error('--- expected\n' + JSON.stringify(expected, null, 2))
    console.error('--- actual\n' + JSON.stringify(summary, null, 2))
    process.exit(1)
  }
  console.log(`${tool.name}: quickstart OK — output matches expected/result.json`)
} else {
  const s = summary.summary
  console.log('$ node samples/quickstart/run.mjs')
  console.log(
    `${tool.name}: ${summary.findingCount} finding(s) — ` +
      `${s.errors} error, ${s.warnings} warn, ${s.infos} info`,
  )
  console.log(
    `rows: A=${s.rowsA} B=${s.rowsB}, matched ${s.matched}, only A=${s.onlyA}, ` +
      `only B=${s.onlyB}, duplicate keys=${s.duplicateKeys}`,
  )
}
