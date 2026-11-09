import { describe, expect, it } from 'vitest'
import { isBridgeNamespace, isBridgeRequest, isSuccessCode } from './guard'
import { ErrorCode, type BridgeRequest } from './protocol'

const validRequest: BridgeRequest = {
  id: '9f2c1a',
  ns: 'device',
  method: 'scan',
  params: { types: ['qrCode'] },
  ts: 1762680000000,
}

describe('isBridgeRequest', () => {
  it('接受合法请求', () => {
    expect(isBridgeRequest(validRequest)).toBe(true)
  })

  it('接受缺省 params', () => {
    expect(isBridgeRequest({ ...validRequest, params: undefined })).toBe(true)
  })

  it.each([
    ['null', null],
    ['字符串', 'req'],
    ['缺 id', { ...validRequest, id: undefined }],
    ['空 id', { ...validRequest, id: '' }],
    ['非法 ns', { ...validRequest, ns: 'unknown' }],
    ['空 method', { ...validRequest, method: '' }],
    ['ts 非数字', { ...validRequest, ts: 'now' }],
    ['ts 为 NaN', { ...validRequest, ts: Number.NaN }],
    ['params 为数组之外的原始值', { ...validRequest, params: 1 }],
    ['params 为 null', { ...validRequest, params: null }],
  ])('拒绝非法请求：%s', (_name, value) => {
    expect(isBridgeRequest(value)).toBe(false)
  })
})

describe('isBridgeNamespace', () => {
  it('识别全部命名空间', () => {
    for (const ns of ['ui', 'device', 'app', 'auth', 'pay', 'media', 'util']) {
      expect(isBridgeNamespace(ns)).toBe(true)
    }
  })

  it('拒绝未知命名空间', () => {
    expect(isBridgeNamespace('native')).toBe(false)
    expect(isBridgeNamespace(1)).toBe(false)
  })
})

describe('isSuccessCode', () => {
  it('仅 0 视为成功', () => {
    expect(isSuccessCode(ErrorCode.Success)).toBe(true)
    expect(isSuccessCode(ErrorCode.Timeout)).toBe(false)
  })
})
