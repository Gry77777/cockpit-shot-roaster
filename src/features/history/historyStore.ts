import type { AnalysisResult, RoastTone } from '@/lib/contracts'

const HISTORY_KEY = 'cockpit-shot-roaster-history'
export const HISTORY_LIMIT = 24

export interface AnalysisHistoryEntry {
  id: string
  createdAt: string
  imagePath: string
  previewDataUrl: string
  tone: RoastTone
  accountEmail: string | null
  result: AnalysisResult
  isFavorite?: boolean
}

export function loadHistory(): AnalysisHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as AnalysisHistoryEntry[]
    return Array.isArray(parsed) ? clampHistory(parsed) : []
  } catch {
    return []
  }
}

export function saveHistory(entries: AnalysisHistoryEntry[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(clampHistory(entries)))
}

export function clampHistory(entries: AnalysisHistoryEntry[]) {
  return entries.map(normalizeHistoryEntry).slice(0, HISTORY_LIMIT)
}

function normalizeHistoryEntry(entry: AnalysisHistoryEntry): AnalysisHistoryEntry {
  return {
    ...entry,
    isFavorite: Boolean(entry.isFavorite),
  }
}
