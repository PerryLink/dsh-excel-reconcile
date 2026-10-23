/**
 * Two-table reconciliation.
 *
 * The engine joins two tables on a declared key and compares declared fields with
 * declared tolerances. It deliberately does *not* guess: a key that appears twice
 * on either side is reported rather than silently paired, because pairing the
 * first of several matches produces a difference that does not exist and hides
 * the one that does.
 *
 * Money is compared as integer minor units (BigInt), never as floating point:
 * `12.3` and `12.30000000001` are the same amount at two decimal places, and a
 * `sum` rule that accumulates in `number` drifts away from the customer's own
 * total.
 */

import type { TableJson } from 'dsh-table-ingest/api'

/** How the two sides are joined. */
export type JoinMode = 'full' | 'left' | 'inner' | 'right'

/** How a field is compared. */
export type CompareKind = 'number' | 'text' | 'date'

/** One field to compare between the sides. */
export interface CompareField {
  /** Field name on side A. */
  a: string
  /** Field name on side B; defaults to `a`. */
  b?: string
  /** Comparison mode. */
  kind: CompareKind
  /** Absolute tolerance in the field's own units (numbers only). */
  abs?: number
  /** Relative tolerance, applied as `abs + rel * max(|a|, |b|)`. */
  rel?: number
  /** Severity when the two sides differ beyond tolerance. */
  severity?: 'error' | 'warn' | 'info'
  /** Human label used in messages; defaults to the A field name. */
  label?: string
}

/** The whole reconciliation configuration. */
export interface ReconcileConfig {
  /** Side A: table name and the key fields. */
  a: { table: string; keys: string[] }
  /** Side B: table name and the key fields, aligned positionally with A. */
  b: { table: string; keys: string[] }
  /** Join mode; `full` is the safe default for reconciliation. */
  join?: JoinMode
  /** Fields compared when both sides have the row. */
  compare: CompareField[]
  /** Fields that must exist on side A but have no counterpart; reported when absent. */
  onlyA?: string[]
  /** Same, for side B. */
  onlyB?: string[]
  /** Duplicate-key handling; `reject` (default) reports and skips the key. */
  duplicates?: 'reject' | 'aggregate'
  /** Decimal places for money; 2 by default. */
  scale?: number
}

/** One difference found. */
export interface Finding {
  /** Stable kind, e.g. `number-diff`. */
  type: string
  /** Severity for the report. */
  severity: 'error' | 'warn' | 'info'
  /** The join key rendered as `k1|k2`. */
  key: string
  /** Field that differs, when the finding is field-level. */
  field: string
  /** Value on side A. */
  a: string
  /** Value on side B. */
  b: string
  /** Signed difference for numbers, empty otherwise. */
  delta: string
  /** Human-readable description. */
  message: string
  /** Suggested next step. */
  suggestion: string
}

/** Counters for the summary sheet. */
export interface Summary {
  rowsA: number
  rowsB: number
  matched: number
  onlyA: number
  onlyB: number
  duplicateKeys: number
  compared: number
  errors: number
  warnings: number
  infos: number
}

/** Full reconciliation outcome. */
export interface ReconcileResult {
  summary: Summary
  findings: Finding[]
  /** Rows that matched, for the merged sheet. */
  matchedRows: { key: string; a: Record<string, string>; b: Record<string, string> }[]
  /** Keys present only on A. */
  onlyARows: { key: string; row: Record<string, string> }[]
  /** Keys present only on B. */
  onlyBRows: { key: string; row: Record<string, string> }[]
  warnings: string[]
}

/** Raised when the configuration or the input cannot be reconciled. */
export class ReconcileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReconcileError'
  }
}

/** Normalise a key cell: trim, collapse whitespace, upper-case, NFKC. */
export function normaliseKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toUpperCase()
}

/**
 * Parse a decimal string into integer minor units.
 *
 * @param text - e.g. `1,234.56`, `-0.005`, ``.
 * @param scale - decimal places.
 * @returns the minor-unit value, or `undefined` when the text is not a number.
 */
export function parseMinor(text: string, scale: number): bigint | undefined {
  const cleaned = text.replace(/[\s,，]/gu, '')
  if (cleaned === '' || !/^-?\d*(?:\.\d*)?$/u.test(cleaned)) return undefined
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [whole = '0', frac = ''] = unsigned.split('.')
  const padded = (frac + '0'.repeat(scale)).slice(0, scale)
  const digits = `${whole === '' ? '0' : whole}${padded}`
  const value = BigInt(digits)
  return negative ? -value : value
}

/** Render minor units back to a decimal string. */
export function formatMinor(value: bigint, scale: number): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  const whole = digits.slice(0, digits.length - scale)
  const frac = scale === 0 ? '' : `.${digits.slice(digits.length - scale)}`
  return `${negative ? '-' : ''}${whole}${frac}`
}

/** Tolerance in minor units, given an absolute and relative allowance. */
function tolerance(abs: number | undefined, rel: number | undefined, left: bigint, right: bigint, scale: number): bigint {
  const absMinor = abs === undefined ? 0n : parseMinor(abs.toFixed(scale), scale) ?? 0n
  const magnitude = left < 0n ? -left : left
  const other = right < 0n ? -right : right
  const max = magnitude > other ? magnitude : other
  const relMinor = rel === undefined ? 0n : (max * parseMinor(rel.toFixed(Math.max(scale, 4)), 4)! * 10n ** BigInt(scale)) / 10n ** BigInt(Math.max(scale, 4))
  return absMinor + (relMinor < 0n ? -relMinor : relMinor)
}

/** Render a row's key from the configured key fields. */
function keyOf(row: Record<string, string>, fields: readonly string[]): string {
  return fields.map((field) => normaliseKey(row[field] ?? '')).join('|')
}

/** Index rows by key, remembering every row under a key so duplicates surface. */
function indexByKey(rows: Record<string, string>[], fields: readonly string[]): Map<string, Record<string, string>[]> {
  const index = new Map<string, Record<string, string>[]>()
  for (const row of rows) {
    const key = keyOf(row, fields)
    const bucket = index.get(key)
    if (bucket === undefined) index.set(key, [row])
    else bucket.push(row)
  }
  return index
}

/** Compare one field between two rows, appending a finding when it differs. */
function compareField(
  field: CompareField,
  key: string,
  left: Record<string, string>,
  right: Record<string, string>,
  scale: number,
): Finding | undefined {
  const nameB = field.b ?? field.a
  const rawA = (left[field.a] ?? '').trim()
  const rawB = (right[nameB] ?? '').trim()
  const label = field.label ?? field.a
  const severity = field.severity ?? 'error'

  if (field.kind === 'number') {
    const leftMinor = parseMinor(rawA, scale)
    const rightMinor = parseMinor(rawB, scale)
    if (leftMinor === undefined || rightMinor === undefined) {
      // A non-numeric cell in a numeric field is its own finding: it cannot be
      // compared, and silently skipping it would hide an unreadable amount.
      if (rawA === '' && rawB === '') return undefined
      return {
        type: 'not-a-number',
        severity: 'warn',
        key,
        field: label,
        a: rawA,
        b: rawB,
        delta: '',
        message: `「${label}」不是可比较的数字（A=${rawA === '' ? '空' : rawA}，B=${rawB === '' ? '空' : rawB}）`,
        suggestion: '确认该单元格是否被文本、单位或公式错误污染',
      }
    }
    const delta = leftMinor - rightMinor
    const magnitude = delta < 0n ? -delta : delta
    const allowed = tolerance(field.abs, field.rel, leftMinor, rightMinor, scale)
    if (magnitude <= allowed) return undefined
    return {
      type: 'number-diff',
      severity,
      key,
      field: label,
      a: formatMinor(leftMinor, scale),
      b: formatMinor(rightMinor, scale),
      delta: formatMinor(delta, scale),
      message: `「${label}」A 与 B 相差 ${formatMinor(delta, scale)}（容差 ${formatMinor(allowed, scale)}）`,
      suggestion: '核对原始凭证；容差内的小差异通常是舍入',
    }
  }

  if (rawA === '' && rawB === '') return undefined
  const equal = field.kind === 'date' ? rawA === rawB : normaliseKey(rawA) === normaliseKey(rawB)
  if (equal) return undefined
  return {
    type: field.kind === 'date' ? 'date-diff' : 'text-diff',
    severity,
    key,
    field: label,
    a: rawA,
    b: rawB,
    delta: '',
    message: rawA === '' || rawB === ''
      ? `「${label}」只有一侧有值（A=${rawA === '' ? '空' : rawA}，B=${rawB === '' ? '空' : rawB}）`
      : `「${label}」不一致（A=${rawA}，B=${rawB}）`,
    suggestion: '确认以哪一侧为准，或补录缺失的一侧',
  }
}

/**
 * Reconcile two tables.
 *
 * @param tables - parsed tables by name, as produced by the ingest layer.
 * @param config - join and comparison configuration.
 * @returns findings, counters and the rows needed to build the diff workbook.
 * @throws ReconcileError when a named table or key field is missing.
 */
export function reconcile(tables: Record<string, TableJson>, config: ReconcileConfig): ReconcileResult {
  const left = tables[config.a.table]
  const right = tables[config.b.table]
  if (left === undefined) throw new ReconcileError(`找不到表「${config.a.table}」，实际有：${Object.keys(tables).join('、')}`)
  if (right === undefined) throw new ReconcileError(`找不到表「${config.b.table}」，实际有：${Object.keys(tables).join('、')}`)
  if (config.a.keys.length !== config.b.keys.length) {
    throw new ReconcileError('两侧主键字段数量必须一致（按位置对应）')
  }
  for (const field of config.a.keys) {
    if (!(field in (left.rows[0] ?? {})) && left.rows.length > 0) {
      throw new ReconcileError(`A 表没有主键列「${field}」，实际列：${Object.keys(left.rows[0] ?? {}).join('、')}`)
    }
  }
  for (const field of config.b.keys) {
    if (!(field in (right.rows[0] ?? {})) && right.rows.length > 0) {
      throw new ReconcileError(`B 表没有主键列「${field}」，实际列：${Object.keys(right.rows[0] ?? {}).join('、')}`)
    }
  }

  const scale = config.scale ?? 2
  const join = config.join ?? 'full'
  const warnings: string[] = []
  const findings: Finding[] = []

  const indexA = indexByKey(left.rows, config.a.keys)
  const indexB = indexByKey(right.rows, config.b.keys)

  let duplicateKeys = 0
  const rejected = new Set<string>()
  if ((config.duplicates ?? 'reject') === 'reject') {
    for (const [key, bucket] of [...indexA, ...indexB]) {
      if (bucket.length > 1 && !rejected.has(key)) {
        rejected.add(key)
        duplicateKeys++
        findings.push({
          type: 'duplicate-key',
          severity: 'error',
          key,
          field: config.a.keys.join('+'),
          a: String(indexA.get(key)?.length ?? 0),
          b: String(indexB.get(key)?.length ?? 0),
          delta: '',
          message: `主键「${key}」在一侧出现多次（A=${indexA.get(key)?.length ?? 0}，B=${indexB.get(key)?.length ?? 0}），整键不比较`,
          suggestion: '先拆分或合并重复行；一对多场景请显式改用 aggregate',
        })
      }
    }
  }

  const matches: { key: string; a: Record<string, string>; b: Record<string, string> }[] = []
  const onlyA: { key: string; row: Record<string, string> }[] = []
  const onlyB: { key: string; row: Record<string, string> }[] = []

  const keys = new Set<string>([...indexA.keys(), ...indexB.keys()])
  for (const key of keys) {
    const bucketA = indexA.get(key)
    const bucketB = indexB.get(key)
    if (key === '|' || key === '') {
      findings.push({
        type: 'empty-key',
        severity: 'warn',
        key: '(空)',
        field: config.a.keys.join('+'),
        a: String(bucketA?.length ?? 0),
        b: String(bucketB?.length ?? 0),
        delta: '',
        message: '主键为空，无法关联（空主键的行不会按位置配对）',
        suggestion: '补齐主键列；空主键通常是表尾的合计行',
      })
      continue
    }
    if (rejected.has(key)) continue

    const rowA = bucketA?.[0]
    const rowB = bucketB?.[0]

    if (rowA !== undefined && rowB !== undefined) {
      matches.push({ key, a: rowA, b: rowB })
      for (const field of config.compare) {
        const finding = compareField(field, key, rowA, rowB, scale)
        if (finding !== undefined) findings.push(finding)
      }
      continue
    }
    if (rowA !== undefined) {
      if (join === 'inner' || join === 'right') continue
      onlyA.push({ key, row: rowA })
      findings.push({
        type: 'missing-in-b',
        severity: join === 'left' ? 'error' : 'warn',
        key,
        field: config.a.keys.join('+'),
        a: '有',
        b: '',
        delta: '',
        message: `A 有、B 没有（主键 ${key}）`,
        suggestion: '确认 B 侧是否漏记；若 B 是汇总表，说明该行未进入汇总',
      })
      continue
    }
    if (rowB !== undefined) {
      if (join === 'inner' || join === 'left') continue
      onlyB.push({ key, row: rowB })
      findings.push({
        type: 'missing-in-a',
        severity: 'warn',
        key,
        field: config.b.keys.join('+'),
        a: '',
        b: '有',
        delta: '',
        message: `B 有、A 没有（主键 ${key}）`,
        suggestion: '确认 A 侧是否漏记；若 A 是明细表，说明 B 多出一笔',
      })
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length
  const warns = findings.filter((f) => f.severity === 'warn').length
  const infos = findings.filter((f) => f.severity === 'info').length
  if (left.rows.length === 0) warnings.push(`A 表「${config.a.table}」没有数据行`)
  if (right.rows.length === 0) warnings.push(`B 表「${config.b.table}」没有数据行`)

  return {
    summary: {
      rowsA: left.rows.length,
      rowsB: right.rows.length,
      matched: matches.length,
      onlyA: onlyA.length,
      onlyB: onlyB.length,
      duplicateKeys,
      compared: matches.length * config.compare.length,
      errors,
      warnings: warns,
      infos,
    },
    findings,
    matchedRows: matches,
    onlyARows: onlyA,
    onlyBRows: onlyB,
    warnings,
  }
}
