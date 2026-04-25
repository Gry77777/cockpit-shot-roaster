import type { CockpitAccountState } from '@/lib/contracts'

interface CockpitAccountPayload {
  email?: unknown
  updated_at?: unknown
  accounts?: Array<{
    id?: unknown
    email?: unknown
    last_used?: unknown
  }>
  current_account_id?: unknown
}

export function parseCurrentAccount(raw: string): CockpitAccountState | null {
  const payload = JSON.parse(raw) as CockpitAccountPayload

  if (Array.isArray(payload.accounts) && typeof payload.current_account_id === 'string') {
    const activeAccount = payload.accounts.find((account) => account.id === payload.current_account_id)

    if (!activeAccount || typeof activeAccount.email !== 'string' || activeAccount.email.trim() === '') {
      return null
    }

    return {
      email: activeAccount.email,
      updatedAt: typeof activeAccount.last_used === 'number' ? activeAccount.last_used : undefined,
    }
  }

  if (typeof payload.email !== 'string' || payload.email.trim() === '') {
    return null
  }

  return {
    email: payload.email,
    updatedAt: typeof payload.updated_at === 'number' ? payload.updated_at : undefined,
  }
}
