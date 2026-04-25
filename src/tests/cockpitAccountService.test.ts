// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readCurrentAccountFile } from '../../electron/services/cockpitAccountService'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('readCurrentAccountFile', () => {
  it('reads the selected codex account payload from disk', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cockpit-shot-roaster-'))
    const currentAccountPath = join(tempDir, 'codex_accounts.json')

    await writeFile(
      currentAccountPath,
      '{"version":"1.0","accounts":[{"id":"codex_reader","email":"reader@example.com","last_used":1772010494}],"current_account_id":"codex_reader"}',
      'utf8',
    )

    await expect(readCurrentAccountFile(currentAccountPath)).resolves.toEqual({
      email: 'reader@example.com',
      updatedAt: 1772010494,
    })
  })
})
