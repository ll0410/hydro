package com.hydro.bridge;

import android.util.Log;
import android.webkit.WebView;

import com.alibaba.fastjson.JSONObject;

import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;

/**
 * HydroBridge uni-app 原生插件模块（Android）。
 *
 * 职责：
 * 1. 向容器 WebView 注入 window.__HYDRO_NATIVE__ 与 hydro-bridge.js；
 * 2. 接收 H5 下行报文，转交壳 JS 侧 dispatcher；
 * 3. 通过 evaluateJavascript 调用 window.__bridgeCallback__(id, data) 回传结果。
 *
 * 注意：本文件是脚手架实现，接入 HBuilderX 自定义基座后需按实际
 * UniModule / WebView 获取方式联调（见 docs/development-guide.md 阶段 03）。
 */
public class HydroBridgeModule extends UniModule {

    private static final String TAG = "HydroBridge";
    private static final String JS_GLUE = "hydro-bridge.js";

    private WebView webView;

    /** 绑定当前页面 WebView 并注入通道 */
    @UniJSMethod(uiThread = true)
    public void attach(final UniJSCallback callback) {
        webView = resolveWebView();
        if (webView == null) {
            JSONObject error = new JSONObject();
            error.put("ok", false);
            error.put("msg", "webview unavailable");
            callback.invoke(error);
            return;
        }

        webView.getSettings().setJavaScriptEnabled(true);
        webView.addJavascriptInterface(new HydroJavascriptInterface(new HydroJavascriptInterface.MessageSink() {
            @Override
            public void onMessage(String message) {
                handleH5Message(message);
            }
        }), "__HYDRO_NATIVE__");

        injectGlue();

        JSONObject result = new JSONObject();
        result.put("ok", true);
        callback.invoke(result);
    }

    /** WebView 预热：真实实现按池大小创建隐藏实例 */
    @UniJSMethod(uiThread = true)
    public void preload(JSONObject options) {
        Log.i(TAG, "[BRIDGE] preload " + (options == null ? 0 : options.getIntValue("count")));
    }

    /** 归还池实例 */
    @UniJSMethod(uiThread = true)
    public void release(String id) {
        Log.i(TAG, "[BRIDGE] release " + id);
    }

    /** 原生 → H5 回调 */
    @UniJSMethod(uiThread = true)
    public void sendCallback(String id, String payloadJson) {
        if (webView == null) {
            Log.w(TAG, "[BRIDGE] sendCallback before attach, id=" + id);
            return;
        }
        String script = "window.__bridgeCallback__ && window.__bridgeCallback__("
                + JSONObject.toJSONString(id) + ","
                + JSONObject.toJSONString(payloadJson) + ")";
        webView.evaluateJavascript(script, null);
        Log.i(TAG, "[BRIDGE] res id=" + id);
    }

    private void handleH5Message(String message) {
        Log.i(TAG, "[BRIDGE] req " + message);
        // 将报文转给壳 JS 侧 dispatcher；真实项目通过全局事件 / uni 事件总线传递
        if (mUniSDKInstance != null) {
            JSONObject params = new JSONObject();
            params.put("message", message);
            mUniSDKInstance.fireGlobalEventCallback("hydroBridgeMessage", params);
        }
    }

    private void injectGlue() {
        try {
            java.io.InputStream input = mUniSDKInstance.getContext().getAssets().open(JS_GLUE);
            byte[] buffer = new byte[input.available()];
            //noinspection ResultOfMethodCallIgnored
            input.read(buffer);
            input.close();
            webView.evaluateJavascript(new String(buffer, "UTF-8"), null);
            Log.i(TAG, "[BRIDGE] glue injected");
        } catch (Exception e) {
            Log.e(TAG, "[BRIDGE] inject glue failed", e);
        }
    }

    private WebView resolveWebView() {
        try {
            Object view = mUniSDKInstance.getClass().getMethod("getWebView").invoke(mUniSDKInstance);
            return view instanceof WebView ? (WebView) view : null;
        } catch (Exception e) {
            Log.w(TAG, "[BRIDGE] resolve webview failed", e);
            return null;
        }
    }
}
