import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { collectProjectHydroDeps } from './package-channel.js'
import { readManifest, readPackageJson } from './files.js'
import type { HydroManifest } from './types.js'

export const EXPECTED_PROTOCOL_VERSION = 1
export const MIN_NODE_MAJOR = 20

export interface DoctorCheck {
  id: string
  ok: boolean
  message: string
  fix?: string
}

export interface DoctorReport {
  ok: boolean
  checks: DoctorCheck[]
}

export interface DoctorOptions {
  cwd: string
  nodeVersion?: string
  expectedProtocolVersion?: number
}

async function checkNode(nodeVersion: string): Promise<DoctorCheck> {
  const major = Number.parseInt(nodeVersion.replace(/^v/, '').split('.')[0] ?? '0', 10)
  const ok = major >= MIN_NODE_MAJOR
  return {
    id: 'node',
    ok,
    message: `Node ${nodeVersion}（要求 ≥ ${MIN_NODE_MAJOR}）`,
    fix: ok ? undefined : `升级 Node 到 ${MIN_NODE_MAJOR} 或更高版本`,
  }
}

async function checkDependencyVersions(projectDir: string): Promise<DoctorCheck> {
  let manifest: HydroManifest
  try {
    manifest = await readManifest(projectDir)
  } catch {
    return {
      id: 'manifest',
      ok: false,
      message: '缺少 .hydro-manifest.json',
      fix: '重新执行 create-hydro 或恢复 manifest',
    }
  }

  const deps = await collectProjectHydroDeps(projectDir)
  const semverDeps = deps.filter((dep) => !/^(link:|file:|workspace:)/.test(dep.spec))
  const mismatched = semverDeps.filter(
    (dep) => (dep.spec.match(/[0-9]+(\.[0-9]+)*/)?.[0] ?? dep.spec) !== manifest.frameworkVersion,
  )

  if (semverDeps.length === 0) {
    return {
      id: 'deps',
      ok: true,
      message: `依赖均为本地 link（manifest ${manifest.frameworkVersion}）`,
    }
  }

  if (mismatched.length > 0) {
    return {
      id: 'deps',
      ok: false,
      message: `依赖版本与 manifest（${manifest.frameworkVersion}）不一致：${mismatched
        .map((dep) => `${dep.name}@${dep.spec}`)
        .join(', ')}`,
      fix: `hydro update --to ${manifest.frameworkVersion}`,
    }
  }

  return {
    id: 'deps',
    ok: true,
    message: `@hydro/* 依赖与 manifest 版本一致（${manifest.frameworkVersion}）`,
  }
}

async function checkManifestConsistency(projectDir: string): Promise<DoctorCheck> {
  try {
    const manifest = await readManifest(projectDir)
    const packageJson = await readPackageJson(projectDir)
    const rootDep = packageJson.dependencies?.['@hydro/bridge-sdk']
    if (!rootDep) {
      return {
        id: 'manifest-package',
        ok: false,
        message: '根 package.json 缺少 @hydro/bridge-sdk 依赖',
        fix: '在根 package.json 中补充 @hydro/* 依赖并执行 hydro update',
      }
    }
    const version = rootDep.match(/[0-9]+(\.[0-9]+)*/)?.[0]
    if (version && version !== manifest.frameworkVersion) {
      return {
        id: 'manifest-package',
        ok: false,
        message: `根 package.json 依赖 ${version} 与 manifest ${manifest.frameworkVersion} 不一致`,
        fix: `hydro update --to ${manifest.frameworkVersion}`,
      }
    }
    return {
      id: 'manifest-package',
      ok: true,
      message: `manifest 与 package.json 版本对齐（${manifest.frameworkVersion}）`,
    }
  } catch (error) {
    return {
      id: 'manifest-package',
      ok: false,
      message: `读取 manifest / package.json 失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function checkNativePlugin(projectDir: string): Promise<DoctorCheck> {
  const pluginFile = path.join(projectDir, 'apps/shell/nativeplugins/HydroBridge/package.json')
  if (!existsSync(pluginFile)) {
    return {
      id: 'native-plugin',
      ok: false,
      message: '未找到 HydroBridge 原生插件',
      fix: '确认 apps/shell/nativeplugins/HydroBridge 已随模板下发',
    }
  }

  try {
    const plugin = JSON.parse(await fs.readFile(pluginFile, 'utf8')) as {
      _dp_nativeplugin?: { android?: { plugins?: unknown[] }; ios?: { plugins?: unknown[] } }
    }
    const android = plugin._dp_nativeplugin?.android?.plugins?.length ?? 0
    const ios = plugin._dp_nativeplugin?.ios?.plugins?.length ?? 0
    if (android === 0 || ios === 0) {
      return {
        id: 'native-plugin',
        ok: false,
        message: 'HydroBridge 插件缺少 Android / iOS 注册',
        fix: '检查 nativeplugins/HydroBridge/package.json 的 _dp_nativeplugin 配置',
      }
    }
    return {
      id: 'native-plugin',
      ok: true,
      message: `HydroBridge 已注册（Android ${android} / iOS ${ios}）`,
    }
  } catch (error) {
    return {
      id: 'native-plugin',
      ok: false,
      message: `解析原生插件配置失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

async function checkProtocol(projectDir: string, expected: number): Promise<DoctorCheck> {
  const candidates = [
    path.join(projectDir, 'node_modules/@hydro/shared/src/version.ts'),
    path.join(projectDir, 'packages/shared/src/version.ts'),
  ]
  const versionFile = candidates.find((candidate) => existsSync(candidate))
  if (!versionFile) {
    return {
      id: 'protocol',
      ok: false,
      message: '未找到 @hydro/shared 协议版本文件',
      fix: '执行包管理器 install，确认 @hydro/shared 已安装',
    }
  }

  const source = await fs.readFile(versionFile, 'utf8')
  const found = Number.parseInt(source.match(/PROTOCOL_VERSION\s*=\s*(\d+)/)?.[1] ?? '0', 10)
  if (found !== expected) {
    return {
      id: 'protocol',
      ok: false,
      message: `协议版本 ${found} 与框架期望 ${expected} 不兼容`,
      fix: '执行 hydro update 升级到匹配版本',
    }
  }
  return {
    id: 'protocol',
    ok: true,
    message: `协议版本兼容（PROTOCOL_VERSION=${found}）`,
  }
}

/** 工程体检：Node / 依赖 / manifest / 原生插件 / 协议版本 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const cwd = path.resolve(options.cwd)
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const expectedProtocol = options.expectedProtocolVersion ?? EXPECTED_PROTOCOL_VERSION

  const checks = await Promise.all([
    checkNode(nodeVersion),
    checkDependencyVersions(cwd),
    checkManifestConsistency(cwd),
    checkNativePlugin(cwd),
    checkProtocol(cwd, expectedProtocol),
  ])

  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}
