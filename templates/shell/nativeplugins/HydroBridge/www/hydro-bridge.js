;(function () {
  'use strict'

  if (window.__HYDRO_BRIDGE__) return

  /**
   * H5 → Native 下行通道。
   * Android 由 addJavascriptInterface 注入 __HYDRO_NATIVE__；
   * iOS 走 WKScriptMessageHandler（HydroBridge）。
   */
  function post(message) {
    var text = String(message || '')

    if (window.__HYDRO_NATIVE__ && typeof window.__HYDRO_NATIVE__.postMessage === 'function') {
      window.__HYDRO_NATIVE__.postMessage(text)
      return
    }

    var handlers = window.webkit && window.webkit.messageHandlers
    if (handlers && handlers.HydroBridge) {
      handlers.HydroBridge.postMessage(text)
      return
    }

    console.warn('[HydroBridge] native channel unavailable, message dropped')
  }

  window.__HYDRO_BRIDGE__ = { post: post }

  /**
   * Native → H5 回调入口。
   * 原生侧通过 evaluateJavascript / evaluateJavaScript 调用：
   * window.__bridgeCallback__(id, responseJson)
   */
  if (typeof window.__bridgeCallback__ !== 'function') {
    window.__bridgeCallback__ = function (id, payload) {
      console.log('[HydroBridge] callback without bridge-sdk', id, payload)
    }
  }
})()
