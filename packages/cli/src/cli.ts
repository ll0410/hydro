import { renderChanges } from './changes.js'
import { resolveShellTemplateDir, runUpdate } from './update.js'
import type { UpdateReport } from './types.js'

const HELP = `Usage: hydro <command> [options]

Commands:
  update    双通道更新：@hydro/* 依赖 + 模板文件
  doctor    工程体检（Phase 8 提供）

Update options:
  --to <version>        升级 / 降级到指定版本（缺省查询 npm 最新）
  --dry-run             只输出迁移报告，不写文件
  --merge               冲突文件尝试三方合并（可选增强）
  --template-dir <dir>  指定新模板目录
  -h, --help            显示帮助
`

interface UpdateFlags {
  to?: string
  dryRun: boolean
  merge: boolean
  templateDir?: string
  help: boolean
}

export function parseUpdateArgs(argv: string[]): UpdateFlags {
  const flags: UpdateFlags = { dryRun: false, merge: false, help: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      flags.help = true
      continue
    }
    if (arg === '--dry-run') {
      flags.dryRun = true
      continue
    }
    if (arg === '--merge') {
      flags.merge = true
      continue
    }
    if (arg === '--to' || arg === '--template-dir' || arg === '--yes') {
      if (arg === '--yes') continue
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) throw new Error(`${arg} 缺少参数值`)
      i++
      if (arg === '--to') flags.to = value
      if (arg === '--template-dir') flags.templateDir = value
      continue
    }
    throw new Error(`未知参数：${arg}`)
  }

  return flags
}

function printUpdateReport(report: UpdateReport): void {
  console.log('')
  console.log(`Hydro 更新 → ${report.targetVersion}${report.dryRun ? '（dry-run）' : ''}`)

  console.log('依赖通道：')
  for (const upgrade of report.package.upgrades) {
    const suffix = upgrade.skipped ? '（跳过：非 semver 协议）' : ''
    console.log(`  - ${upgrade.name}: ${upgrade.from} → ${upgrade.to}${suffix}`)
  }

  console.log('模板通道：')
  console.log(
    `  覆盖 ${report.template.overwritten.length} / 冲突 ${report.template.conflicts.length} / 跳过 ${report.template.skipped.length} / 自有 ${report.template.owned.length}`,
  )
  for (const conflict of report.template.conflicts) {
    console.log(`  冲突：${conflict}（见 .hydro-conflicts/${conflict}.diff）`)
  }

  if (report.changes) {
    console.log('')
    console.log(renderChanges(report.changes))
  }

  if (report.dryRun) {
    console.log('')
    console.log('dry-run：未写入任何文件、未执行安装')
  }
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '-h' || command === '--help') {
    console.log(HELP)
    return 0
  }

  if (command === 'update') {
    try {
      const flags = parseUpdateArgs(rest)
      if (flags.help) {
        console.log(HELP)
        return 0
      }
      const report = await runUpdate({
        cwd: process.cwd(),
        to: flags.to,
        dryRun: flags.dryRun,
        merge: flags.merge,
        templateDir: flags.templateDir,
      })
      printUpdateReport(report)
      return 0
    } catch (error) {
      console.error(`hydro update 失败：${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  }

  if (command === 'doctor') {
    console.error('doctor 将在 Phase 8 提供')
    return 1
  }

  console.error(`未知命令：${command}`)
  console.error(HELP)
  return 1
}

export function defaultTemplateDir(): string | undefined {
  return resolveShellTemplateDir()
}
