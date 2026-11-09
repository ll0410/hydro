export interface ManifestFile {
  path: string
  hash: string
}

export interface HydroManifest {
  frameworkVersion: string
  files: ManifestFile[]
}

export interface PackageJson {
  name: string
  version?: string
  packageManager?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  [key: string]: unknown
}

export interface ChangeEntry {
  path: string
  description?: string
}

export interface ChangesFile {
  version: string
  files: Array<string | ChangeEntry>
  breaking: string[]
}

export interface TemplateVariable {
  key: string
  prompt: string
  default: string
}

export interface TemplateMeta {
  name: string
  version: string
  description?: string
  variables: TemplateVariable[]
  ignore: string[]
}

export interface CommandResult {
  status: number | null
  stdout: string
  stderr: string
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): CommandResult
}

export interface Registry {
  latest(packageName: string): Promise<string>
}

export type PackageManager = 'pnpm' | 'npm' | 'yarn'

export interface UpdateOptions {
  cwd: string
  to?: string
  dryRun?: boolean
  merge?: boolean
  templateDir?: string
  runner?: CommandRunner
  registry?: Registry
  /** 模板变量，默认从 package.json name 推导 projectName */
  variables?: Record<string, string>
}

export interface DependencyUpgrade {
  name: string
  from: string
  to: string
  skipped?: boolean
}

export interface PackageChannelResult {
  fromVersion: string
  toVersion: string
  upgrades: DependencyUpgrade[]
  /** 被改写的 package.json（项目相对路径） */
  files: string[]
  changed: boolean
  installed: boolean
}

export interface TemplateUpdateReport {
  version: string
  overwritten: string[]
  conflicts: string[]
  skipped: string[]
  owned: string[]
  changed: boolean
  manifest: HydroManifest
}

export interface UpdateReport {
  targetVersion: string
  dryRun: boolean
  package: PackageChannelResult
  template: TemplateUpdateReport
  changes?: ChangesFile
}
