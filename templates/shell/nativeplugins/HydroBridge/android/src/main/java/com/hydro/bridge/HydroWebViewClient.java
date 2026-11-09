package com.hydro.bridge;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.FileInputStream;
import java.io.InputStream;

/**
 * 容器离线包拦截（Android 脚手架）。
 *
 * - shouldOverrideUrlLoading：导航级拦截，命中离线包时加载本地地址；
 * - shouldInterceptRequest：资源级拦截，命中本地文件直接返回，未命中返回 null 走网络。
 *
 * OfflineResolver 由壳侧实现（读取已安装离线包目录 + URL → 本地路径映射）。
 */
public class HydroWebViewClient extends WebViewClient {

    public interface OfflineResolver {
        /** 命中返回本地文件路径 / file:// 地址，未命中返回 null */
        String resolve(String url);
    }

    private final OfflineResolver resolver;

    public HydroWebViewClient(OfflineResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String target = request.getUrl().toString();
        String local = resolver == null ? null : resolver.resolve(target);
        if (local != null) {
            view.loadUrl(local);
            return true;
        }
        return false;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String target = request.getUrl().toString();
        String localPath = resolver == null ? null : resolver.resolve(target);
        if (localPath == null) {
            return null; // 未命中走网络
        }
        try {
            InputStream stream = new FileInputStream(localPath);
            return new WebResourceResponse(guessMimeType(localPath), "UTF-8", stream);
        } catch (Exception e) {
            return null;
        }
    }

    private String guessMimeType(String path) {
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
}
