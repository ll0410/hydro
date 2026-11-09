import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import type { HydroManifest, PackageJson } from './types.js'

export const MANIFEST_FILE = '.hydro-manifest.json'

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function readManifest(projectDir: string): Promise<HydroManifest> {
  const raw = await fs.readFile(path.join(projectDir, MANIFEST_FILE), 'utf8')
  return JSON.parse(raw) as HydroManifest
}

export async function writeManifest(projectDir: string, manifest: HydroManifest): Promise<void> {
  await fs.writeFile(
    path.join(projectDir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
}

export async function readPackageJson(projectDir: string): Promise<PackageJson> {
  const raw = await fs.readFile(path.join(projectDir, 'package.json'), 'utf8')
  return JSON.parse(raw) as PackageJson
}

export async function writePackageJson(projectDir: string, pkg: PackageJson): Promise<void> {
  await writePackageJsonFile(path.join(projectDir, 'package.json'), pkg)
}

export async function writePackageJsonFile(filePath: string, pkg: PackageJson): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

export async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  if (!existsSync(filePath)) return null
  return fs.readFile(filePath)
}

export async function hashFileIfExists(filePath: string): Promise<string | null> {
  const content = await readFileIfExists(filePath)
  return content ? sha256(content) : null
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath)
}
