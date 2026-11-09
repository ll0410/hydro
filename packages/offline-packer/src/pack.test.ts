import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'
import { diffFileLists } from './diff.js'
import { collectBuildFiles, packDirectory } from './pack.js'
import { createSignature, manifestForSigning, verifySignature } from './sign.js'
import type { OfflineManifest } from './types.js'

const dirs: string[] = []

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}

async function makeBuildDir(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-pack-'))
  dirs.push(dir)
  await writeFiles(dir, files)
  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('packDirectory', () => {
  it('生成 zip、文件清单与可校验签名', async () => {
    const sourceDir = await makeBuildDir({
      'index.html': '<!doctype html><div id="app"></div>',
      'assets/app.js': 'console.log("hydro")',
    })
    const outDir = path.join(sourceDir, 'releases')

    const result = await packDirectory({
      sourceDir,
      outDir,
      app: 'demo',
      channel: 'prod',
      version: '1.0.0',
      signingSecret: 'test-secret',
    })

    expect(result.manifest.files).toHaveLength(2)
    expect(result.manifest.totalSize).toBeGreaterThan(0)
    expect(
      verifySignature(
        'test-secret',
        manifestForSigning(result.manifest),
        result.manifest.signature,
      ),
    ).toBe(true)

    const tampered = { ...result.manifest, version: '9.9.9' }
    expect(
      verifySignature('test-secret', manifestForSigning(tampered), result.manifest.signature),
    ).toBe(false)

    const zip = new AdmZip(result.zipPath)
    expect(zip.getEntry('manifest.json')).toBeTruthy()
    expect(zip.getEntry('index.html')?.getData().toString('utf8')).toContain('id="app"')
    expect(zip.getEntry('assets/app.js')?.getData().toString('utf8')).toContain('hydro')

    const embedded = JSON.parse(zip.readAsText('manifest.json')) as OfflineManifest
    expect(embedded.version).toBe('1.0.0')
    expect(embedded.signature).toBe(result.manifest.signature)
  })

  it('签名密钥不同则校验失败', async () => {
    const sourceDir = await makeBuildDir({ 'index.html': 'v1' })
    const result = await packDirectory({
      sourceDir,
      outDir: path.join(sourceDir, 'out'),
      app: 'demo',
      channel: 'prod',
      version: '1.0.0',
      signingSecret: 'secret-a',
    })

    expect(createSignature('secret-b', manifestForSigning(result.manifest))).not.toBe(
      result.manifest.signature,
    )
  })
})

describe('diffFileLists', () => {
  it('识别新增 / 修改 / 删除文件', async () => {
    const oldFiles = [
      { path: 'index.html', size: 1, hash: 'h1' },
      { path: 'assets/app.js', size: 1, hash: 'h2' },
      { path: 'assets/old.js', size: 1, hash: 'h3' },
    ]
    const dir = await makeBuildDir({
      'index.html': 'new',
      'assets/app.js': 'changed',
      'assets/new.js': 'added',
    })
    const newFiles = await collectBuildFiles(dir)

    const report = diffFileLists('1.0.0', '1.1.0', oldFiles, newFiles)
    expect(report.added).toEqual(['assets/new.js'])
    expect(report.changed).toEqual(['assets/app.js', 'index.html'])
    expect(report.removed).toEqual(['assets/old.js'])
    expect(report.mode).toBe('full')
    expect(report.note).toContain('bsdiff')
  })
})
