import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readChanges } from './changes.js'
import { readManifest, readPackageJson, writeManifest } from './files.js'
import { assertCleanWorkspace, commitChanges } from './git.js'
import {
  collectProjectHydroDeps,
  resolveTargetVersion,
  updatePackageChannel,
} from './package-channel.js'
import { createNpmRegistry } from './registry.js'
import { defaultRunner } from './runner.js'
import { updateTemplateChannel } from './template-channel.js'
import { loadTemplateVariables } from './template-files.js'
import type { TemplateUpdateReport, UpdateOptions, UpdateReport } from './types.js'

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url))

/** 解析仓库 / 包内的壳模板目录 */
export function resolveShellTemplateDir(explicit?: string): string | undefined {
  if (explicit) return explicit
  const packageRoot = path.resolve(CURRENT_DIR, '..')
  const repoRoot = path.resolve(packageRoot, '../..')
  const candidates = [
    path.join(packageRoot, 'templates', 'shell'),
    path.join(repoRoot, 'templates', 'shell'),
  ]
  return candidates.find((candidate) => existsSync(path.join(candidate, 'template.json')))
}

function lockfilesIn(projectDir: string): string[] {
  return ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].filter((file) =>
    existsSync(path.join(projectDir, file)),
  )
}

function emptyTemplateReport(version: string, fromVersion: string): TemplateUpdateReport {
  return {
    version,
    overwritten: [],
    conflicts: [],
    skipped: [],
    owned: [],
    changed: fromVersion !== version,
    manifest: { frameworkVersion: version, files: [] },
  }
}

/**
 * `hydro update`：双通道更新。
 *
 * 1. 包通道：@hydro/* 依赖升级 + 安装 + 自动提交；
 * 2. 模板通道：manifest hash 对比 + 所有权分级 + 自动提交。
 */
export async function runUpdate(options: UpdateOptions): Promise<UpdateReport> {
  const cwd = path.resolve(options.cwd)
  const runner = options.runner ?? defaultRunner
  const dryRun = options.dryRun ?? false

  assertCleanWorkspace(cwd, runner)

  const manifest = await readManifest(cwd)
  const packageJson = await readPackageJson(cwd)
  const deps = await collectProjectHydroDeps(cwd)
  const registry = options.registry ?? createNpmRegistry(runner, cwd)
  const targetVersion = await resolveTargetVersion({ to: options.to, deps, registry })

  const changes = await readChanges(path.join(cwd, 'changes.json'))
  const templateDir = resolveShellTemplateDir(options.templateDir)
  let variables =
    options.variables ??
    (templateDir
      ? await loadTemplateVariables(templateDir, { projectName: packageJson.name })
      : { projectName: packageJson.name })
  variables = { ...variables, hydroVersion: targetVersion }

  const packageResult = await updatePackageChannel({
    projectDir: cwd,
    fromVersion: manifest.frameworkVersion,
    toVersion: targetVersion,
    dryRun,
    runner,
  })

  if (!dryRun && packageResult.changed) {
    commitChanges(cwd, runner, `chore(hydro): update deps to ${targetVersion}`, [
      ...packageResult.files,
      ...lockfilesIn(cwd),
    ])
  }

  let templateResult: TemplateUpdateReport
  if (templateDir) {
    templateResult = await updateTemplateChannel({
      projectDir: cwd,
      manifest,
      toVersion: targetVersion,
      templateDir,
      variables,
      dryRun,
      merge: options.merge,
    })
  } else {
    templateResult = emptyTemplateReport(targetVersion, manifest.frameworkVersion)
    templateResult.manifest = {
      frameworkVersion: targetVersion,
      files: manifest.files,
    }
  }

  if (!dryRun && templateResult.changed) {
    await writeManifest(cwd, templateResult.manifest)
    commitChanges(cwd, runner, `chore(hydro): update templates to ${targetVersion}`, [
      '.hydro-manifest.json',
      ...templateResult.overwritten,
    ])
  }

  return {
    targetVersion,
    dryRun,
    package: packageResult,
    template: templateResult,
    changes,
  }
}
