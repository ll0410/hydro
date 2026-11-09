import type { CommandRunner, Registry } from './types.js'

/** npm 版本查询（要求 @hydro/* 已发布） */
export function createNpmRegistry(runner: CommandRunner, cwd: string): Registry {
  return {
    async latest(packageName: string): Promise<string> {
      const result = runner.run('npm', ['view', packageName, 'version'], cwd)
      if (result.status !== 0) {
        throw new Error(
          `查询 ${packageName} 最新版本失败：${result.stderr.trim() || 'npm view 失败'}`,
        )
      }
      const version = result.stdout.trim()
      if (!version) throw new Error(`查询 ${packageName} 最新版本为空`)
      return version
    },
  }
}

/** 极简 semver 比较：仅处理数字段，预发布版本按低于正式版处理 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string): number[] => {
    const [core, prerelease] = version.split('-', 2)
    const parts = (core ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0)
    return prerelease ? [...parts, -1] : [...parts, 0]
  }

  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r) return l > r ? 1 : -1
  }
  return 0
}

export function maxVersion(versions: string[]): string {
  return versions.reduce((max, current) => (compareVersions(current, max) > 0 ? current : max))
}
