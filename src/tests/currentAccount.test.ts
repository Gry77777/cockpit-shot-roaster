import { describe, expect, it } from 'vitest'
import { parseCurrentAccount } from '@/lib/cockpit/currentAccount'

describe('parseCurrentAccount', () => {
  it('extracts the currently selected codex account from cockpit account storage', () => {
    const result = parseCurrentAccount(`{
      "version": "1.0",
      "accounts": [
        {
          "id": "codex_a",
          "email": "first@example.com",
          "plan_type": "plus",
          "created_at": 1772000000,
          "last_used": 1772000100
        },
        {
          "id": "codex_b",
          "email": "second@example.com",
          "plan_type": "team",
          "created_at": 1772010000,
          "last_used": 1772010494
        }
      ],
      "current_account_id": "codex_b"
    }`)

    expect(result).toEqual({
      email: 'second@example.com',
      updatedAt: 1772010494,
    })
  })
})
