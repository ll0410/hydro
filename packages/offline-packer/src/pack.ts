import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { createSignature, manifestForSigning } from './sign.js'
import type { OfflineFileEntry, OfflineManifest, PackOptions, PackResult } from './types.js'

function hashBuffer(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/** 收集构建产物文件并生成 hash / size 清单 */
export async function collectBuildFiles(sourceDir: string): Promise<OfflineFileEntry[]> {
  const files: OfflineFileEntry[] = []

  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    const entries = (await fs.readdir(currentDir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
        continue
      }
      const content = await fs.readFile(fullPath)
      files.push({
        path: path.posix.join(relativeDir, entry.name),
        size: content.byteLength,
        hash: hashBuffer(content),
      })
    }
  }

  await walk(sourceDir, '')
  return files
}

/** 打包目录：zip 内写入构建产物 + manifest.json，manifest 带 HMAC 签名 */
export async function packDirectory(options: PackOptions): Promise<PackResult> {
  const files = await collectBuildFiles(options.sourceDir)
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)

  const baseManifest = {
    app: options.app,
    channel: options.channel,
    version: options.version,
    createdAt: Date.now(),
    files,
    totalSize,
    ...(options.from ? { from: options.from } : {}),
  }
  const signature = createSignature(options.signingSecret, manifestForSigning(baseManifest))
  const manifest: OfflineManifest = { ...baseManifest, signature }

  const zip = new AdmZip()
  for (const file of files) {
    zip.addFile(file.path, await fs.readFile(path.join(options.sourceDir, file.path)))
  }
  zip.addFile('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))

  await fs.mkdir(options.outDir, { recursive: true })
  const zipPath = path.join(
    options.outDir,
    `${options.app}-${options.channel}-${options.version}.zip`,
  )
  zip.writeZip(zipPath)

  return { zipPath, manifest }
}
