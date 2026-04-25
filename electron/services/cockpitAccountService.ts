import { watch } from 'fs'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
import type { CockpitAccountState } from '@/lib/contracts'
import { parseCurrentAccount } from '@/lib/cockpit/currentAccount'

export const DEFAULT_CURRENT_ACCOUNT_PATH = join(homedir(), '.antigravity_cockpit', 'codex_accounts.json')

export async function readCurrentAccountFile(
  currentAccountPath = DEFAULT_CURRENT_ACCOUNT_PATH,
): Promise<CockpitAccountState | null> {
  try {
    const raw = await readFile(currentAccountPath, 'utf8')
    return parseCurrentAccount(raw)
  } catch {
    return null
  }
}

export function watchCurrentAccountFile(
  onChange: (value: CockpitAccountState | null) => void,
  currentAccountPath = DEFAULT_CURRENT_ACCOUNT_PATH,
) {
  const directory = dirname(currentAccountPath)
  const targetName = basename(currentAccountPath)

  void readCurrentAccountFile(currentAccountPath).then(onChange)

  try {
    const watcher = watch(directory, (_eventType: string, filename: string | Buffer | null) => {
      if (filename && filename.toString() !== targetName) {
        return
      }

      void readCurrentAccountFile(currentAccountPath).then(onChange)
    })

    return () => {
      watcher.close()
    }
  } catch {
    return () => undefined
  }
}
