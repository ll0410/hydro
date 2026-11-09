import { spawnSync } from 'node:child_process'
import type { CommandResult, CommandRunner } from './types.js'

/** 默认命令执行器：同步 spawn，便于更新流程按步骤串行 */
export const defaultRunner: CommandRunner = {
  run(command, args, cwd): CommandResult {
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  },
}
