import { apiPost } from './client'
import type { ModelProfile } from './types'

export interface PointLedgerEntry {
  id: string
  delta: number
  balanceAfter: number
  kind: 'signup_bonus' | 'redemption' | 'generation' | string
  referenceId?: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface PointAccount {
  balance: number
  held: number
  available: number
  updatedAt: string
}

export interface PointAccountDetail extends PointAccount {
  ledger: PointLedgerEntry[]
}

export interface CreditCodeRecord {
  id: string
  label: string
  amount: number
  enabled: boolean
  expiresAt?: string
  redeemedBy?: string
  redeemedAt?: string
  createdAt: string
}

export interface CreatedCreditCode extends CreditCodeRecord {
  code: string
}

export interface AdminPointAccount extends PointAccount {
  handle: string
  name: string
}

export interface AdminPointOverview {
  accounts: AdminPointAccount[]
  cards: CreditCodeRecord[]
}

export async function listSharedModels(): Promise<ModelProfile[]> {
  const result = await apiPost<{ models?: ModelProfile[] }>('/api/aibar/models/list')
  return Array.isArray(result.models) ? result.models : []
}

export function saveSharedModel(profile: ModelProfile): Promise<ModelProfile> {
  return apiPost('/api/aibar/admin/models/save', profile)
}

export function deleteSharedModel(id: string): Promise<unknown> {
  return apiPost('/api/aibar/admin/models/delete', { id })
}

export function getPointAccount(): Promise<PointAccountDetail> {
  return apiPost('/api/aibar/points/me')
}

export function redeemCreditCode(code: string): Promise<PointAccount> {
  return apiPost('/api/aibar/points/redeem', { code })
}

export function createCreditCodes(input: {
  amount: number
  count: number
  label?: string
  expiresAt?: string
}): Promise<{ cards: CreatedCreditCode[] }> {
  return apiPost('/api/aibar/admin/points/codes/create', input)
}

export function toggleCreditCode(id: string, enabled: boolean): Promise<unknown> {
  return apiPost('/api/aibar/admin/points/codes/toggle', { id, enabled })
}

export function getAdminPointOverview(): Promise<AdminPointOverview> {
  return apiPost('/api/aibar/admin/points/overview')
}
