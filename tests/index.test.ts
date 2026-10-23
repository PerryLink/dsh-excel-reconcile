/**
 * Reconciliation behaviour, plus a round-trip through the writer and the reader.
 *
 * The round-trip matters: a diff workbook that Excel refuses to open, or that our
 * own reader cannot parse, is worse than no workbook, because it looks like a
 * deliverable.
 */

import { describe, expect, it } from 'vitest'
import { readWorkbook } from 'dsh-table-ingest/api'
import { writeWorkbook } from '../src/xlsx-write.ts'
import { reconcile, parseMinor, formatMinor, normaliseKey, ReconcileError, type ReconcileConfig } from '../src/model.ts'
import { parseYaml } from '../src/shared/yaml.ts'
import { buildWorkbook, DIFF_COLUMNS, renderMarkdown } from '../src/report.ts'

/** Build a one-sheet workbook and read it back as a table. */
function tableOf(name: string, header: string[], rows: (string | number | null)[][]) {
  const buffer = writeWorkbook([{ name: 'Sheet1', header, rows }])
  const workbook = readWorkbook(buffer)
  const grid = workbook.sheets[0]?.grid ?? []
  const [head = [], ...body] = grid
  const parsed: Record<string, string>[] = body.map((row) =>
    Object.fromEntries((head ?? []).map((column, index) => [column, row[index] ?? ''])),
  )
  return { table: { target: name, tableIndex: 0, headerRows: [1], columns: head, header: {}, rows: parsed, warnings: [], mergedCells: 0, sections: [], ragged: false }, buffer }
}

const ACCOUNTS = ['合同号', '客户', '金额', '到期日']
const LEDGER = ['合同号', '客户', '金额', '到期日']

function sides() {
  const a = tableOf('应收', ACCOUNTS, [
    ['HT-001', '甲公司', 1200.5, '2026-10-01'],
    ['HT-002', '乙公司', 800, '2026-10-05'],
    ['HT-003', '丙公司', 300, '2026-10-09'],
  ])
  const b = tableOf('对账单', LEDGER, [
    ['HT-001', '甲公司', 1200.5, '2026-10-01'],
    ['HT-002', '乙公司', 800.02, '2026-10-05'],
    ['HT-004', '丁公司', 450, '2026-10-11'],
  ])
  return { a: a.table, b: b.table }
}

const CONFIG = {
  a: { table: '应收', keys: ['合同号'] },
  b: { table: '对账单', keys: ['合同号'] },
  compare: [
    { a: '客户', kind: 'text' as const },
    { a: '金额', kind: 'number' as const, abs: 0.01 },
    { a: '到期日', kind: 'date' as const },
  ],
}

describe('money arithmetic', () => {
  it('treats two decimal places as the unit of comparison', () => {
    expect(parseMinor('12.3', 2)).toBe(1230n)
    expect(parseMinor('12.30000000001', 2)).toBe(1230n)
    expect(parseMinor('12.3', 2)).toBe(parseMinor('12.30000000001', 2))
  })

  it('accepts thousands separators and an accounting negative', () => {
    expect(parseMinor('1,234.56', 2)).toBe(123456n)
    expect(parseMinor('-0.01', 2)).toBe(-1n)
  })

  it('rejects text that is not a number rather than coercing it to zero', () => {
    expect(parseMinor('约 1200', 2)).toBeUndefined()
    expect(parseMinor('', 2)).toBeUndefined()
  })

  it('round-trips through the formatter', () => {
    expect(formatMinor(1230n, 2)).toBe('12.30')
    expect(formatMinor(-1n, 2)).toBe('-0.01')
    expect(formatMinor(100000n, 2)).toBe('1000.00')
  })
})

describe('key normalisation', () => {
  it('collapses whitespace and case so a stray space is not a missing row', () => {
    expect(normaliseKey(' ht-001 ')).toBe('HT-001')
    expect(normaliseKey('HT-001')).toBe(normaliseKey('ht-001'))
  })
})

describe('reconcile', () => {
  it('matches on the key and compares the declared fields', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    expect(result.summary.rowsA).toBe(3)
    expect(result.summary.rowsB).toBe(3)
    expect(result.summary.matched).toBe(2)
  })

  it('tolerates a difference inside the absolute tolerance', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    const amountDiffs = result.findings.filter((f) => f.type === 'number-diff')
    // 1200.50 matches exactly; 800 vs 800.02 is 0.02 > 0.01, so exactly one.
    expect(amountDiffs).toHaveLength(1)
    expect(amountDiffs[0]?.key).toBe('HT-002')
    expect(amountDiffs[0]?.delta).toBe('-0.02')
  })

  it('reports a row present on only one side, in both directions', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    expect(result.onlyARows.map((r) => r.key)).toEqual(['HT-003'])
    expect(result.onlyBRows.map((r) => r.key)).toEqual(['HT-004'])
    expect(result.findings.some((f) => f.type === 'missing-in-b')).toBe(true)
    expect(result.findings.some((f) => f.type === 'missing-in-a')).toBe(true)
  })

  it('drops the unmatched rows under an inner join', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, { ...CONFIG, join: 'inner' })
    expect(result.summary.matched).toBe(2)
    expect(result.onlyARows).toHaveLength(0)
    expect(result.onlyBRows).toHaveLength(0)
  })

  it('refuses to pair a duplicated key and says so', () => {
    const a = tableOf('应收', ACCOUNTS, [
      ['HT-001', '甲公司', 100, '2026-10-01'],
      ['HT-001', '甲公司', 100, '2026-10-01'],
    ]).table
    const b = tableOf('对账单', LEDGER, [['HT-001', '甲公司', 100, '2026-10-01']]).table
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    expect(result.summary.duplicateKeys).toBe(1)
    expect(result.summary.matched).toBe(0)
    expect(result.findings.some((f) => f.type === 'duplicate-key')).toBe(true)
  })

  it('reports a non-numeric amount instead of silently skipping it', () => {
    const a = tableOf('应收', ACCOUNTS, [['HT-001', '甲公司', '约一千二', '2026-10-01']]).table
    const b = tableOf('对账单', LEDGER, [['HT-001', '甲公司', 1200, '2026-10-01']]).table
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    expect(result.findings.some((f) => f.type === 'not-a-number')).toBe(true)
  })

  it('flags an empty key rather than treating it as a row', () => {
    const a = tableOf('应收', ACCOUNTS, [['', '合计', 2300, '']]).table
    const b = tableOf('对账单', LEDGER, [['', '合计', 2300, '']]).table
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    expect(result.findings.some((f) => f.type === 'empty-key')).toBe(true)
  })

  it('names the missing column instead of comparing blanks', () => {
    const a = tableOf('应收', ACCOUNTS, [['HT-001', '甲公司', 100, '2026-10-01']]).table
    const b = tableOf('对账单', ['合同号', '金额'], [['HT-001', 100]]).table
    const result = reconcile(
      { 应收: a, 对账单: b },
      { ...CONFIG, compare: [{ a: '到期日', kind: 'date' as const }] },
    )
    // A column absent on B is not "same value"; it is a difference on every row.
    expect(result.findings.some((f) => f.type === 'date-diff')).toBe(true)
  })

  it('throws with the available table names when a table is misnamed', () => {
    const { a, b } = sides()
    expect(() => reconcile({ 应收: a, 对账单: b }, { ...CONFIG, b: { table: '流水', keys: ['合同号'] } }))
      .toThrow(ReconcileError)
  })
})

describe('diff workbook', () => {
  it('round-trips through the reader, so the deliverable is not corrupt', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    const workbook = buildWorkbook(result, CONFIG)
    const readBack = readWorkbook(workbook)
    expect(readBack.sheets.map((s) => s.name)).toEqual(['汇总', '差异明细', '仅A存在', '仅B存在', '合并结果'])
    expect(readBack.sheets[1]?.grid[0]).toEqual([...DIFF_COLUMNS])
    // header + one row per finding
    expect(readBack.sheets[1]?.grid.length).toBe(result.findings.length + 1)
  })

  it('keeps a long identifier as text so it does not become scientific notation', () => {
    const digits = '26141200000000000001'
    const buffer = writeWorkbook([{ name: 'S', header: ['号码'], rows: [[digits]] }])
    const grid = readWorkbook(buffer).sheets[0]?.grid ?? []
    expect(grid[1]?.[0]).toBe(digits)
  })

  it('rejects a sheet name Excel would refuse', () => {
    expect(() => writeWorkbook([{ name: 'a/b', header: ['x'], rows: [] }])).toThrow()
    expect(() => writeWorkbook([{ name: 'x'.repeat(32), header: ['x'], rows: [] }])).toThrow()
    expect(() => writeWorkbook([])).toThrow()
  })
})

describe('markdown report', () => {
  it('states the boundary and does not claim which side is right', () => {
    const { a, b } = sides()
    const result = reconcile({ 应收: a, 对账单: b }, CONFIG)
    const markdown = renderMarkdown(result, CONFIG, { a: 'a.xlsx', b: 'b.xlsx' })
    expect(markdown).toContain('不判断哪一侧正确')
    expect(markdown).toContain('容差的取值是本工具配置，不是法规要求')
    expect(markdown).toContain('HT-002')
  })
})

describe('yaml reader regression', () => {
  it('reads an inline map in a sequence as a mapping, not a string', () => {
    // A published 0.1.0 shipped an older shared/yaml.ts: `- {a: 金额, kind: money}`
    // was read as the literal string. The config then had no usable `compare`
    // entries, so value differences were silently *not reported* — the worst
    // failure mode for a reconciliation tool.
    const parsed = parseYaml('compare:\n  - {a: 金额, kind: money}\n  - {a: 客户, kind: text}\n') as {
      compare: Array<Record<string, string>>
    }
    expect(parsed.compare).toHaveLength(2)
    expect(parsed.compare[0]?.a).toBe('金额')
    expect(parsed.compare[0]?.kind).toBe('money')
  })

  it('reports a value difference when the config is written inline', () => {
    const a = tableOf('应收', ['合同号', '金额'], [['HT-001', '12000.00']]).table
    const b = tableOf('对账单', ['合同号', '金额'], [['HT-001', '8000.00']]).table
    const config = parseYaml(
      'a:\n  table: 应收\n  keys: [合同号]\nb:\n  table: 对账单\n  keys: [合同号]\n' +
      'compare:\n  - {a: 金额, kind: money}\n',
    ) as ReconcileConfig
    const result = reconcile({ 应收: a, 对账单: b }, config)
    // The engine classifies a money comparison as `text-diff` when both sides are
    // present; what matters here is that the difference is reported at all, which
    // it was not in 0.1.0.
    const diff = result.findings.find((finding) => finding.field === '金额')
    expect(diff).toBeDefined()
    expect(diff?.a).toBe('12000.00')
    expect(diff?.b).toBe('8000.00')
  })
})
