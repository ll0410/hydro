import type { DiffReport, OfflineFileEntry } from './types.js'

/** 对比两次构建的文件清单；v1 只输出变化列表，实际下发仍为全量包 */
export function diffFileLists(
  fromVersion: string,
  toVersion: string,
  fromFiles: OfflineFileEntry[],
  toFiles: OfflineFileEntry[],
): DiffReport {
  const fromMap = new Map(fromFiles.map((file) => [file.path, file.hash]))
  const toMap = new Map(toFiles.map((file) => [file.path, file.hash]))

  const added = [...toMap.keys()].filter((file) => !fromMap.has(file)).sort()
  const removed = [...fromMap.keys()].filter((file) => !toMap.has(file)).sort()
  const changed = [...toMap.keys()]
    .filter((file) => fromMap.has(file) && fromMap.get(file) !== toMap.get(file))
    .sort()

  return {
    from: fromVersion,
    to: toVersion,
    added,
    changed,
    removed,
    mode: 'full',
    note: 'bsdiff 差量待接入，v1 下发全量包 + hash 去重',
  }
}
