// What only the system admin does, and the invited admin's two calls.
// The server checks the role on every call.

import { api } from './client'
import type { Invite, InviteCreated, InstitutionListItem, LoginRule, NewInstitution, PendingRule, SystemInstitution } from './types'

const institution = (slug: string) => `/system/institutions/${encodeURIComponent(slug)}`

export const getAllInstitutions = () => api<SystemInstitution[]>('/system/institutions', { auth: true })
export const createInstitution = (body: NewInstitution) =>
  api<SystemInstitution>('/system/institutions', { method: 'POST', auth: true, body })
export const createInvite = (slug: string) =>
  api<InviteCreated>(`${institution(slug)}/invites`, { method: 'POST', auth: true })
export const getInvites = (slug: string) => api<Invite[]>(`${institution(slug)}/invites`, { auth: true })
export const revokeInvite = (id: number) => api<Invite>(`/system/invites/${id}/revoke`, { method: 'POST', auth: true })

// The token goes in the body, never in an address: addresses end up in logs.
export const inspectInvite = (token: string) =>
  api<InstitutionListItem>('/invites/inspect', { method: 'POST', auth: true, body: { token } })
export const acceptInvite = (token: string) =>
  api<InstitutionListItem>('/invites/accept', { method: 'POST', auth: true, body: { token } })

// Login rules waiting for the system admin. To refuse one, remove it.
export const getPendingRules = () => api<PendingRule[]>('/system/login-rules', { auth: true })
export const approveRule = (id: number) =>
  api<LoginRule>(`/system/login-rules/${id}/approve`, { method: 'POST', auth: true })
// The server refuses an institution in use: open, with a working login
// rule, the demo campus, or the system admin's own.
export const deleteInstitution = (slug: string) =>
  api<void>(institution(slug), { method: 'DELETE', auth: true })
