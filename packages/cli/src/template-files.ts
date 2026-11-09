import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sha256 } from './files.js'
import type { TemplateMeta } from './types.js'

export interface TemplateSnapshotFile {
  content: Buffer
  isText: boolean
}

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.h',
  '.html',
  '.java',
  '.js',
  '.json',
  '.kt',
  '.less',
  '.m',
  '.md',
  '.mjs',
  '.scss',
  '.svg',
  '.swift',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

export function isTextFile(fileName: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export function shouldIgnore(relativePath: string, ignore: readonly string[]): boolean {
  return ignore.some(
    (pattern) =>
      relativePath === pattern ||
      relativePath.startsWith(`${pattern}/`) ||
      relativePath.split('/').includes(pattern),
  )
}

async function readTemplateMeta(templateDir: string): Promise<TemplateMeta> {
  const raw = await fs.readFile(path.join(templateDir, 'template.json'), 'utf8')
  return JSON.parse(raw) as TemplateMeta
}

/** 模板变量：模板默认值 + 项目覆盖（如 projectName 取实际项目名） */
export async function loadTemplateVariables(
  templateDir: string,
  overrides: Record<string, string>,
): Promise<Record<string, string>> {
  const meta = await readTemplateMeta(templateDir)
  const variables: Record<string, string> = {}
  for (const variable of meta.variables) variables[variable.key] = variable.default
  return { ...variables, ...overrides }
}

export function renderString(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key]! : match,
  )
}

export interface LoadSnapshotOptions {
  templateDir: string
  /** 项目内路径前缀，如 apps/shell */
  prefix: string
  variables: Record<string, string>
}

/** 读取新模板快照：路径为项目相对路径（apps/shell/...），文本文件已渲染变量 */
export async function loadTemplateSnapshot(
  options: LoadSnapshotOptions,
): Promise<Map<string, TemplateSnapshotFile>> {
  const meta = await readTemplateMeta(options.templateDir)
  const snapshot = new Map<string, TemplateSnapshotFile>()

  async function walk(sourceDir: string, relativeDir: string): Promise<void> {
    const entries = (await fs.readdir(sourceDir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (shouldIgnore(relativePath, meta.ignore)) continue

      const sourcePath = path.join(sourceDir, entry.name)
      if (entry.isDirectory()) {
        await walk(sourcePath, relativePath)
        continue
      }

      const raw = await fs.readFile(sourcePath)
      const text = isTextFile(entry.name)
      const content = text
        ? Buffer.from(renderString(raw.toString('utf8'), options.variables))
        : raw
      snapshot.set(path.posix.join(options.prefix, relativePath), {
        content,
        isText: text,
      })
    }
  }

  await walk(options.templateDir, '')
  return snapshot
}

export function snapshotHash(file: TemplateSnapshotFile): string {
  return sha256(file.content)
}

/** 扫描受管目录下用户自行新增的文件（用于自有文件统计） */
export async function collectExtraFiles(
  projectDir: string,
  prefix: string,
  managed: ReadonlySet<string>,
): Promise<string[]> {
  const extra: string[] = []
  const ignored = new Set(['node_modules', 'unpackage', 'dist'])

  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath)
        continue
      }
      const projectPath = path.posix.join(prefix, relativePath)
      if (!managed.has(projectPath)) extra.push(projectPath)
    }
  }

  await walk(path.join(projectDir, prefix), '')
  return extra.sort()
}
