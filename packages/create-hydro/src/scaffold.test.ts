import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { scaffoldProject } from './scaffold.js'
import { sha256 } from './template.js'
import type { HydroManifest } from './types.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const templatesDir = path.join(repoRoot, 'templates')
const packagesDir = path.join(repoRoot, 'packages')
const tempDir = path.join(tmpdir(), `hydro-create-test-${Date.now()}`)

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('scaffoldProject', () => {
  it('生成 shell 项目结构、manifest 与本地依赖', async () => {
    const projectDir = path.join(tempDir, 'my-app')
    const result = await scaffoldProject({
      targetDir: projectDir,
      projectName: 'my-app',
      template: 'shell',
      install: false,
      templatesDir,
      localPackagesDir: packagesDir,
    })

    expect(result.templateFiles).toBeGreaterThan(20)
    expect(result.manifest.frameworkVersion).toBe('0.1.0')

    const manifest = JSON.parse(
      (await fs.readFile(path.join(projectDir, '.hydro-manifest.json'), 'utf8')) as string,
    ) as HydroManifest
    expect(manifest.files).toHaveLength(result.files.length)
    expect(manifest.files.some((file) => file.path === 'apps/shell/src/App.vue')).toBe(true)
    expect(manifest.files.some((file) => file.path === 'apps/shell/template.json')).toBe(false)

    const hash = sha256(await fs.readFile(path.join(projectDir, 'apps/shell/src/App.vue')))
    expect(manifest.files.find((file) => file.path === 'apps/shell/src/App.vue')?.hash).toBe(hash)

    await expect(
      fs.access(path.join(projectDir, 'apps/shell/package.json')),
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(projectDir, 'apps/shell/nativeplugins/HydroBridge/package.json')),
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(projectDir, 'portals/order/src/App.vue')),
    ).resolves.toBeUndefined()
    await expect(fs.access(path.join(projectDir, 'hydro.config.ts'))).resolves.toBeUndefined()

    const shellPkg = JSON.parse(
      (await fs.readFile(path.join(projectDir, 'apps/shell/package.json'), 'utf8')) as string,
    ) as { name: string; dependencies: Record<string, string> }
    expect(shellPkg.name).toBe('my-app-shell')
    expect(shellPkg.dependencies['@hydro/bridge-sdk']).toMatch(/^link:/)

    const portalPkg = JSON.parse(
      (await fs.readFile(path.join(projectDir, 'portals/order/package.json'), 'utf8')) as string,
    ) as { name: string; dependencies: Record<string, string> }
    expect(portalPkg.name).toBe('my-app-portal')
    expect(portalPkg.dependencies['@hydro/web-sdk']).toMatch(/^link:/)

    const rootPkg = JSON.parse(
      (await fs.readFile(path.join(projectDir, 'package.json'), 'utf8')) as string,
    ) as { name: string; scripts: Record<string, string> }
    expect(rootPkg.name).toBe('my-app')
    expect(rootPkg.scripts.dev).toContain('my-app-portal')

    const shellConfig = (await fs.readFile(
      path.join(projectDir, 'apps/shell/hydro.config.ts'),
      'utf8',
    )) as string
    expect(shellConfig).toContain("webEntry: 'https://cdn.example.com/'")
    expect(shellConfig).toContain('whitelist: ["https://cdn.example.com"]')
  })

  it('minimal 模板不生成壳工程', async () => {
    const projectDir = path.join(tempDir, 'minimal-app')
    const result = await scaffoldProject({
      targetDir: projectDir,
      projectName: 'minimal-app',
      template: 'minimal',
      install: false,
      templatesDir,
      localPackagesDir: packagesDir,
    })

    expect(result.templateFiles).toBeGreaterThan(0)
    await expect(fs.access(path.join(projectDir, 'apps/shell'))).rejects.toBeDefined()
    await expect(
      fs.access(path.join(projectDir, 'portals/order/src/App.vue')),
    ).resolves.toBeUndefined()
  })

  it('目标目录非空时拒绝创建', async () => {
    const projectDir = path.join(tempDir, 'occupied')
    await fs.mkdir(projectDir, { recursive: true })
    await fs.writeFile(path.join(projectDir, 'keep.txt'), 'keep')

    await expect(
      scaffoldProject({
        targetDir: projectDir,
        projectName: 'occupied',
        install: false,
        templatesDir,
      }),
    ).rejects.toThrow('目标目录非空')
  })
})
