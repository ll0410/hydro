#import "HydroBridgeJsHandler.h"
#import "HydroBridgeModule.h"

@interface HydroBridgeJsHandler ()
@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic, weak) HydroBridgeModule *module;
@end

@implementation HydroBridgeJsHandler

- (instancetype)initWithWebView:(WKWebView *)webView module:(HydroBridgeModule *)module {
    self = [super init];
    if (self) {
        _webView = webView;
        _module = module;
    }
    return self;
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"HydroBridge"]) return;
    if (![message.body isKindOfClass:[NSString class]]) return;
    [self.module handleH5Message:(NSString *)message.body];
}

@end
