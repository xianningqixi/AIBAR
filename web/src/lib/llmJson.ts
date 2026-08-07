// 从 LLM 输出中提取 JSON 对象的共享助手。
// LLM 常见的三种包装都要容忍：Markdown 围栏、前后散文、以及散文里出现的杂散花括号。
// 做法：剥掉围栏后，从每个 '{' 起点做一次字符串感知的括号平衡扫描，
// 逐个候选尝试 JSON.parse，第一个成功的即为结果；全部失败才抛统一的友好错误。

const MAX_CANDIDATE_STARTS = 8

function stripFence(text: string): string {
  const body = text.trim()
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fence ? fence[1].trim() : body
}

function balancedObjectAt(body: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return body.slice(start, i + 1)
    }
  }
  return null
}

export function parseJsonObject<T>(text: string): T {
  const body = stripFence(String(text || ''))
  let attempts = 0
  for (let start = body.indexOf('{'); start !== -1 && attempts < MAX_CANDIDATE_STARTS; start = body.indexOf('{', start + 1)) {
    attempts += 1
    const candidate = balancedObjectAt(body, start)
    // 该起点不平衡（如截断的外层对象）时，内层对象仍可能是完整候选，继续后移。
    if (candidate === null) continue
    try {
      return JSON.parse(candidate) as T
    } catch {
      // 这个起点不是合法 JSON（例如散文里的杂散花括号），继续尝试下一个起点。
    }
  }
  throw new Error('模型没有返回可解析的 JSON')
}
