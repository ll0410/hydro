import { describe, expect, it } from 'vitest'
import { renderString, shouldIgnore } from './template.js'

describe('renderString', () => {
  it('替换已声明变量', () => {
    const output = renderString('name={{projectName}} entry={{webEntry}}', {
      projectName: 'my-app',
      webEntry: 'https://cdn.example.com/',
    })
    expect(output).toBe('name=my-app entry=https://cdn.example.com/')
  })

  it('未知变量保持原样', () => {
    expect(renderString('{{unknown}}', {})).toBe('{{unknown}}')
  })
})

describe('shouldIgnore', () => {
  it('命中文件、目录与任意层级同名目录', () => {
    expect(shouldIgnore('template.json', ['template.json'])).toBe(true)
    expect(shouldIgnore('node_modules/foo/index.js', ['node_modules'])).toBe(true)
    expect(shouldIgnore('src/node_modules/a.ts', ['node_modules'])).toBe(true)
    expect(shouldIgnore('src/App.vue', ['template.json', 'node_modules'])).toBe(false)
  })
})
