import { apiGet, apiPost } from './client'

export interface SessionUser {
  handle: string
  name: string
  avatar: string
  admin: boolean
  password: boolean
  created: number
}

export interface RegistrationRequest {
  id: string
  handle: string
  name: string
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string
  createdAt: string
  reviewedAt?: string
}

export interface AdminInvite {
  id: string
  code?: string
  label: string
  createdBy?: string
  maxUses: number
  useCount: number
  expiresAt?: string
  enabled: boolean
  createdAt: string
}

export interface AdminUser {
  handle: string
  name: string
  admin: boolean
  enabled: boolean
  createdAt: number
}

export interface AdminOverview {
  registrations: RegistrationRequest[]
  invites: AdminInvite[]
  users: AdminUser[]
}

export function getCurrentUser(): Promise<SessionUser> {
  return apiGet<SessionUser>('/api/users/me')
}

export function loginUser(handle: string, password: string): Promise<{ handle: string }> {
  return apiPost('/api/users/login', { handle, password })
}

export function logoutUser(): Promise<unknown> {
  return apiPost('/api/users/logout')
}

export function changePassword(
  handle: string,
  oldPassword: string,
  newPassword: string,
): Promise<unknown> {
  return apiPost('/api/users/change-password', { handle, oldPassword, newPassword })
}

export function registerUser(input: {
  inviteCode: string
  handle: string
  name: string
  password: string
}): Promise<RegistrationRequest> {
  return apiPost('/api/aibar/public/register', input)
}

export function getRegistrationStatus(id: string): Promise<RegistrationRequest> {
  return apiPost('/api/aibar/public/registration-status', { id })
}

export function getAdminOverview(): Promise<AdminOverview> {
  return apiPost('/api/aibar/admin/overview')
}

export function createInvite(input: {
  label: string
  maxUses: number
  expiresAt?: string
}): Promise<AdminInvite> {
  return apiPost('/api/aibar/admin/invites/create', input)
}

export function toggleInvite(id: string, enabled: boolean): Promise<unknown> {
  return apiPost('/api/aibar/admin/invites/toggle', { id, enabled })
}

export function reviewRegistration(
  id: string,
  action: 'approve' | 'reject',
  reviewNote = '',
): Promise<RegistrationRequest> {
  return apiPost('/api/aibar/admin/registrations/review', { id, action, reviewNote })
}

export function setUserEnabled(handle: string, enabled: boolean): Promise<unknown> {
  return apiPost(`/api/users/${enabled ? 'enable' : 'disable'}`, { handle })
}
