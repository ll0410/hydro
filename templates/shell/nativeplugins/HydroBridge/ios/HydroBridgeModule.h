#import "DCUniModule.h"

/**
 * HydroBridge uni-app 原生插件模块（iOS）。
 *
 * 职责：
 * 1. 绑定当前页面 WKWebView，注册 WKScriptMessageHandler；
 * 2. 注入 hydro-bridge.js（window.__HYDRO_BRIDGE__ / window.__bridgeCallback__）；
 * 3. 用 evaluateJavaScript 回传回调。
 */
@interface HydroBridgeModule : DCUniModule

@end
