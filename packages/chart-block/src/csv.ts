import type { ChartTable } from './types'

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i

/** A cell as stored in the table: numeric text becomes a number. */
export function toCell(value: string): string | number {
  const t = value.trim()
  return t !== '' && NUMBER.test(t) ? Number(t) : value
}

/** Splits delimited text into rows of fields (RFC 4180: quotes, `""` escapes, CRLF / LF / CR, newlines in quotes). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        }
        else quoted = false
      }
      else field += c
    }
    else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    }
    else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  // Drop blank lines (a trailing newline, empty spreadsheet rows).
  return rows.filter(r => r.some(f => f.trim() !== ''))
}

/** Tab-separated when the first line has tabs and no commas (spreadsheet paste), else comma-separated. */
export function detectDelimiter(text: string): ',' | '\t' {
  const first = text.split(/\r\n|\n|\r/, 1)[0] ?? ''
  return first.includes('\t') && !first.includes(',') ? '\t' : ','
}

/** CSV / TSV text → table. The first line holds the column names; numeric cells become numbers. */
export function parseCsv(text: string): ChartTable {
  const lines = parseDelimited(text.replace(/^﻿/, ''), detectDelimiter(text))
  const [head, ...body] = lines
  if (!head) return { columns: [], rows: [] }
  const width = Math.max(head.length, ...body.map(r => r.length))
  const columns = Array.from({ length: width }, (_, i) => head[i]?.trim() || `Column ${i + 1}`)
  const rows = body.map(r => Array.from({ length: width }, (_, i) => toCell(r[i] ?? '')))
  return { columns, rows }
}
