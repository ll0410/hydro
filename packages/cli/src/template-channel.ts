import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createUnifiedDiff } from './diff.js'
import { readFileIfExists, sha256 } from './files.js'
import {
  collectExtraFiles,
  loadTemplateSnapshot,
  snapshotHash,
  type TemplateSnapshotFile,
} from './template-files.js'
import type { HydroManifest, TemplateUpdateReport } from './types.js'

const MANAGED_PREFIX = 'apps/shell'

export interface TemplateChannelOptions {
  projectDir: string
  manifest: HydroManifest
  toVersion: string
  templateDir: string
  variables: Record<string, string>
  dryRun: boolean
  merge?: boolean
}

async function writeProjectFile(
  projectDir: string,
  relativePath: string,
  content: Buffer | string,
): Promise<void> {
  const target = path.join(projectDir, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

async function writeConflict(
  projectDir: string,
  relativePath: string,
  localContent: Buffer | null,
  next: TemplateSnapshotFile,
): Promise<void> {
  const localText = localContent ? localContent.toString('utf8') : ''
  const nextText = next.isText ? next.content.toString('utf8') : '<binary file>'
  const diffPath = path.join(projectDir, '.hydro-conflicts', `${relativePath}.diff`)
  await fs.mkdir(path.dirname(diffPath), { recursive: true })
  await fs.writeFile(diffPath, createUnifiedDiff(relativePath, localText, nextText), 'utf8')
}

/**
 * 模板通道：三方 hash 对比 + 所有权分级。
 *
 * - 未修改：新模板覆盖，更新 manifest hash
 * - 已修改：生成冲突清单（.hydro-conflicts/*.diff），保留本地文件
 * - 自有文件：不在 manifest 中的用户文件，永不触碰
 */
export async function updateTemplateChannel(
  options: TemplateChannelOptions,
): Promise<TemplateUpdateReport> {
  const snapshot = await loadTemplateSnapshot({
    templateDir: options.templateDir,
    prefix: MANAGED_PREFIX,
    variables: options.variables,
  })

  const manifestMap = new Map(options.manifest.files.map((file) => [file.path, file.hash]))
  const allPaths = new Set([...manifestMap.keys(), ...snapshot.keys()])

  const overwritten: string[] = []
  const conflicts: string[] = []
  const skipped: string[] = []
  const owned: string[] = []

  const sortedPaths = [...allPaths].sort()

  for (const relativePath of sortedPaths) {
    const nextFile = snapshot.get(relativePath)
    const oldHash = manifestMap.get(relativePath) ?? null
    const localContent = await readFileIfExists(path.join(options.projectDir, relativePath))
    const localHash = localContent ? sha256(localContent) : null
    const newHash = nextFile ? snapshotHash(nextFile) : null

    // 本地 link/file 协议的 package.json 不归模板通道管理，避免覆盖本地开发链接
    if (
      relativePath.endsWith('package.json') &&
      localContent &&
      /"link:|"file:/.test(localContent.toString('utf8'))
    ) {
      skipped.push(relativePath)
      if (localHash) manifestMap.set(relativePath, localHash)
      continue
    }

    // 1) 用户未修改（或本地缺失且模板新增）
    if (oldHash !== null && localHash === oldHash) {
      if (!nextFile) {
        skipped.push(relativePath)
        continue
      }
      if (localHash !== newHash) {
        if (!options.dryRun) {
          await writeProjectFile(options.projectDir, relativePath, nextFile.content)
        }
        overwritten.push(relativePath)
      }
      manifestMap.set(relativePath, newHash!)
      continue
    }

    if (oldHash !== null) {
      // 2) 用户已修改
      if (!nextFile) {
        skipped.push(relativePath)
        continue
      }
      if (localHash !== null && localHash === newHash) {
        // 用户改动恰好与新模板一致，视为已同步
        manifestMap.set(relativePath, newHash!)
        overwritten.push(relativePath)
        continue
      }
      conflicts.push(relativePath)
      if (!options.dryRun) {
        await writeConflict(options.projectDir, relativePath, localContent, nextFile)
      }
      continue
    }

    // 3) 模板新增
    if (!nextFile) continue
    if (localHash === null) {
      if (!options.dryRun) {
        await writeProjectFile(options.projectDir, relativePath, nextFile.content)
      }
      manifestMap.set(relativePath, newHash!)
      overwritten.push(relativePath)
    } else {
      // 本地已有同名文件但不在 manifest：视为用户自有
      owned.push(relativePath)
    }
  }

  const extras = await collectExtraFiles(
    options.projectDir,
    MANAGED_PREFIX,
    new Set([...manifestMap.keys(), ...snapshot.keys()]),
  )
  owned.push(...extras)

  if (options.merge && conflicts.length > 0 && !options.dryRun) {
    console.warn('[hydro] --merge 需要 node-diff3 与旧模板内容，当前版本退回冲突清单处理')
  }

  const files = [...manifestMap.entries()]
    .map(([filePath, hash]) => ({ path: filePath, hash }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const manifest: HydroManifest = {
    frameworkVersion: options.toVersion,
    files,
  }

  return {
    version: options.toVersion,
    overwritten: overwritten.sort(),
    conflicts: conflicts.sort(),
    skipped: skipped.sort(),
    owned: [...new Set(owned)].sort(),
    changed: overwritten.length > 0 || options.manifest.frameworkVersion !== options.toVersion,
    manifest,
  }
}
