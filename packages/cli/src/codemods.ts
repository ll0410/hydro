import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareVersions } from './registry.js'
import { hashFileIfExists, readManifest } from './files.js'

export interface CodemodReport {
  versions: string[]
  transforms: string[]
  modified: string[]
  skipped: boolean
}

export interface CodemodOptions {
  projectDir: string
  /** 起始版本（不含），通常是 manifest.frameworkVersion */
  fromVersion: string
  /** 目标版本（含） */
  toVersion: string
  codemodsDir?: string
  /** 必须显式 --yes 才允许改写业务文件 */
  yes: boolean
}

const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

export function resolveCodemodsDir(explicit?: string): string | undefined {
  if (explicit) return explicit
  const packageRoot = path.resolve(CURRENT_DIR, '..')
  const repoRoot = path.resolve(packageRoot, '../..')
  const candidates = [path.join(packageRoot, 'codemods'), path.join(repoRoot, 'codemods')]
  return candidates.find((candidate) => existsSync(candidate))
}

async function discoverVersions(
  codemodsDir: string,
): Promise<Array<{ version: string; dir: string }>> {
  const entries = await fs.readdir(codemodsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => ({ version: entry.name, dir: path.join(codemodsDir, entry.name) }))
    .sort((a, b) => compareVersions(a.version, b.version))
}

async function discoverTransforms(versionDir: string): Promise<string[]> {
  const entries = await fs.readdir(versionDir)
  return entries
    .filter((name) => /\.(ts|js)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts'))
    .map((name) => path.join(versionDir, name))
    .sort()
}

async function collectBusinessFiles(projectDir: string): Promise<string[]> {
  const files: string[] = []
  const root = path.join(projectDir, 'portals')
  if (!existsSync(root)) return files

  async function walk(currentDir: string): Promise<void> {
    for (const entry of await fs.readdir(currentDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (TARGET_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath)
    }
  }

  await walk(root)
  return files
}

type JscodeshiftRunner = {
  run(transformFile: string, paths: string[], options: Record<string, unknown>): Promise<unknown>
}

function loadJscodeshiftRunner(): JscodeshiftRunner {
  const require = createRequire(import.meta.url)
  const module = require('jscodeshift/src/Runner') as JscodeshiftRunner
  return module
}

/**
 * codemod runner：按版本顺序执行 codemods/<version>/*.ts。
 *
 * 只有显式 yes 才会运行并改写 portals/ 下的业务文件。
 */
export async function runCodemods(options: CodemodOptions): Promise<CodemodReport> {
  const codemodsDir = options.codemodsDir ?? resolveCodemodsDir()
  if (!codemodsDir) throw new Error('未找到 codemods 目录')

  const versions = (await discoverVersions(codemodsDir)).filter(
    (item) =>
      compareVersions(item.version, options.fromVersion) > 0 &&
      compareVersions(item.version, options.toVersion) <= 0,
  )
  const transforms = (
    await Promise.all(versions.map((item) => discoverTransforms(item.dir)))
  ).flat()

  if (!options.yes) {
    return {
      versions: versions.map((item) => item.version),
      transforms,
      modified: [],
      skipped: true,
    }
  }

  const businessFiles = await collectBusinessFiles(options.projectDir)
  if (businessFiles.length === 0 || transforms.length === 0) {
    return {
      versions: versions.map((item) => item.version),
      transforms,
      modified: [],
      skipped: false,
    }
  }

  const before = new Map<string, string | null>()
  for (const file of businessFiles) before.set(file, await hashFileIfExists(file))

  const runner = loadJscodeshiftRunner()
  const portalsDir = path.join(options.projectDir, 'portals')
  for (const transformFile of transforms) {
    await runner.run(transformFile, [portalsDir], {
      parser: 'tsx',
      extensions: 'ts,tsx,js,jsx',
      dry: false,
      silent: true,
      runInBand: true,
    })
  }

  const modified: string[] = []
  for (const file of businessFiles) {
    const after = await hashFileIfExists(file)
    if (before.get(file) !== after) {
      modified.push(path.relative(options.projectDir, file).split(path.sep).join('/'))
    }
  }

  return {
    versions: versions.map((item) => item.version),
    transforms,
    modified: modified.sort(),
    skipped: false,
  }
}

export async function readManifestVersion(projectDir: string): Promise<string> {
  return (await readManifest(projectDir)).frameworkVersion
}
