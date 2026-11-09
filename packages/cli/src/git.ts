import type { CommandRunner } from './types.js'

export type WorkspaceStatus = 'clean' | 'dirty' | 'not-repo'

export function getWorkspaceStatus(cwd: string, runner: CommandRunner): WorkspaceStatus {
  const inside = runner.run('git', ['rev-parse', '--is-inside-work-tree'], cwd)
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return 'not-repo'
  }
  const status = runner.run('git', ['status', '--porcelain'], cwd)
  if (status.status !== 0) return 'dirty'
  return status.stdout.trim().length > 0 ? 'dirty' : 'clean'
}

/** update 前安全检查：非 git 仓库跳过，工作区有改动则拒绝执行 */
export function assertCleanWorkspace(cwd: string, runner: CommandRunner): void {
  const status = getWorkspaceStatus(cwd, runner)
  if (status === 'dirty') {
    throw new Error('git 工作区不干净，请先提交或暂存改动后再执行 hydro update')
  }
}

export function commitChanges(
  cwd: string,
  runner: CommandRunner,
  message: string,
  paths: string[],
): void {
  if (paths.length === 0) return
  const add = runner.run('git', ['add', ...paths], cwd)
  if (add.status !== 0) {
    throw new Error(`git add 失败：${add.stderr.trim()}`)
  }
  const commit = runner.run('git', ['commit', '-m', message], cwd)
  if (commit.status !== 0) {
    throw new Error(`git commit 失败：${commit.stderr.trim()}`)
  }
}
