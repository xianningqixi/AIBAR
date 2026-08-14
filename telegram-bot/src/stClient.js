export function normalizeBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8001').trim().replace(/\/+$/, '');
}

export class StClient {
  constructor(baseUrl, credentials = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl || 'http://127.0.0.1:8001');
    this.handle = String(credentials.handle || '').trim();
    this.password = String(credentials.password || '');
    this.csrfToken = '';
    this.cookie = '';
    this.bootPromise = null;
  }

  async boot() {
    if (this.bootPromise) return this.bootPromise;
    const operation = this.performBoot();
    this.bootPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.bootPromise === operation) this.bootPromise = null;
    }
  }

  async performBoot() {
    if (!this.handle) {
      throw new Error('ST_USER_HANDLE 未配置，Telegram Bot 无法登录多用户 AIBAR');
    }
    await this.fetchCsrf();
    await this.login();
    await this.fetchCsrf();
  }

  async fetchCsrf() {
    const response = await fetch(`${this.baseUrl}/csrf-token`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    });
    this.captureCookie(response);
    if (!response.ok) {
      throw new Error(`ST /csrf-token failed (${response.status}): ${await response.text()}`);
    }
    const data = await response.json();
    this.csrfToken = data.token;
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ handle: this.handle, password: this.password }),
    });
    this.captureCookie(response);
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`ST 服务账号登录失败 (${response.status}): ${raw || response.statusText}`);
    }
  }

  async post(url, body = {}, retryCsrf = true) {
    if (!this.csrfToken) await this.boot();
    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrfToken,
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    this.captureCookie(response);
    if (response.status === 403 && retryCsrf) {
      this.csrfToken = '';
      await this.boot();
      return this.post(url, body, false);
    }
    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        message = typeof parsed?.error === 'string'
          ? parsed.error
          : parsed?.error?.message || parsed?.message || raw;
      } catch {
        // Keep the plain-text response.
      }
      throw new Error(message || `ST ${url} failed (${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('json') ? response.json() : response.text();
  }

  captureCookie(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    this.cookie = setCookie
      .split(/,(?=\s*[^;,]+=[^;,]+)/)
      .map((part) => part.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  }
}
