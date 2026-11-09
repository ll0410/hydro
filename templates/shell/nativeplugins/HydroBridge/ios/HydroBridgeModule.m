#import "HydroBridgeModule.h"
#import "HydroBridgeJsHandler.h"
#import <WebKit/WebKit.h>

@interface HydroBridgeModule ()
@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic, strong) HydroBridgeJsHandler *jsHandler;
@end

@implementation HydroBridgeModule

UNI_EXPORT_METHOD(@selector(attach:))
- (void)attach:(UniModuleKeepAliveCallback)callback {
    dispatch_async(dispatch_get_main_queue(), ^{
        WKWebView *webView = [self resolveWebView];
        if (!webView) {
            callback(@{@"ok": @NO, @"msg": @"webview unavailable"}, NO);
            return;
        }

        self.webView = webView;
        self.jsHandler = [[HydroBridgeJsHandler alloc] initWithWebView:webView module:self];
        [webView.configuration.userContentController addScriptMessageHandler:self.jsHandler
                                                                        name:@"HydroBridge"];
        [self injectGlue];
        callback(@{@"ok": @YES}, NO);
    });
}

UNI_EXPORT_METHOD(@selector(preload:))
- (void)preload:(NSDictionary *)options {
    NSLog(@"[BRIDGE] preload count=%@", options[@"count"]);
}

UNI_EXPORT_METHOD(@selector(release:))
- (void)release:(NSString *)slotId {
    NSLog(@"[BRIDGE] release %@", slotId);
}

/** 原生 → H5 回调：window.__bridgeCallback__(id, payloadJson) */
UNI_EXPORT_METHOD(@selector(sendCallback:payload:))
- (void)sendCallback:(NSString *)requestId payload:(NSString *)payloadJson {
    NSString *script = [NSString stringWithFormat:
        @"window.__bridgeCallback__ && window.__bridgeCallback__(%@,%@)",
        [self jsStringLiteral:requestId],
        [self jsStringLiteral:payloadJson]];
    [self.webView evaluateJavaScript:script completionHandler:nil];
    NSLog(@"[BRIDGE] res id=%@", requestId);
}

/** 收到 H5 下行报文后转交壳 JS 侧 dispatcher */
- (void)handleH5Message:(NSString *)message {
    NSLog(@"[BRIDGE] req %@", message);
    // TODO: 接入项目实际的 uni-app 全局事件通道；不同 HBuilderX 版本 API 名称可能不同
    [self.uniInstance fireGlobalEvent:@"hydroBridgeMessage"
                                params:@{@"message": message ?: @""}];
}

- (void)injectGlue {
    NSString *path = [[NSBundle mainBundle] pathForResource:@"hydro-bridge" ofType:@"js"];
    if (!path) {
        NSLog(@"[BRIDGE] hydro-bridge.js not found in bundle");
        return;
    }
    NSString *glue = [NSString stringWithContentsOfFile:path
                                               encoding:NSUTF8StringEncoding
                                                  error:nil];
    [self.webView evaluateJavaScript:glue completionHandler:nil];
}

/** WKWebView 内容进程崩溃（需在容器页面把本模块设为 navigationDelegate） */
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    NSLog(@"[BRIDGE] webview content process terminated");
    // TODO: 通过全局事件上报 webview_crash，触发离线包回滚与页面重建
}

- (WKWebView *)resolveWebView {
    // TODO: 按实际 uni-app / HBuilderX 版本从 uniInstance 获取当前页面 WebView
    return nil;
}

- (NSString *)jsStringLiteral:(NSString *)value {
    NSData *data = [NSJSONSerialization dataWithJSONObject:@[value ?: @""] options:0 error:nil];
    NSString *array = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    return array.length >= 2 ? [array substringWithRange:NSMakeRange(1, array.length - 2)] : @"\"\"";
}

@end
