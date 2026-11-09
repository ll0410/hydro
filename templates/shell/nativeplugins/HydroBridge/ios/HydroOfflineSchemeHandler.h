#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>

/**
 * 离线包自定义协议拦截（iOS 脚手架）。
 *
 * 注册 hydro-offline:// 协议，命中本地离线包时返回文件数据，
 * 未命中时交给网络加载。实际安装目录由 HydroBridgeModule 落盘后注入。
 */
@interface HydroOfflineSchemeHandler : NSObject <WKURLSchemeHandler>

@property (nonatomic, copy) NSString *packageRoot;

@end
