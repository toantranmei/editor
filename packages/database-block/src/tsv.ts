/** Tab-separated values as spreadsheets put them on the clipboard (quoted cells may hold tabs / newlines). */

const needsQuotes = (s: string) => /[\t\n\r"]/.test(s)

export function toTsv(rows: string[][]): string {
  return rows.map(r => r.map(c => (needsQuotes(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n')
}

export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const s = text.replace(/\r\n?/g, '\n')
  while (i < s.length) {
    const ch = s[i]!
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') {
      quoted = true
      i++
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
    }
    else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    }
    else {
      cell += ch
    }
    i++
  }
  // A trailing newline (Excel adds one) doesn't make an extra row.
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
