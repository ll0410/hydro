import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readManifest, readPackageJson, writePackageJson } from './files.js'
import { updatePackageChannel } from './package-channel.js'
import { runUpdate } from './update.js'
import type { CommandRunner } from './types.js'

const dirs: string[] = []

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-cli-'))
  dirs.push(dir)
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        version: '0.1.0',
        private: true,
        packageManager: 'pnpm@10.0.0',
        dependencies: {
          '@hydro/bridge-sdk': '^0.1.0',
          vue: '^3.5.0',
        },
        devDependencies: {
          '@hydro/shared': '0.1.0',
        },
      },
      null,
      2,
    ),
  )
  await fs.writeFile(
    path.join(dir, '.hydro-manifest.json'),
    JSON.stringify(
      {
        frameworkVersion: '0.1.0',
        files: [{ path: 'apps/shell/src/App.vue', hash: 'stale-hash' }],
      },
      null,
      2,
    ),
  )
  await fs.writeFile(
    path.join(dir, 'changes.json'),
    JSON.stringify(
      {
        version: '0.2.0',
        files: [{ path: 'apps/shell/src/App.vue', description: '新增 bridge 面板' }],
        breaking: ['bridge.device.scan() 参数改为对象'],
      },
      null,
      2,
    ),
  )
  return dir
}

async function makeEmptyTemplate(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-tpl-empty-'))
  dirs.push(dir)
  await fs.writeFile(
    path.join(dir, 'template.json'),
    JSON.stringify(
      { name: 'shell', version: '0.2.0', variables: [], ignore: ['template.json'] },
      null,
      2,
    ),
  )
  return dir
}

function fakeRunner(options: { dirty?: string } = {}): {
  runner: CommandRunner
  calls: string[]
} {
  const calls: string[] = []
  const runner: CommandRunner = {
    run(command, args) {
      calls.push([command, ...args].join(' '))
      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: 'true\n', stderr: '' }
      }
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: options.dirty ?? '', stderr: '' }
      }
      return { status: 0, stdout: '', stderr: '' }
    },
  }
  return { runner, calls }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('updatePackageChannel', () => {
  it('升级全部 @hydro/* 依赖并安装', async () => {
    const dir = await makeProject()
    const { runner, calls } = fakeRunner()

    const result = await updatePackageChannel({
      projectDir: dir,
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      dryRun: false,
      runner,
    })

    expect(result.changed).toBe(true)
    expect(result.installed).toBe(true)
    const written = await readPackageJson(dir)
    expect(written.dependencies!['@hydro/bridge-sdk']).toBe('^0.2.0')
    expect(written.devDependencies!['@hydro/shared']).toBe('0.2.0')
    expect(written.dependencies!.vue).toBe('^3.5.0')
    expect(calls).toContain('pnpm install')
  })

  it('dry-run 不改写 package.json、不安装', async () => {
    const dir = await makeProject()
    const { runner, calls } = fakeRunner()

    const result = await updatePackageChannel({
      projectDir: dir,
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      dryRun: true,
      runner,
    })

    expect(result.changed).toBe(true)
    expect(result.installed).toBe(false)
    const written = await readPackageJson(dir)
    expect(written.dependencies!['@hydro/bridge-sdk']).toBe('^0.1.0')
    expect(calls.some((call) => call.startsWith('pnpm install'))).toBe(false)
  })

  it('跳过 link / file 等非 semver 协议', async () => {
    const dir = await makeProject()
    const packageJson = await readPackageJson(dir)
    packageJson.dependencies!['@hydro/bridge-sdk'] = 'link:../../packages/bridge-sdk'
    await writePackageJson(dir, packageJson)

    const { runner } = fakeRunner()
    const result = await updatePackageChannel({
      projectDir: dir,
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      dryRun: true,
      runner,
    })

    const upgrade = result.upgrades.find((item) => item.name === '@hydro/bridge-sdk')
    expect(upgrade?.skipped).toBe(true)
  })
})

describe('runUpdate', () => {
  it('完整更新：依赖 + manifest + 双通道自动提交', async () => {
    const dir = await makeProject()
    const templateDir = await makeEmptyTemplate()
    const { runner, calls } = fakeRunner()

    const report = await runUpdate({ cwd: dir, to: '0.2.0', templateDir, runner })

    expect(report.targetVersion).toBe('0.2.0')
    expect(report.changes?.breaking).toContain('bridge.device.scan() 参数改为对象')
    expect((await readManifest(dir)).frameworkVersion).toBe('0.2.0')
    expect(calls).toContain('git commit -m chore(hydro): update deps to 0.2.0')
    expect(calls).toContain('git commit -m chore(hydro): update templates to 0.2.0')
  })

  it('dry-run 不改文件、不安装、不提交', async () => {
    const dir = await makeProject()
    const templateDir = await makeEmptyTemplate()
    const { runner, calls } = fakeRunner()

    const report = await runUpdate({ cwd: dir, to: '0.2.0', templateDir, dryRun: true, runner })

    expect(report.dryRun).toBe(true)
    expect((await readPackageJson(dir)).dependencies!['@hydro/bridge-sdk']).toBe('^0.1.0')
    expect((await readManifest(dir)).frameworkVersion).toBe('0.1.0')
    expect(calls.some((call) => call.includes('git commit'))).toBe(false)
    expect(calls.some((call) => call.includes('install'))).toBe(false)
  })

  it('工作区不干净时拒绝执行', async () => {
    const dir = await makeProject()
    const templateDir = await makeEmptyTemplate()
    const { runner } = fakeRunner({ dirty: ' M package.json\n' })

    await expect(runUpdate({ cwd: dir, to: '0.2.0', templateDir, runner })).rejects.toThrow(
      'git 工作区不干净',
    )
    expect((await readPackageJson(dir)).dependencies!['@hydro/bridge-sdk']).toBe('^0.1.0')
  })
})
