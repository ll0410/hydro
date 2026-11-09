#import "HydroOfflineSchemeHandler.h"

@implementation HydroOfflineSchemeHandler

- (void)webView:(WKWebView *)webView
    startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    NSURL *url = urlSchemeTask.request.URL;
    if (!url || !self.packageRoot) {
        [urlSchemeTask didFailWithError:[NSError errorWithDomain:@"HydroOffline"
                                                            code:-1
                                                        userInfo:nil]];
        return;
    }

    NSString *relativePath = url.path ?: @"/index.html";
    NSString *filePath = [self.packageRoot stringByAppendingPathComponent:relativePath];
    NSData *data = [NSData dataWithContentsOfFile:filePath];
    if (!data) {
        [urlSchemeTask didFailWithError:[NSError errorWithDomain:@"HydroOffline"
                                                            code:-2
                                                        userInfo:nil]];
        return;
    }

    NSURLResponse *response = [[NSURLResponse alloc] initWithURL:url
                                                        MIMEType:[self mimeTypeForPath:filePath]
                                           expectedContentLength:(NSInteger)data.length
                                                textEncodingName:@"utf-8"];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:data];
    [urlSchemeTask didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    // 无异步任务，无需取消
}

- (NSString *)mimeTypeForPath:(NSString *)path {
    if ([path hasSuffix:@".js"]) return @"application/javascript";
    if ([path hasSuffix:@".css"]) return @"text/css";
    if ([path hasSuffix:@".html"]) return @"text/html";
    if ([path hasSuffix:@".json"]) return @"application/json";
    if ([path hasSuffix:@".png"]) return @"image/png";
    if ([path hasSuffix:@".svg"]) return @"image/svg+xml";
    return @"application/octet-stream";
}

@end
