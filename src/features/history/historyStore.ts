import type { AnalysisResult, RoastTone } from '@/lib/contracts'

const HISTORY_KEY = 'cockpit-shot-roaster-history'
const HISTORY_LIMIT = 6

export interface AnalysisHistoryEntry {
  id: string
  createdAt: string
  imagePath: string
  previewDataUrl: string
  tone: RoastTone
  accountEmail: string | null
  result: AnalysisResult
}

export function loadHistory(): AnalysisHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as AnalysisHistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

export function saveHistory(entries: AnalysisHistoryEntry[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)))
}
