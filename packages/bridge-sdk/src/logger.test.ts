import { describe, expect, it } from 'vitest'
import { BridgeLogger } from './logger'

const entry = (id: string) => ({
  id,
  name: 'device.scan',
  cost: 1,
  code: 0,
  ts: 1,
})

describe('BridgeLogger', () => {
  it('保留最近 capacity 条记录', () => {
    const logger = new BridgeLogger(200)
    for (let i = 0; i < 250; i++) logger.push(entry(String(i)))
    expect(logger.entries()).toHaveLength(200)
    expect(logger.entries()[0]?.id).toBe('50')
    expect(logger.entries().at(-1)?.id).toBe('249')
  })

  it('last 返回末尾记录', () => {
    const logger = new BridgeLogger(3)
    logger.push(entry('a'))
    logger.push(entry('b'))
    expect(logger.last(1).map((item) => item.id)).toEqual(['b'])
  })

  it('entries 返回副本，不被外部修改', () => {
    const logger = new BridgeLogger()
    logger.push(entry('a'))
    logger.entries().pop()
    expect(logger.entries()).toHaveLength(1)
  })

  it('clear 清空缓冲', () => {
    const logger = new BridgeLogger()
    logger.push(entry('a'))
    logger.clear()
    expect(logger.entries()).toEqual([])
  })
})
