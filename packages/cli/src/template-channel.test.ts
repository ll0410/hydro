import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256 } from './files.js'
import { updateTemplateChannel } from './template-channel.js'
import type { HydroManifest } from './types.js'

const dirs: string[] = []

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}

async function makeFixture(): Promise<{
  projectDir: string
  templateDir: string
  manifest: HydroManifest
}> {
  const projectDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-tpl-project-'))
  const templateDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-tpl-next-'))
  dirs.push(projectDir, templateDir)

  await writeFiles(projectDir, {
    'apps/shell/src/a.ts': 'old-a',
    'apps/shell/src/b.ts': 'user-b',
    'apps/shell/src/c.ts': 'owned-c',
  })
  await writeFiles(templateDir, {
    'template.json': JSON.stringify(
      { name: 'shell', version: '0.2.0', variables: [], ignore: ['template.json'] },
      null,
      2,
    ),
    'src/a.ts': 'new-a',
    'src/b.ts': 'new-b',
    'src/new.ts': 'added',
  })

  const manifest: HydroManifest = {
    frameworkVersion: '0.1.0',
    files: [
      { path: 'apps/shell/src/a.ts', hash: sha256('old-a') },
      { path: 'apps/shell/src/b.ts', hash: sha256('old-b') },
    ],
  }

  return { projectDir, templateDir, manifest }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('updateTemplateChannel', () => {
  it('分类处理未改 / 已改 / 自有文件并重写 manifest', async () => {
    const { projectDir, templateDir, manifest } = await makeFixture()

    const report = await updateTemplateChannel({
      projectDir,
      manifest,
      toVersion: '0.2.0',
      templateDir,
      variables: {},
      dryRun: false,
    })

    expect(report.overwritten).toEqual(['apps/shell/src/a.ts', 'apps/shell/src/new.ts'])
    expect(report.conflicts).toEqual(['apps/shell/src/b.ts'])
    expect(report.owned).toContain('apps/shell/src/c.ts')
    expect(report.manifest.frameworkVersion).toBe('0.2.0')

    expect(await fs.readFile(path.join(projectDir, 'apps/shell/src/a.ts'), 'utf8')).toBe('new-a')
    expect(await fs.readFile(path.join(projectDir, 'apps/shell/src/b.ts'), 'utf8')).toBe('user-b')
    expect(await fs.readFile(path.join(projectDir, 'apps/shell/src/c.ts'), 'utf8')).toBe('owned-c')
    expect(await fs.readFile(path.join(projectDir, 'apps/shell/src/new.ts'), 'utf8')).toBe('added')

    const conflictDiff = await fs.readFile(
      path.join(projectDir, '.hydro-conflicts/apps/shell/src/b.ts.diff'),
      'utf8',
    )
    expect(conflictDiff).toContain('-user-b')
    expect(conflictDiff).toContain('+new-b')

    const hashes = new Map(report.manifest.files.map((file) => [file.path, file.hash]))
    expect(hashes.get('apps/shell/src/a.ts')).toBe(sha256('new-a'))
    expect(hashes.get('apps/shell/src/b.ts')).toBe(sha256('old-b'))
    expect(hashes.get('apps/shell/src/new.ts')).toBe(sha256('added'))
  })

  it('dry-run 只出报告，不覆盖、不写冲突', async () => {
    const { projectDir, templateDir, manifest } = await makeFixture()

    const report = await updateTemplateChannel({
      projectDir,
      manifest,
      toVersion: '0.2.0',
      templateDir,
      variables: {},
      dryRun: true,
    })

    expect(report.overwritten).toEqual(['apps/shell/src/a.ts', 'apps/shell/src/new.ts'])
    expect(report.conflicts).toEqual(['apps/shell/src/b.ts'])
    expect(await fs.readFile(path.join(projectDir, 'apps/shell/src/a.ts'), 'utf8')).toBe('old-a')
    await expect(
      fs.access(path.join(projectDir, '.hydro-conflicts/apps/shell/src/b.ts.diff')),
    ).rejects.toBeDefined()
  })
})
