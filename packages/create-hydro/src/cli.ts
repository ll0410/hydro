import { basename, resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { scaffoldProject } from './scaffold.js'
import type { PackageManager, TemplateName } from './types.js'

export interface CliFlags {
  targetDir?: string
  name?: string
  template?: TemplateName
  packageManager?: PackageManager
  install: boolean
  localPackagesDir?: string
  help: boolean
}

const HELP = `Usage: create-hydro [project-dir] [options]

Options:
  --name <name>        项目名称（默认取目录名）
  --template <name>    shell（完整壳工程，默认）| minimal（仅业务模块）
  --pm <name>          pnpm（默认）| npm | yarn
  --no-install         跳过依赖安装
  --local <dir>        @hydro/* 指向本地 packages 目录
  -h, --help           显示帮助
`

export function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { install: true, help: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      flags.help = true
      continue
    }
    if (arg === '--no-install') {
      flags.install = false
      continue
    }
    if (arg === '--name' || arg === '--template' || arg === '--pm' || arg === '--local') {
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} 缺少参数值`)
      }
      i++
      if (arg === '--name') flags.name = value
      if (arg === '--template') flags.template = value as TemplateName
      if (arg === '--pm') flags.packageManager = value as PackageManager
      if (arg === '--local') flags.localPackagesDir = resolve(value)
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`)
    }
    if (!flags.targetDir) flags.targetDir = arg
  }

  return flags
}

function sanitizeProjectName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'my-app'
}

async function ask(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await rl.question(`${question}（${defaultValue}）：`)
    return answer.trim() || defaultValue
  } finally {
    rl.close()
  }
}

function canPrompt(): boolean {
  return Boolean(stdin.isTTY)
}

function printResult(
  result: {
    projectDir: string
    templateFiles: number
    manifest: { frameworkVersion: string }
  },
  options: { packageManager: PackageManager; install: boolean },
): void {
  console.log('')
  console.log(`创建完成：${result.projectDir}`)
  console.log(`- 模板文件：${result.templateFiles}`)
  console.log(`- 框架版本：${result.manifest.frameworkVersion}`)
  console.log('')
  console.log('下一步：')
  if (!options.install)
    console.log(`  cd ${result.projectDir}\n  ${options.packageManager} install`)
  else console.log(`  cd ${result.projectDir}`)
  console.log('  pnpm dev            # 浏览器开发（MockBridge）')
  console.log('  pnpm dev:shell      # 壳工程（HBuilderX / 真机）')
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  let flags: CliFlags
  try {
    flags = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(HELP)
    return 1
  }

  if (flags.help) {
    console.log(HELP)
    return 0
  }

  let name = flags.name
  let targetDir = flags.targetDir

  if (!name && !targetDir) {
    if (!canPrompt()) {
      console.error('缺少项目目录。示例：create-hydro my-app')
      console.error(HELP)
      return 1
    }
    name = await ask('项目名称', 'my-app')
  }

  if (!targetDir && name) targetDir = resolve(process.cwd(), name)
  if (!name && targetDir) name = basename(targetDir)
  if (!name || !targetDir) {
    console.error('缺少项目名称或目录')
    return 1
  }
  name = sanitizeProjectName(name)

  let template = flags.template
  if (!template && canPrompt()) {
    template = (await ask('模板 shell / minimal', 'shell')) as TemplateName
  }
  template = template === 'minimal' ? 'minimal' : 'shell'

  let packageManager = flags.packageManager
  if (!packageManager && canPrompt()) {
    packageManager = (await ask('包管理器 pnpm / npm / yarn', 'pnpm')) as PackageManager
  }
  packageManager = packageManager === 'npm' || packageManager === 'yarn' ? packageManager : 'pnpm'

  try {
    const result = await scaffoldProject({
      targetDir,
      projectName: name,
      template,
      packageManager,
      install: flags.install,
      localPackagesDir: flags.localPackagesDir,
    })
    printResult(result, { packageManager, install: flags.install })
    return 0
  } catch (error) {
    console.error(`创建失败：${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => {
    process.exitCode = code
  })
}
