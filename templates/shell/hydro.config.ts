export interface HydroConfig {
  /** H5 业务入口：debug 指向开发机 dev server，生产指向 CDN / 离线包地址 */
  webEntry: string
  /** 容器导航白名单：可以是完整 origin，也可以是域名或 *.example.com */
  whitelist: string[]
  /** 调试开关：放行任意 host、注入 vConsole、打开桥接日志 */
  debug: boolean
  /** WebView 预热池大小 */
  webviewPoolSize: number
}

const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'

/**
 * 壳配置默认值。
 *
 * 生成项目后按实际环境修改 webEntry / whitelist；debug 构建下白名单校验放行但会打告警。
 */
const hydroConfig: HydroConfig = {
  webEntry: isProd ? 'https://cdn.example.com/' : 'http://192.168.1.100:5173/',
  whitelist: ['https://cdn.example.com', '*.example.com'],
  debug: !isProd,
  webviewPoolSize: 2,
}

export default hydroConfig
