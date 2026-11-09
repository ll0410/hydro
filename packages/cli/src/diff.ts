/** 极简行级 unified diff（LCS），用于冲突清单落盘 */
export function createUnifiedDiff(relativePath: string, local: string, next: string): string {
  const localLines = local.split(/\r?\n/)
  const nextLines = next.split(/\r?\n/)
  const rows = localLines.length
  const cols = nextLines.length

  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  )

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      table[i]![j] =
        localLines[i - 1] === nextLines[j - 1]
          ? table[i - 1]![j - 1]! + 1
          : Math.max(table[i - 1]![j]!, table[i]![j - 1]!)
    }
  }

  const body: string[] = []
  let i = rows
  let j = cols
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && localLines[i - 1] === nextLines[j - 1]) {
      body.unshift(` ${localLines[i - 1]}`)
      i--
      j--
    } else if (j > 0 && (i === 0 || table[i]![j - 1]! >= table[i - 1]![j]!)) {
      body.unshift(`+${nextLines[j - 1]}`)
      j--
    } else {
      body.unshift(`-${localLines[i - 1]}`)
      i--
    }
  }

  return [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -1,${rows} +1,${cols} @@`,
    ...body,
    '',
  ].join('\n')
}
