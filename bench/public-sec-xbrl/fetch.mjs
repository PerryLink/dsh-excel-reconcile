#!/usr/bin/env node
/**
 * Fetch Apple's SEC XBRL company facts.
 *
 * Source: https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json
 * Publisher: U.S. Securities and Exchange Commission
 * License: U.S. Government work; public domain in the United States.
 *
 * SEC requires a descriptive User-Agent and fair-access rate limiting. This
 * script makes one request and stores the JSON under .data/ (gitignored).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const target = join(here, '.data', 'aapl-companyfacts.json')
const url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json'
const userAgent = process.env.SEC_USER_AGENT || 'PerryLink dsh-public-bench contact@example.com'

const response = await fetch(url, { headers: { 'user-agent': userAgent } })
if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)
const text = await response.text()
if (!text.trimStart().startsWith('{')) throw new Error('download did not return JSON; SEC may have blocked the User-Agent')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, text)
console.log(`wrote ${target} (${text.length} bytes)`)
