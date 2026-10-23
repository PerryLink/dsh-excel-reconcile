/**
 * Model-facing projection of a reconciliation.
 *
 * The workbook is returned as base64 because the tool cannot know whether the
 * caller's sandbox is writable; the same bytes are also written to disk when a
 * path is configured. Saying so explicitly is better than a tool that silently
 * produces nothing when the volume is read-only.
 */

import type { ReconcileResult } from './model.ts'

/** What the model reads back. */
export interface ReconcileView {
  plugin: string
  target: string
  summary: {
    rowsA: number
    rowsB: number
    matched: number
    onlyA: number
    onlyB: number
    duplicateKeys: number
    errors: number
    warnings: number
    infos: number
  }
  findingCount: number
  markdown: string
  resultJson: string
  /** Absolute path the workbook was written to, or empty. */
  workbookPath: string
  /** Base64 of the diff workbook, always present. */
  workbookBase64: string
}

/**
 * Project a reconciliation into the keys the tool schema advertises.
 *
 * @param result - reconciliation outcome.
 * @param markdown - rendered report.
 * @param workbook - the diff workbook bytes.
 * @param target - description of the two sources.
 * @param plugin - plugin name, echoed for traceability.
 * @param workbookPath - where the workbook was written, or empty.
 * @returns the projection.
 */
export function buildView(
  result: ReconcileResult,
  markdown: string,
  workbook: Buffer,
  target: string,
  plugin: string,
  workbookPath: string,
): ReconcileView {
  return {
    plugin,
    target,
    summary: {
      rowsA: result.summary.rowsA,
      rowsB: result.summary.rowsB,
      matched: result.summary.matched,
      onlyA: result.summary.onlyA,
      onlyB: result.summary.onlyB,
      duplicateKeys: result.summary.duplicateKeys,
      errors: result.summary.errors,
      warnings: result.summary.warnings,
      infos: result.summary.infos,
    },
    findingCount: result.findings.length,
    markdown,
    resultJson: JSON.stringify({
      summary: result.summary,
      findings: result.findings,
      warnings: result.warnings,
    }),
    workbookPath,
    workbookBase64: workbook.toString('base64'),
  }
}
