#!/usr/bin/env node
/**
 * Adapt SEC XBRL company facts into two reconciliation tables.
 *
 * A = Apple's FY2023 10-K filing (filed 2023-11-03).
 * B = the same FY2023 comparative values as reported in the FY2024 10-K
 *     (filed 2024-11-01).
 *
 * This is a real cross-filing consistency check on public XBRL facts. It does
 * not parse 10-K HTML; the values are the XBRL facts themselves.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'NetIncomeLoss',
  'Assets',
  'Liabilities',
  'OperatingIncomeLoss',
  'GrossProfit',
  'ResearchAndDevelopmentExpense',
  'IncomeTaxExpenseBenefit',
  'CashAndCashEquivalentsAtCarryingValue',
  'EarningsPerShareDiluted',
]

function firstFact(facts, concept, filed, end) {
  const entries = facts?.[concept]?.units?.USD ?? []
  return entries.find((entry) => entry.form === '10-K' && entry.filed === filed && entry.end === end && typeof entry.val === 'number')
}

export function buildTables(document) {
  const facts = document?.facts?.['us-gaap']
  if (!facts) throw new Error('companyfacts JSON has no us-gaap facts')
  const a = []
  const b = []
  for (const concept of CONCEPTS) {
    const old = firstFact(facts, concept, '2023-11-03', '2023-09-30')
    const next = firstFact(facts, concept, '2024-11-01', '2023-09-30')
    if (!old || !next) continue
    a.push({ metric: concept, end: '2023-09-30', value: String(old.val) })
    b.push({ metric: concept, end: '2023-09-30', value: String(next.val) })
  }
  if (a.length < 5) throw new Error(`too few matched facts: ${a.length}`)
  return { a, b }
}

function csv(rows) {
  const header = 'metric,end,value'
  return [header, ...rows.map((row) => `${row.metric},${row.end},${row.value}`)].join('\n') + '\n'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2] ?? join(here, '.data', 'aapl-companyfacts.json')
  const out = process.argv[3] ?? join(here, '.data', 'tables')
  const document = JSON.parse(await readFile(input, 'utf8'))
  const { a, b } = buildTables(document)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'a.csv'), csv(a))
  await writeFile(join(out, 'b.csv'), csv(b))
  console.log(`wrote ${out}/a.csv (${a.length} rows) and b.csv`)
}
