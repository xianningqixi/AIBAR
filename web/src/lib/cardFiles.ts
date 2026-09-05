// 与后端 /api/characters/import 的 formatImportFunctions 支持集保持一致
// （png/json/yaml/yml/charx/byaf）。Discord 批量发布入口用的是同一集合。
export const CARD_FILE_EXTENSIONS = ['png', 'json', 'yaml', 'yml', 'charx', 'byaf'] as const

export const CARD_FILE_ACCEPT = CARD_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export function cardFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

export function isCardFile(file: { name: string }): boolean {
  return (CARD_FILE_EXTENSIONS as readonly string[]).includes(cardFileExtension(file.name))
}
