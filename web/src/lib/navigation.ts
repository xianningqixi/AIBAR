/** 桌面与移动端使用相同归属，详情和编辑页也能高亮正确入口。 */
const sections: Record<string, string[]> = {
  browse: ['browse', 'characterDetail', 'chat'],
  create: ['create', 'characterNew', 'characterEdit', 'storyNew', 'storyEdit', 'storyDetail'],
  hub: ['communityHub', 'communityWork', 'publish', 'webApp'],
  library: ['characters', 'worlds', 'mods'],
  account: ['account', 'settings', 'admin'],
}

export function getNavSection(routeName: unknown): string | undefined {
  return Object.keys(sections).find(key => sections[key].includes(String(routeName)))
}
