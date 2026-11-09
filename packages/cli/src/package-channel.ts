import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { writePackageJsonFile } from './files.js'
import { maxVersion } from './registry.js'
import type {
  CommandRunner,
  DependencyUpgrade,
  PackageChannelResult,
  PackageJson,
  PackageManager,
  Registry,
} from './types.js'

const HYDRO_PREFIX = '@hydro/'
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

export interface HydroDependency {
  name: string
  spec: string
  section: (typeof SECTIONS)[number]
  packagePath: string
}

export interface PackageTarget {
  filePath: string
  packageJson: PackageJson
}

export function collectHydroDeps(
  pkg: PackageJson,
  packagePath = 'package.json',
): HydroDependency[] {
  const deps: HydroDependency[] = []
  for (const section of SECTIONS) {
    const entries = pkg[section]
    if (!entries) continue
    for (const [name, spec] of Object.entries(entries)) {
      if (name.startsWith(HYDRO_PREFIX)) deps.push({ name, spec, section, packagePath })
    }
  }
  return deps
}

/** 扫描根工程与 apps/* / portals/* 下的 package.json */
export async function collectWorkspacePackages(projectDir: string): Promise<PackageTarget[]> {
  const targets: PackageTarget[] = []
  const rootPath = path.join(projectDir, 'package.json')
  if (existsSync(rootPath)) {
    targets.push({
      filePath: rootPath,
      packageJson: JSON.parse(await fs.readFile(rootPath, 'utf8')) as PackageJson,
    })
  }

  for (const group of ['apps', 'portals']) {
    const groupDir = path.join(projectDir, group)
    if (!existsSync(groupDir)) continue
    const entries = await fs.readdir(groupDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const filePath = path.join(groupDir, entry.name, 'package.json')
      if (!existsSync(filePath)) continue
      targets.push({
        filePath,
        packageJson: JSON.parse(await fs.readFile(filePath, 'utf8')) as PackageJson,
      })
    }
  }

  return targets
}

export async function collectProjectHydroDeps(projectDir: string): Promise<HydroDependency[]> {
  const targets = await collectWorkspacePackages(projectDir)
  return targets.flatMap((target) => collectHydroDeps(target.packageJson, target.filePath))
}

export function detectPackageManager(pkg: PackageJson, projectDir: string): PackageManager {
  const declared = pkg.packageManager
  if (typeof declared === 'string') {
    if (declared.startsWith('pnpm')) return 'pnpm'
    if (declared.startsWith('yarn')) return 'yarn'
    if (declared.startsWith('npm')) return 'npm'
  }
  if (
    existsSync(path.join(projectDir, 'pnpm-workspace.yaml')) ||
    existsSync(path.join(projectDir, 'pnpm-lock.yaml'))
  ) {
    return 'pnpm'
  }
  if (existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(projectDir, 'package-lock.json'))) return 'npm'
  return 'pnpm'
}

/** 非 semver 协议（本地 link / file / workspace）不自动改写，避免破坏本地开发 */
function nextSpecifier(spec: string, targetVersion: string): string | null {
  if (/^(link:|file:|workspace:|git\+|http)/.test(spec)) return null
  const prefix = spec.match(/^[^0-9]*/)?.[0] ?? ''
  return `${prefix}${targetVersion}`
}

export async function resolveTargetVersion(options: {
  to?: string
  deps: HydroDependency[]
  registry: Registry
}): Promise<string> {
  if (options.to) return options.to
  if (options.deps.length === 0) throw new Error('项目中没有 @hydro/* 依赖，无需更新')
  const versions = await Promise.all(options.deps.map((dep) => options.registry.latest(dep.name)))
  return maxVersion(versions)
}

export interface PackageChannelOptions {
  projectDir: string
  fromVersion: string
  toVersion: string
  dryRun: boolean
  runner: CommandRunner
}

/**
 * 包通道：升级全部 workspace package.json 中的 @hydro/* 依赖到同一版本并执行一次安装。
 */
export async function updatePackageChannel(
  options: PackageChannelOptions,
): Promise<PackageChannelResult> {
  const targets = await collectWorkspacePackages(options.projectDir)
  const deps = targets.flatMap((target) => collectHydroDeps(target.packageJson, target.filePath))
  if (deps.length === 0) throw new Error('未找到 @hydro/* 依赖')

  const upgrades: DependencyUpgrade[] = []
  const changedFiles = new Set<string>()

  for (const target of targets) {
    for (const dep of collectHydroDeps(target.packageJson, target.filePath)) {
      const next = nextSpecifier(dep.spec, options.toVersion)
      if (next === null) {
        upgrades.push({ name: dep.name, from: dep.spec, to: dep.spec, skipped: true })
        continue
      }
      if (next === dep.spec) {
        upgrades.push({ name: dep.name, from: dep.spec, to: dep.spec })
        continue
      }
      target.packageJson[dep.section]![dep.name] = next
      upgrades.push({ name: dep.name, from: dep.spec, to: next })
      changedFiles.add(target.filePath)
    }
  }

  const changed = changedFiles.size > 0
  const relativeFiles = [...changedFiles]
    .map((filePath) => path.relative(options.projectDir, filePath).split(path.sep).join('/'))
    .sort()

  if (options.dryRun) {
    return {
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      upgrades,
      files: relativeFiles,
      changed,
      installed: false,
    }
  }

  if (!changed) {
    return {
      fromVersion: options.fromVersion,
      toVersion: options.toVersion,
      upgrades,
      files: relativeFiles,
      changed: false,
      installed: false,
    }
  }

  for (const target of targets) {
    if (changedFiles.has(target.filePath)) {
      await writePackageJsonFile(target.filePath, target.packageJson)
    }
  }

  const rootPackage = targets.find(
    (target) => target.filePath === path.join(options.projectDir, 'package.json'),
  )
  const packageManager = detectPackageManager(
    rootPackage?.packageJson ?? { name: 'hydro-app' },
    options.projectDir,
  )
  const install = options.runner.run(packageManager, ['install'], options.projectDir)
  if (install.status !== 0) {
    throw new Error(`${packageManager} install 失败：${install.stderr.trim()}`)
  }

  return {
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    upgrades,
    files: relativeFiles,
    changed: true,
    installed: true,
  }
}
