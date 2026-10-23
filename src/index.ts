import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ingestToTable } from 'dsh-table-ingest/api'
import { parseYaml } from './shared/yaml.ts'
import { Config } from './config.ts'
import type { Config as ConfigShape } from './config.ts'
import { reconcile, ReconcileError, type ReconcileConfig } from './model.ts'
import { buildWorkbook, renderMarkdown } from './report.ts'
import { buildView } from './view.ts'

export const name = 'dsh-excel-reconcile'
export const inject = ['tools']
export { Config }

/** Tool id exposed to the model, and the row id in `cordis.patch.yml`. */
export const TOOL_NAME = 'excel_reconcile'

/**
 * Read one file into a named table.
 *
 * The ingest layer handles docx/xlsx/csv; a reconciliation normally uses the
 * tabular two, but accepting all three means a rule written for a spreadsheet can
 * be run against a Word table without a separate path.
 *
 * @param path - absolute path to the file.
 * @param name - the name the configuration refers to this side by.
 * @returns the parsed table, keyed by `name`.
 */
async function readTable(path: string, name: string) {
  const buffer = await readFile(path)
  const result = ingestToTable(buffer, path)
  if (!result.ok || result.table === undefined) {
    throw new ReconcileError(
      `无法从 ${path} 抽出表格：${result.error ?? '未知原因'}` +
        (result.candidates.length > 0 ? `（候选 ${result.candidates.length} 张，请改用 .xlsx 或指定表）` : ''),
    )
  }
  return { [name]: result.table }
}

/**
 * Register the reconciliation tool.
 *
 * @param ctx - plugin context, with `tools` already available.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: ConfigShape): () => void {
  return ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        '按主键对齐两份表格（Excel / CSV / docx 表格），逐字段比较并输出差异清单、Markdown 报告与差异工作簿。' +
        '只报告两侧的字面差异，不判断哪一侧正确，也不评价业务合规性。主键重复时整键不比较，不做一对多猜测。',
      parameters: {
        fileA: { type: 'string', description: 'A 侧文件绝对路径（.xlsx / .xlsm / .csv / .docx）。' },
        fileB: { type: 'string', description: 'B 侧文件绝对路径（同上）。' },
        config: {
          type: 'string',
          description:
            '对账配置（YAML 或 JSON 文本）：a.table / a.keys、b.table / b.keys、compare[]（字段、类型、容差）、join。',
        },
        outFile: {
          type: 'string',
          description: '差异工作簿写到哪里（绝对路径或相对当前目录）。留空用配置里的默认文件名。',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            plugin: { type: 'string' },
            target: { type: 'string' },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rowsA: { type: 'integer' },
                rowsB: { type: 'integer' },
                matched: { type: 'integer' },
                onlyA: { type: 'integer' },
                onlyB: { type: 'integer' },
                duplicateKeys: { type: 'integer' },
                errors: { type: 'integer' },
                warnings: { type: 'integer' },
                infos: { type: 'integer' },
              },
            },
            findingCount: { type: 'integer' },
            markdown: { type: 'string' },
            resultJson: { type: 'string' },
            workbookPath: { type: 'string' },
            workbookBase64: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: (value as { markdown: string }).markdown }],
      },
      timeoutMs: config.timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        if (args.fileA === undefined || args.fileA.trim() === '') throw new ReconcileError('必须提供 fileA')
        if (args.fileB === undefined || args.fileB.trim() === '') throw new ReconcileError('必须提供 fileB')
        const pathA = resolve(args.fileA)
        const pathB = resolve(args.fileB)
        exec.signal.throwIfAborted()

        let parsed: unknown
        try {
          if (args.config === undefined || args.config.trim() === '') throw new ReconcileError('必须提供 config')
          parsed = parseYaml(args.config)
        } catch (error) {
          throw new ReconcileError(`对账配置无法解析：${error instanceof Error ? error.message : String(error)}`)
        }
        const reconcileConfig = parsed as ReconcileConfig
        if (reconcileConfig?.a?.table === undefined || reconcileConfig?.b?.table === undefined) {
          throw new ReconcileError('对账配置缺少 a.table 或 b.table')
        }

        const [tableA, tableB] = await Promise.all([
          readTable(pathA, reconcileConfig.a.table),
          readTable(pathB, reconcileConfig.b.table),
        ])
        exec.signal.throwIfAborted()

        const result = reconcile({ ...tableA, ...tableB }, reconcileConfig)
        const markdown = renderMarkdown(result, reconcileConfig, { a: pathA, b: pathB })
        const workbook = buildWorkbook(result, reconcileConfig)

        const target = args.outFile !== undefined && args.outFile.trim() !== ''
          ? resolve(args.outFile)
          : resolve(config.diffWorkbook)
        let workbookPath = ''
        try {
          await writeFile(target, workbook)
          workbookPath = target
        } catch {
          // A read-only sandbox is expected; the bytes are still returned as base64.
          workbookPath = ''
        }

        return buildView(result, markdown, workbook, `${pathA} ↔ ${pathB}`, name, workbookPath)
      },
    }),
  )
}
