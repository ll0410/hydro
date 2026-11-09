#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distEntry = resolve(packageRoot, 'dist/cli.js')

if (!existsSync(distEntry)) {
  const require = createRequire(import.meta.url)
  let tsc
  try {
    tsc = require.resolve('typescript/bin/tsc')
  } catch {
    console.error('@hydro/offline-packer 尚未构建，且未找到 typescript。请先执行 pnpm build。')
    process.exit(1)
  }
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', resolve(packageRoot, 'tsconfig.build.json')],
    {
      stdio: 'inherit',
    },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const { run } = await import(pathToFileURL(distEntry).href)
process.exitCode = await run()
