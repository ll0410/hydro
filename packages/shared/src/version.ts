/**
 * 协议版本号。
 *
 * 规则：仅在破坏性变更（字段移除 / 语义改变）时 +1；
 * 新增可选字段或方法不升版本。壳与 SDK 握手时校验。
 */
export const PROTOCOL_VERSION = 1

/** 框架发布版本（与模板 / packages 同 tag 对齐，供 manifest 使用） */
export const FRAMEWORK_VERSION = '0.1.0'
