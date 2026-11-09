import { promises as fs } from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { diffFileLists } from './diff.js'
import { collectBuildFiles, packDirectory } from './pack.js'
import { publishPackage } from './publish.js'
import type { OfflineManifest } from './types.js'

const HELP = `Usage: hydro-offline <command> [options]

Commands:
  pack       打包构建产物为离线包 zip（含 manifest + 签名）
  diff       对比两次构建文件清单
  publish    上传离线包到版本服务

Pack options:
  --dir <dir>          构建产物目录（必填）
  --app <name>         App 标识（必填）
  --channel <name>     渠道，默认 prod
  --version <version>  版本号（必填）
  --out <dir>          输出目录，默认 releases
  --secret <secret>    签名密钥（默认 HYDRO_SIGNING_SECRET）
  --from <version>     差量基线版本（仅记录元信息）

Diff options:
  --from <manifest>    旧版本 manifest.json（必填）
  --dir <dir>          新构建产物目录（必填）
  --version <version>  新版本号，默认 next

Publish options:
  --zip <file>         离线包 zip（必填）
  --server <url>       版本服务地址（必填）
`

interface Flags {
  dir?: string
  app?: string
  channel?: string
  version?: string
  out?: string
  secret?: string
  from?: string
  zip?: string
  server?: string
  help: boolean
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { help: false }
  const keys: Record<string, keyof Flags> = {
    '--dir': 'dir',
    '--app': 'app',
    '--channel': 'channel',
    '--version': 'version',
    '--out': 'out',
    '--secret': 'secret',
    '--from': 'from',
    '--zip': 'zip',
    '--server': 'server',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      flags.help = true
      continue
    }
    const key = keys[arg]
    if (!key) throw new Error(`未知参数：${arg}`)
    const value = argv[i + 1]
    if (!value || value.startsWith('-')) throw new Error(`${arg} 缺少参数值`)
    i++
    ;(flags as unknown as Record<string, string | boolean | undefined>)[key] = value
  }

  return flags
}

async function runPack(argv: string[]): Promise<number> {
  const flags = parseArgs(argv)
  if (flags.help) {
    console.log(HELP)
    return 0
  }
  if (!flags.dir || !flags.app || !flags.version) {
    throw new Error('pack 需要 --dir / --app / --version')
  }
  const secret = flags.secret ?? process.env.HYDRO_SIGNING_SECRET
  if (!secret) throw new Error('缺少签名密钥：--secret 或 HYDRO_SIGNING_SECRET')

  const result = await packDirectory({
    sourceDir: flags.dir,
    outDir: flags.out ?? 'releases',
    app: flags.app,
    channel: flags.channel ?? 'prod',
    version: flags.version,
    signingSecret: secret,
    from: flags.from,
  })

  console.log(`离线包已生成：${result.zipPath}`)
  console.log(`文件数：${result.manifest.files.length}，总大小：${result.manifest.totalSize} bytes`)
  console.log(`签名：${result.manifest.signature.slice(0, 16)}...`)
  return 0
}

async function runDiff(argv: string[]): Promise<number> {
  const flags = parseArgs(argv)
  if (flags.help) {
    console.log(HELP)
    return 0
  }
  if (!flags.from || !flags.dir) throw new Error('diff 需要 --from / --dir')

  const fromManifest = JSON.parse(await fs.readFile(flags.from, 'utf8')) as OfflineManifest
  const toFiles = await collectBuildFiles(flags.dir)
  const report = diffFileLists(
    fromManifest.version,
    flags.version ?? 'next',
    fromManifest.files,
    toFiles,
  )
  console.log(JSON.stringify(report, null, 2))
  return 0
}

async function runPublish(argv: string[]): Promise<number> {
  const flags = parseArgs(argv)
  if (flags.help) {
    console.log(HELP)
    return 0
  }
  if (!flags.zip || !flags.server) throw new Error('publish 需要 --zip / --server')

  const zip = new AdmZip(flags.zip)
  const entry = zip.getEntry('manifest.json')
  if (!entry) throw new Error('zip 内缺少 manifest.json')
  const manifest = JSON.parse(entry.getData().toString('utf8')) as OfflineManifest

  const result = await publishPackage({
    serverUrl: flags.server,
    zipPath: flags.zip,
    manifest,
  })
  console.log(
    `发布成功（HTTP ${result.status}）：${manifest.app}/${manifest.channel}@${manifest.version}`,
  )
  return 0
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv
  if (!command || command === '-h' || command === '--help') {
    console.log(HELP)
    return 0
  }

  try {
    if (command === 'pack') return await runPack(rest)
    if (command === 'diff') return await runDiff(rest)
    if (command === 'publish') return await runPublish(rest)
    console.error(`未知命令：${command}`)
    console.error(HELP)
    return 1
  } catch (error) {
    console.error(`hydro-offline 失败：${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}

export function resolveOutDir(input: string): string {
  return path.resolve(process.cwd(), input)
}
