import type { AnalysisResult, RoastTone } from '@/lib/contracts'

const HISTORY_KEY = 'cockpit-shot-roaster-history'
export const HISTORY_LIMIT = 24

export interface AnalysisHistoryEntry {
  id: string
  createdAt: string
  updatedAt?: string
  imagePath: string
  previewDataUrl: string
  tone: RoastTone
  accountEmail: string | null
  result: AnalysisResult
  isFavorite?: boolean
  isArchived?: boolean
  tags?: string[]
  note?: string
  sourceHistoryEntryId?: string
  sourceRootHistoryEntryId?: string
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
    updatedAt: entry.updatedAt ?? entry.createdAt,
    isFavorite: Boolean(entry.isFavorite),
    isArchived: Boolean(entry.isArchived),
    tags: normalizeTags(entry.tags),
    note: entry.note?.trim() ?? '',
    sourceHistoryEntryId: entry.sourceHistoryEntryId?.trim() || undefined,
    sourceRootHistoryEntryId: entry.sourceRootHistoryEntryId?.trim() || entry.sourceHistoryEntryId?.trim() || undefined,
  }
}

function normalizeTags(tags: string[] | undefined) {
  if (!tags) {
    return []
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
    ),
  )
}
