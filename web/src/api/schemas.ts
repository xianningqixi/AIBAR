import { z } from 'zod'
import type { ModelProfile } from './types'

// 只在高价值边界（设置、共享模型）做运行时校验：这些响应直接驱动持久化与计费 UI，
// 后端字段变更如果静默产生 undefined，会以更隐蔽的方式在下游炸开。
// 其余接口仍走类型断言，避免为 97 个 api 函数维护双份 schema。

export const aibarSettingsSchema = z.record(z.string(), z.unknown())

export const modelProfileSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  model: z.string(),
  endpoint: z.string().optional(),
  secretId: z.string().optional(),
  apiKeySaved: z.boolean().optional(),
  canManageCredentials: z.boolean().optional(),
  temperature: z.number(),
  maxTokens: z.number(),
  topP: z.number(),
  presencePenalty: z.number(),
  frequencyPenalty: z.number(),
  inputPrice: z.number().optional(),
  outputPrice: z.number().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
  updatedAt: z.string().optional(),
})

export const sharedModelListSchema = z.object({
  models: z.array(modelProfileSchema).default([]),
  supportedSources: z.array(z.string()).default([]),
})

// 编译期保证 schema 与手写 interface 不漂移：zod 推断结果必须可赋值给 ModelProfile。
const _modelProfileCompatibility: ModelProfile = null as unknown as z.infer<typeof modelProfileSchema>
void _modelProfileCompatibility

/**
 * 校验失败时抛出带中文提示的错误（附字段路径便于排查），而不是让 undefined 静默下渗。
 */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    console.error(`AIBAR 响应校验失败 (${label}):`, result.error.issues)
    throw new Error(`${label}返回了意外的数据格式（${detail}）`)
  }
  return result.data
}
