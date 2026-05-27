import { apiPost } from './client'
import type { SecretStateMap } from './types'

export async function readSecretState(): Promise<SecretStateMap> {
  return apiPost<SecretStateMap>('/api/secrets/read')
}

export async function findSecret(key: string, id?: string): Promise<string> {
  const result = await apiPost<{ value?: string }>('/api/secrets/find', { key, id })
  return result.value || ''
}

export async function writeSecret(key: string, value: string, label?: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>('/api/secrets/write', { key, value, label })
}

export async function deleteSecret(key: string, id?: string): Promise<unknown> {
  return apiPost('/api/secrets/delete', { key, id })
}

export async function rotateSecret(key: string, id: string): Promise<unknown> {
  return apiPost('/api/secrets/rotate', { key, id })
}
