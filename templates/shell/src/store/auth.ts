/** 登录态：token 存原生安全存储（plus.storage / Keychain 封装），H5 调试用 localStorage。 */

const TOKEN_KEY = 'hydro.auth.token'

function readNative(): string | null {
  // #ifdef APP-PLUS
  try {
    return plus.storage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
  // #endif
  // #ifndef APP-PLUS
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
  // #endif
}

function writeNative(token: string | null): void {
  // #ifdef APP-PLUS
  if (token) plus.storage.setItem(TOKEN_KEY, token)
  else plus.storage.removeItem(TOKEN_KEY)
  // #endif
  // #ifndef APP-PLUS
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
  // #endif
}

export class AuthStore {
  getToken(): string | null {
    return readNative()
  }

  /** 原生登录页完成后写入 token；真实项目在此接入 SSO SDK */
  async login(account: string): Promise<string> {
    const token = `native-token-${account}-${Date.now()}`
    writeNative(token)
    return token
  }

  setToken(token: string): void {
    writeNative(token)
  }

  logout(): void {
    writeNative(null)
  }
}

export const authStore = new AuthStore()
