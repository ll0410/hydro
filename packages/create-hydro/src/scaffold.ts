import { spawnSync } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyTemplate, readTemplateMeta } from './template.js'
import type {
  HydroManifest,
  ManifestFile,
  PackageManager,
  ScaffoldOptions,
  ScaffoldResult,
  TemplateMeta,
} from './types.js'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

export function resolveTemplatesDir(explicit?: string): string {
  if (explicit) return explicit
  const packageRoot = path.resolve(CURRENT_DIR, '..')
  const repoRoot = path.resolve(packageRoot, '../..')
  const candidates = [path.join(packageRoot, 'templates'), path.join(repoRoot, 'templates')]
  const found = candidates.find((candidate) => existsSync(path.join(candidate, 'shell')))
  if (!found) {
    throw new Error('未找到 templates 目录，请通过 templatesDir 指定')
  }
  return found
}

function resolveRepoRoot(): string {
  return path.resolve(CURRENT_DIR, '..', '..', '..')
}

/** 检测当前是否在 Hydro 仓库内，返回本地 packages 目录 */
export function detectLocalPackagesDir(explicit?: string): string | undefined {
  const candidate = explicit ?? path.join(resolveRepoRoot(), 'packages')
  return existsSync(path.join(candidate, 'bridge-sdk', 'package.json')) ? candidate : undefined
}

function collectVariables(metas: TemplateMeta[], projectName: string): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const meta of metas) {
    for (const variable of meta.variables) {
      variables[variable.key] = variable.default
    }
  }
  variables.projectName = projectName
  return variables
}

function buildRootScripts(
  packageManager: PackageManager,
  portalPackage: string,
  shellPackage: string | null,
): Record<string, string> {
  if (packageManager === 'pnpm') {
    const scripts: Record<string, string> = {
      dev: `pnpm --filter ${portalPackage} dev`,
      build: 'pnpm -r --if-present build',
      typecheck: 'pnpm -r --if-present typecheck',
    }
    if (shellPackage) scripts['dev:shell'] = `pnpm --filter ${shellPackage} dev:app`
    return scripts
  }

  if (packageManager === 'yarn') {
    const scripts: Record<string, string> = {
      dev: `yarn workspace ${portalPackage} dev`,
      build: 'yarn workspaces run build',
      typecheck: 'yarn workspaces run typecheck',
    }
    if (shellPackage) scripts['dev:shell'] = `yarn workspace ${shellPackage} dev:app`
    return scripts
  }

  const scripts: Record<string, string> = {
    dev: `npm run dev --workspace ${portalPackage}`,
    build: 'npm run build --workspaces --if-present',
    typecheck: 'npm run typecheck --workspaces --if-present',
  }
  if (shellPackage) scripts['dev:shell'] = `npm run dev:app --workspace ${shellPackage}`
  return scripts
}

async function writeRootFiles(
  projectDir: string,
  projectName: string,
  packageManager: PackageManager,
  variables: Record<string, string>,
  hasShell: boolean,
): Promise<void> {
  const portalPackage = `${projectName}-portal`
  const shellPackage = hasShell ? `${projectName}-shell` : null

  const rootPackage = {
    name: projectName,
    version: '0.1.0',
    private: true,
    workspaces: ['apps/*', 'portals/*'],
    scripts: buildRootScripts(packageManager, portalPackage, shellPackage),
  }
  await fs.writeFile(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify(rootPackage, null, 2)}\n`,
    'utf8',
  )

  await fs.writeFile(
    path.join(projectDir, 'pnpm-workspace.yaml'),
    'packages:\n  - apps/*\n  - portals/*\n',
    'utf8',
  )

  const rootConfig = `export default {
  webEntry: '${variables.webEntry}',
  whitelist: ${variables.whitelist},
  debug: true,
  webviewPoolSize: 2,
} as const
`
  await fs.writeFile(path.join(projectDir, 'hydro.config.ts'), rootConfig, 'utf8')
}

async function linkLocalHydroDeps(packageJsonPath: string, packagesDir: string): Promise<void> {
  if (!existsSync(packageJsonPath)) return
  const raw = await fs.readFile(packageJsonPath, 'utf8')
  const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> }
  if (!pkg.dependencies) return

  let changed = false
  for (const name of Object.keys(pkg.dependencies)) {
    if (!name.startsWith('@hydro/')) continue
    const dirName = name.slice('@hydro/'.length)
    const targetDir = path.join(packagesDir, dirName)
    if (!existsSync(path.join(targetDir, 'package.json'))) continue
    pkg.dependencies[name] = `link:${targetDir}`
    changed = true
  }

  if (changed) {
    await fs.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  }
}

async function ensureEmptyDir(targetDir: string): Promise<void> {
  if (existsSync(targetDir)) {
    const entries = await fs.readdir(targetDir)
    if (entries.length > 0) {
      throw new Error(`目标目录非空：${targetDir}`)
    }
    return
  }
  await fs.mkdir(targetDir, { recursive: true })
}

function installDependencies(projectDir: string, packageManager: PackageManager): void {
  const command = packageManager
  const args = ['install']
  const result = spawnSync(command, args, { cwd: projectDir, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${packageManager} install 失败（exit ${result.status}）`)
  }
}

/**
 * 生成项目：
 * - templates/shell → apps/shell（模板通道管理）
 * - templates/portal → portals/order（业务自有）
 * - 生成根 package.json / pnpm-workspace.yaml / hydro.config.ts / .hydro-manifest.json
 */
export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const projectDir = path.resolve(options.targetDir)
  const projectName = options.projectName
  const template = options.template ?? 'shell'
  const packageManager = options.packageManager ?? 'pnpm'
  const templatesDir = resolveTemplatesDir(options.templatesDir)

  const shellDir = path.join(templatesDir, 'shell')
  const portalDir = path.join(templatesDir, 'portal')

  const shellMeta = template === 'shell' ? await readTemplateMeta(shellDir) : null
  const portalMeta = await readTemplateMeta(portalDir)
  const metas = shellMeta ? [shellMeta, portalMeta] : [portalMeta]
  const variables = collectVariables(metas, projectName)

  await ensureEmptyDir(projectDir)

  const files: ManifestFile[] = []
  if (shellMeta) {
    files.push(
      ...(await copyTemplate({
        templateDir: shellDir,
        targetDir: path.join(projectDir, 'apps', 'shell'),
        prefix: 'apps/shell',
        variables,
        meta: shellMeta,
      })),
    )
  }
  files.push(
    ...(await copyTemplate({
      templateDir: portalDir,
      targetDir: path.join(projectDir, 'portals', 'order'),
      prefix: 'portals/order',
      variables,
      meta: portalMeta,
    })),
  )

  await writeRootFiles(projectDir, projectName, packageManager, variables, !!shellMeta)

  const frameworkVersion = options.frameworkVersion ?? shellMeta?.version ?? portalMeta.version
  const manifest: HydroManifest = { frameworkVersion, files }
  await fs.writeFile(
    path.join(projectDir, '.hydro-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  const localPackagesDir = detectLocalPackagesDir(options.localPackagesDir)
  if (localPackagesDir) {
    await linkLocalHydroDeps(
      path.join(projectDir, 'apps', 'shell', 'package.json'),
      localPackagesDir,
    )
    await linkLocalHydroDeps(
      path.join(projectDir, 'portals', 'order', 'package.json'),
      localPackagesDir,
    )
  }

  if (options.install ?? true) {
    installDependencies(projectDir, packageManager)
  }

  return {
    projectDir,
    files,
    manifest,
    templateFiles: files.length,
  }
}
