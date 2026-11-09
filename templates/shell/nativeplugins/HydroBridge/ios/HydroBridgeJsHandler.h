#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>

@class HydroBridgeModule;

@interface HydroBridgeJsHandler : NSObject <WKScriptMessageHandler>

- (instancetype)initWithWebView:(WKWebView *)webView module:(HydroBridgeModule *)module;

@end
