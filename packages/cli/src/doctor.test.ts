import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDoctor } from './doctor.js'

const dirs: string[] = []

interface FixtureOptions {
  manifestVersion?: string
  depSpec?: string
  protocolVersion?: number
  withPlugin?: boolean
}

async function makeProject(options: FixtureOptions = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-doctor-'))
  dirs.push(dir)

  const manifestVersion = options.manifestVersion ?? '0.1.0'
  const depSpec = options.depSpec ?? '0.1.0'

  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'doctor-app',
        private: true,
        packageManager: 'pnpm@10.0.0',
        dependencies: {
          '@hydro/bridge-sdk': depSpec,
          '@hydro/shared': depSpec,
        },
      },
      null,
      2,
    ),
  )
  await fs.writeFile(
    path.join(dir, '.hydro-manifest.json'),
    JSON.stringify({ frameworkVersion: manifestVersion, files: [] }, null, 2),
  )

  if (options.withPlugin ?? true) {
    const pluginDir = path.join(dir, 'apps/shell/nativeplugins/HydroBridge')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify(
        {
          name: 'HydroBridge',
          _dp_type: 'nativeplugin',
          _dp_nativeplugin: {
            android: { plugins: [{ type: 'module', name: 'HydroBridge' }] },
            ios: { plugins: [{ type: 'module', name: 'HydroBridge' }] },
          },
        },
        null,
        2,
      ),
    )
  }

  const sharedDir = path.join(dir, 'node_modules/@hydro/shared/src')
  await fs.mkdir(sharedDir, { recursive: true })
  await fs.writeFile(
    path.join(sharedDir, 'version.ts'),
    `export const PROTOCOL_VERSION = ${options.protocolVersion ?? 1}\n`,
  )

  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('runDoctor', () => {
  it('健康工程全绿', async () => {
    const dir = await makeProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: '22.0.0' })

    expect(report.ok).toBe(true)
    expect(report.checks).toHaveLength(5)
    expect(report.checks.map((check) => check.id)).toEqual([
      'node',
      'deps',
      'manifest-package',
      'native-plugin',
      'protocol',
    ])
  })

  it('版本不匹配时给出具体错误与修复建议', async () => {
    const dir = await makeProject({ manifestVersion: '0.2.0', depSpec: '0.1.0' })
    const report = await runDoctor({ cwd: dir, nodeVersion: '22.0.0' })

    expect(report.ok).toBe(false)
    const deps = report.checks.find((check) => check.id === 'deps')
    expect(deps?.ok).toBe(false)
    expect(deps?.message).toContain('@hydro/bridge-sdk@0.1.0')
    expect(deps?.fix).toBe('hydro update --to 0.2.0')
  })

  it('协议版本不兼容时报错', async () => {
    const dir = await makeProject({ protocolVersion: 2 })
    const report = await runDoctor({ cwd: dir, nodeVersion: '22.0.0' })

    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'protocol')?.ok).toBe(false)
  })

  it('Node 版本低于 20 时报错', async () => {
    const dir = await makeProject()
    const report = await runDoctor({ cwd: dir, nodeVersion: '18.19.0' })

    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'node')?.ok).toBe(false)
  })

  it('缺少原生插件时报错', async () => {
    const dir = await makeProject({ withPlugin: false })
    const report = await runDoctor({ cwd: dir, nodeVersion: '22.0.0' })

    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.id === 'native-plugin')?.ok).toBe(false)
  })
})
