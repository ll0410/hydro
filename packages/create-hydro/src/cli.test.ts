import { describe, expect, it } from 'vitest'
import { parseArgs } from './cli.js'

describe('parseArgs', () => {
  it('解析目录与全部选项', () => {
    const flags = parseArgs([
      'my-app',
      '--name',
      'demo',
      '--template',
      'minimal',
      '--pm',
      'npm',
      '--no-install',
      '--local',
      './packages',
    ])
    expect(flags.targetDir).toBe('my-app')
    expect(flags.name).toBe('demo')
    expect(flags.template).toBe('minimal')
    expect(flags.packageManager).toBe('npm')
    expect(flags.install).toBe(false)
    expect(flags.localPackagesDir).toContain('packages')
  })

  it('帮助参数', () => {
    expect(parseArgs(['--help']).help).toBe(true)
  })

  it('未知参数报错', () => {
    expect(() => parseArgs(['--unknown'])).toThrow('未知参数')
  })

  it('选项缺值报错', () => {
    expect(() => parseArgs(['--name'])).toThrow('缺少参数值')
  })
})
