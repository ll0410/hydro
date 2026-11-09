import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCodemodArgs } from './cli.js'
import { runCodemods } from './codemods.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const codemodsDir = path.join(repoRoot, 'codemods')
const dirs: string[] = []

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-codemod-'))
  dirs.push(dir)
  await fs.mkdir(path.join(dir, 'portals/order/src'), { recursive: true })
  await fs.writeFile(
    path.join(dir, 'portals/order/src/app.ts'),
    "const result = bridge.device.scanCode({ types: ['qrCode'] })\nexport default result\n",
  )
  await fs.writeFile(
    path.join(dir, '.hydro-manifest.json'),
    JSON.stringify({ frameworkVersion: '0.0.0', files: [] }, null, 2),
  )
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('parseCodemodArgs', () => {
  it('解析 --to / --yes / --codemods', () => {
    const flags = parseCodemodArgs(['--to', '0.1.0', '--yes', '--codemods', './codemods'])
    expect(flags.to).toBe('0.1.0')
    expect(flags.yes).toBe(true)
    expect(flags.codemodsDir).toBe('./codemods')
  })

  it('缺值报错', () => {
    expect(() => parseCodemodArgs(['--to'])).toThrow('缺少参数值')
  })
})

describe('runCodemods', () => {
  it('未提供 yes 时只出计划，不改写业务文件', async () => {
    const dir = await makeProject()
    const report = await runCodemods({
      projectDir: dir,
      fromVersion: '0.0.0',
      toVersion: '0.1.0',
      yes: false,
      codemodsDir,
    })

    expect(report.skipped).toBe(true)
    expect(report.versions).toEqual(['0.1.0'])
    expect(report.transforms).toHaveLength(1)
    expect(report.modified).toEqual([])

    const source = await fs.readFile(path.join(dir, 'portals/order/src/app.ts'), 'utf8')
    expect(source).toContain('scanCode')
  })

  it('yes 时执行 codemod 并改写调用点', async () => {
    const dir = await makeProject()
    const report = await runCodemods({
      projectDir: dir,
      fromVersion: '0.0.0',
      toVersion: '0.1.0',
      yes: true,
      codemodsDir,
    })

    expect(report.skipped).toBe(false)
    expect(report.modified).toEqual(['portals/order/src/app.ts'])

    const source = await fs.readFile(path.join(dir, 'portals/order/src/app.ts'), 'utf8')
    expect(source).toContain('bridge.device.scan({')
    expect(source).not.toContain('scanCode')
  })

  it('版本区间外不执行', async () => {
    const dir = await makeProject()
    const report = await runCodemods({
      projectDir: dir,
      fromVersion: '0.1.0',
      toVersion: '0.1.0',
      yes: true,
      codemodsDir,
    })

    expect(report.transforms).toEqual([])
    expect(report.modified).toEqual([])
  })
})
