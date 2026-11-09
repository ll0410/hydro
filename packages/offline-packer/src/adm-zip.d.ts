declare module 'adm-zip' {
  interface ZipEntry {
    getData(): Buffer
  }

  class AdmZip {
    constructor(fileName?: string)
    addFile(entryName: string, content: Buffer): void
    writeZip(targetFileName: string): void
    getEntry(entryName: string): ZipEntry | null
    readAsText(entryName: string): string
  }

  export default AdmZip
}
