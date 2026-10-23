import Schema from '@deepseek-ai/schemastery'

/**
 * Tunables an operator can change from `cordis.yml` without editing code.
 *
 * The reconciliation configuration itself (keys, fields, tolerances) is data and
 * travels with each request, because two reconciliations in the same deployment
 * rarely share a schema.
 */
export interface Config {
  /** Tool timeout budget in milliseconds. */
  timeoutMs: number
  /** Decimal places used for money comparisons. */
  scale: number
  /** Where to write the diff workbook, relative to the process working directory. */
  diffWorkbook: string
}

export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.number().default(120_000).description('工具超时预算（毫秒）。'),
  scale: Schema.number().default(2).description('金额比较使用的小数位数。'),
  diffWorkbook: Schema.string()
    .default('reconcile-diff.xlsx')
    .description('差异工作簿的输出文件名；留空则只返回 base64，不落盘。'),
})
