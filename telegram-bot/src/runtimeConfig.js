const ADMIN_TOKEN_PLACEHOLDERS = new Set([
  'replace-with-a-long-random-token',
  'change-me',
  'changeme',
  'your-admin-token',
  'your_admin_token',
  '请填写一段足够长的随机字符串',
]);

export function isUsableAdminToken(value) {
  const token = String(value || '').trim();
  return token.length >= 24 && !ADMIN_TOKEN_PLACEHOLDERS.has(token.toLowerCase());
}

export function pollingReadiness(config) {
  if (!String(config?.token || '').trim()) {
    return { ready: false, message: 'TELEGRAM_BOT_TOKEN 未配置，轮询未启动' };
  }
  if (!String(config?.stUserHandle || '').trim()) {
    return { ready: false, message: 'ST_USER_HANDLE 未配置，轮询未启动' };
  }
  if (!String(config?.stUserPassword || '')) {
    return { ready: false, message: 'ST_USER_PASSWORD 未配置，轮询未启动' };
  }
  if (!(config?.allowedUserIds instanceof Set) || config.allowedUserIds.size === 0) {
    return { ready: false, message: 'TELEGRAM_ALLOWED_USER_IDS 为空，轮询按默认拒绝策略保持关闭' };
  }
  return { ready: true, message: '' };
}
