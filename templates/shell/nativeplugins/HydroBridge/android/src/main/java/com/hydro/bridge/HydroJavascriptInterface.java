package com.hydro.bridge;

import android.webkit.JavascriptInterface;

/**
 * Android 侧 H5 → Native 下行入口。
 *
 * addJavascriptInterface 暴露为 window.__HYDRO_NATIVE__，由注入的
 * hydro-bridge.js 包装成 window.__HYDRO_BRIDGE__.post()。
 */
public class HydroJavascriptInterface {

    public interface MessageSink {
        void onMessage(String message);
    }

    private final MessageSink sink;

    public HydroJavascriptInterface(MessageSink sink) {
        this.sink = sink;
    }

    @JavascriptInterface
    public void postMessage(String message) {
        if (sink != null) {
            sink.onMessage(message);
        }
    }
}
