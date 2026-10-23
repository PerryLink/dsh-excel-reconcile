/**
 * Markdown report and diff workbook for a reconciliation.
 *
 * The workbook is the artifact a person actually works in: one row per difference,
 * filterable, with the key and both values side by side. The markdown report is
 * for reading and pasting into a message.
 */

import { writeWorkbook, type Cell, type Sheet } from './xlsx-write.ts'
import type { Finding, ReconcileConfig, ReconcileResult } from './model.ts'

/** Column order of the difference sheet; frozen here so consumers can rely on it. */
export const DIFF_COLUMNS = [
  '序号',
  '问题类型',
  '严重程度',
  '主键',
  '字段',
  'A 侧',
  'B 侧',
  '差异',
  '说明',
  '建议处理',
  '处理状态',
] as const

/** Severity ordering used everywhere a list is sorted. */
const SEVERITY_ORDER: Record<string, number> = { error: 0, warn: 1, info: 2 }

/**
 * Render the findings as a markdown report.
 *
 * @param result - reconciliation outcome.
 * @param config - the configuration, echoed so the report is self-describing.
 * @param sources - the two file paths.
 * @returns markdown text.
 */
export function renderMarkdown(
  result: ReconcileResult,
  config: ReconcileConfig,
  sources: { a: string; b: string },
): string {
  const lines: string[] = []
  const { summary } = result

  lines.push('# 对账结果')
  lines.push('')
  lines.push(`- 检查对象：A = ${sources.a}｜B = ${sources.b}`)
  lines.push(`- 连接方式：${config.join ?? 'full'}（全外连接）`)
  lines.push(`- 主键：A 的 ${config.a.keys.join(' + ')} ↔ B 的 ${config.b.keys.join(' + ')}`)
  lines.push(
    `- 结果统计：错误 ${summary.errors} · 提示 ${summary.warnings} · 参考 ${summary.infos} · 共 ${result.findings.length} 条`,
  )
  lines.push('')
  lines.push('## 行数')
  lines.push('')
  lines.push('| 项 | 数量 |')
  lines.push('|---|---|')
  lines.push(`| A 表行数 | ${summary.rowsA} |`)
  lines.push(`| B 表行数 | ${summary.rowsB} |`)
  lines.push(`| 已匹配 | ${summary.matched} |`)
  lines.push(`| 只在 A | ${summary.onlyA} |`)
  lines.push(`| 只在 B | ${summary.onlyB} |`)
  lines.push(`| 主键重复（未比较） | ${summary.duplicateKeys} |`)
  lines.push(`| 比较字段次数 | ${summary.compared} |`)
  lines.push('')

  if (result.findings.length === 0) {
    lines.push('## 未发现差异')
    lines.push('')
    lines.push('两侧按声明的主键与容差逐字段一致。')
  } else {
    lines.push('## 差异清单')
    lines.push('')
    const sorted = [...result.findings].sort(
      (left, right) => (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9),
    )
    for (const finding of sorted) {
      const label = finding.severity === 'error' ? '错误' : finding.severity === 'warn' ? '提示' : '参考'
      lines.push(`- **[${label}] ${finding.type}** — ${finding.message}`)
      lines.push(`  - 主键：\`${finding.key}\`｜字段：${finding.field}`)
      lines.push(`  - 建议：${finding.suggestion}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('')
    lines.push('## 提示')
    lines.push('')
    for (const warning of result.warnings) lines.push(`- ${warning}`)
  }

  lines.push('')
  lines.push('## 边界')
  lines.push('')
  lines.push('本报告只报告两侧数值与文本的字面差异，不判断哪一侧正确，也不评价业务合规性。')
  lines.push('容差内的差异按配置放行；容差的取值是本工具配置，不是法规要求。')
  lines.push('')
  return lines.join('\n')
}

/** Build the diff workbook. */
export function buildWorkbook(result: ReconcileResult, config: ReconcileConfig): Buffer {
  const { summary } = result

  const summarySheet: Sheet = {
    name: '汇总',
    header: ['项', '数量'],
    rows: [
      ['A 表行数', summary.rowsA],
      ['B 表行数', summary.rowsB],
      ['已匹配', summary.matched],
      ['只在 A', summary.onlyA],
      ['只在 B', summary.onlyB],
      ['主键重复（未比较）', summary.duplicateKeys],
      ['比较字段次数', summary.compared],
      ['错误', summary.errors],
      ['提示', summary.warnings],
      ['参考', summary.infos],
      ['连接方式', config.join ?? 'full'],
      ['主键（A）', config.a.keys.join(' + ')],
      ['主键（B）', config.b.keys.join(' + ')],
    ],
    widths: [24, 40],
  }

  const diffRows: Cell[][] = result.findings.map((finding, index) => [
    index + 1,
    finding.type,
    finding.severity === 'error' ? '错误' : finding.severity === 'warn' ? '提示' : '参考',
    finding.key,
    finding.field,
    finding.a,
    finding.b,
    finding.delta,
    finding.message,
    finding.suggestion,
    '',
  ])
  const diffSheet: Sheet = {
    name: '差异明细',
    header: [...DIFF_COLUMNS],
    rows: diffRows,
    widths: [6, 16, 10, 28, 18, 16, 16, 14, 48, 36, 12],
    freezeAfterColumn: 3,
  }

  const onlyASheet: Sheet = {
    name: '仅A存在',
    header: ['主键', ...config.a.keys.map((key) => `键·${key}`)],
    rows: result.onlyARows.map((entry) => [entry.key, ...config.a.keys.map((key) => entry.row[key] ?? '')]),
    widths: [28, 18],
  }

  const onlyBSheet: Sheet = {
    name: '仅B存在',
    header: ['主键', ...config.b.keys.map((key) => `键·${key}`)],
    rows: result.onlyBRows.map((entry) => [entry.key, ...config.b.keys.map((key) => entry.row[key] ?? '')]),
    widths: [28, 18],
  }

  const mergedSheet: Sheet = {
    name: '合并结果',
    header: ['主键', ...config.a.keys.map((key) => `A·${key}`), ...config.a.keys.map((key) => `B·${key}`)],
    rows: result.matchedRows.map((entry) => [
      entry.key,
      ...config.a.keys.map((key) => entry.a[key] ?? ''),
      ...config.b.keys.map((key) => entry.b[key] ?? ''),
    ]),
    widths: [28, 18, 18],
  }

  return writeWorkbook([summarySheet, diffSheet, onlyASheet, onlyBSheet, mergedSheet])
}

/** One finding as a plain object, so the JSON result is stable and ordered. */
export function findingJson(finding: Finding): Record<string, string> {
  return {
    type: finding.type,
    severity: finding.severity,
    key: finding.key,
    field: finding.field,
    a: finding.a,
    b: finding.b,
    delta: finding.delta,
    message: finding.message,
    suggestion: finding.suggestion,
  }
}
