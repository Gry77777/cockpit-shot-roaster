import type { DragEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { loadHistory, saveHistory, type AnalysisHistoryEntry } from './features/history/historyStore'
import { renderShareCardPngDataUrl } from './features/shareCard/renderShareCard'
import {
  dismissOnboardingPreference,
  hasDismissedOnboarding,
  loadAppSettings,
  resetOnboardingPreference,
  saveAppSettings,
  type AppSettings,
} from './lib/appSettings'
import type {
  AnalysisResult,
  CockpitAccountState,
  PickedScreenshot,
  RoastTone,
  RewriteMode,
} from './lib/contracts'
import { getErrorGuidance } from './lib/errorGuidance'
import {
  buildShareCardFileName,
  buildShareCardSvg,
  getShareCardCanvasSize,
  shareCardTemplateOptions,
  type ShareCardTemplate,
} from './lib/shareCard/shareCard'

const toneOptions: Array<{ label: string; value: RoastTone; description: string }> = [
  { label: '毒舌', value: 'roast', description: '更冲一点，适合把截图里的情绪值直接拉满。' },
  { label: '温柔', value: 'gentle', description: '轻一点，更像朋友在旁边帮你补一句。' },
  { label: '打工人', value: 'work', description: '像复盘会发言，但保留一点幽默感。' },
]

const rewriteActions: Array<{ label: string; value: RewriteMode; description: string }> = [
  { label: '更毒一点', value: 'spicier', description: '把梗味再往上推一档。' },
  { label: '更短一点', value: 'shorter', description: '压成更利落的短句。' },
  { label: '标题党一点', value: 'headline', description: '让标题更像能直接发出去。' },
]

const supportedImagePattern = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
const globalClipboardShortcutLabel = 'Ctrl + Shift + V'

type DroppedImageFile = File & { path?: string }

function App() {
  const initialSettings = loadAppSettings()

  const [account, setAccount] = useState<CockpitAccountState | null>(null)
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [draftSettings, setDraftSettings] = useState<AppSettings>(initialSettings)
  const [selectedShot, setSelectedShot] = useState<PickedScreenshot | null>(null)
  const [tone, setTone] = useState<RoastTone>(initialSettings.defaultTone)
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [resultVersions, setResultVersions] = useState<AnalysisResult[]>([])
  const [shareCardTemplate, setShareCardTemplate] = useState<ShareCardTemplate>('wide')
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>(() => loadHistory())
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyToneFilter, setHistoryToneFilter] = useState<'all' | RoastTone>('all')
  const [historyAccountFilter, setHistoryAccountFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRewriting, setIsRewriting] = useState<RewriteMode | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !hasDismissedOnboarding())
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null)

  const selectedToneMeta = toneOptions.find((item) => item.value === tone) ?? toneOptions[0]
  const activeEmail = account?.email ?? '正在读取 Codex 账号...'
  const stageStatus = !selectedShot ? '待选图' : result ? '可导出' : isAnalyzing ? '分析中' : '待分析'
  const errorGuidance = getErrorGuidance(error)
  const activeTemplateMeta = shareCardTemplateOptions.find((item) => item.value === shareCardTemplate) ?? shareCardTemplateOptions[0]
  const historyQueryNormalized = historyQuery.trim().toLowerCase()
  const historyAccountOptions = Array.from(new Set(history.map((entry) => entry.accountEmail ?? '未知账号')))
  const filteredHistory = history.filter((entry) => {
    if (historyToneFilter !== 'all' && entry.tone !== historyToneFilter) {
      return false
    }

    const accountLabel = entry.accountEmail ?? '未知账号'
    if (historyAccountFilter !== 'all' && accountLabel !== historyAccountFilter) {
      return false
    }

    if (!historyQueryNormalized) {
      return true
    }

    const haystack = [accountLabel, entry.imagePath, entry.result.roast, entry.result.summary, ...entry.result.titles]
      .join(' ')
      .toLowerCase()

    return haystack.includes(historyQueryNormalized)
  })
  const canResetHistoryFilters =
    historyQuery.length > 0 || historyToneFilter !== 'all' || historyAccountFilter !== 'all'

  useEffect(() => {
    let mounted = true

    void window.cockpitShot.getCurrentAccount().then((value) => {
      if (mounted) {
        setAccount(value)
      }
    })

    const unsubscribe = window.cockpitShot.onCurrentAccountChange((value) => {
      setAccount(value)
      setToast('Codex 账号已切换，桌面应用也已经同步。')
    })

    const unsubscribeClipboardImported = window.cockpitShot.onClipboardImageImported((picked) => {
      void applyPickedShot(picked, '截图已从全局剪贴板导入。')
    })

    const unsubscribeClipboardFailed = window.cockpitShot.onClipboardImportFailed((message) => {
      setToast(message)
    })

    return () => {
      mounted = false
      unsubscribe()
      unsubscribeClipboardImported()
      unsubscribeClipboardFailed()
    }
  }, [])

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    saveAppSettings(settings)
  }, [settings])

  useEffect(() => {
    void window.cockpitShot
      .applyDesktopPreferences({
        enableGlobalClipboardShortcut: settings.enableGlobalClipboardShortcut,
        enableTrayIcon: settings.enableTrayIcon,
      })
      .catch(() => undefined)
  }, [settings.enableGlobalClipboardShortcut, settings.enableTrayIcon])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (isSettingsOpen) {
      setDraftSettings(settings)
    }
  }, [isSettingsOpen, settings])

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const pastedFile = extractImageFromTransfer(event.clipboardData)
      if (!pastedFile) {
        return
      }

      event.preventDefault()

      try {
        const picked = await readDroppedImage(pastedFile)
        await applyPickedShot(picked, '截图已从剪贴板进入舞台。')
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : '读取剪贴板图片失败。')
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [settings.autoAnalyzeAfterImport, tone, account?.email, apiKey, result])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !event.ctrlKey) {
        return
      }

      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) {
          return
        }
      }

      if (!selectedShot || isAnalyzing || Boolean(isRewriting)) {
        return
      }

      event.preventDefault()
      void runAnalysis()
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [selectedShot, isAnalyzing, isRewriting, tone, account?.email, apiKey, result])

  async function applyPickedShot(picked: PickedScreenshot, message: string) {
    setSelectedShot(picked)
    setResult(null)
    setResultVersions([])
    setError(null)

    if (settings.autoAnalyzeAfterImport) {
      setToast('截图已导入，正在自动分析。')
      await runAnalysis(picked)
      return
    }

    setToast(message)
  }

  async function handlePickScreenshot() {
    const picked = await window.cockpitShot.pickScreenshot()
    if (!picked) {
      return
    }

    await applyPickedShot(picked, '截图已就位，可以直接开始分析。')
  }

  async function handleImportClipboardImage() {
    try {
      const picked = await window.cockpitShot.importClipboardImage()
      if (!picked) {
        setToast('剪贴板里还没有可用图片。先截一张图，再导入。')
        return
      }

      await applyPickedShot(picked, '截图已从剪贴板导入。')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '读取剪贴板图片失败。')
    }
  }

  async function runAnalysis(targetShot = selectedShot, rewriteMode?: RewriteMode) {
    if (!targetShot) {
      setError('请先放一张截图进来。')
      return
    }

    try {
      setIsAnalyzing(!rewriteMode)
      setIsRewriting(rewriteMode ?? null)
      setError(null)

      const nextResult = await window.cockpitShot.analyzeScreenshot({
        imagePath: targetShot.path,
        tone,
        activeEmail: account?.email ?? null,
        apiKey: apiKey.trim() || undefined,
        rewriteMode,
        previousResult: rewriteMode ? result : undefined,
      })

      const nextEntry: AnalysisHistoryEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        imagePath: targetShot.path,
        previewDataUrl: targetShot.previewDataUrl,
        tone,
        accountEmail: account?.email ?? null,
        result: nextResult,
      }

      setResult(nextResult)
      setResultVersions((current) => (rewriteMode ? [...current, nextResult] : [nextResult]))
      setHistory((current) => [nextEntry, ...current].slice(0, 6))
      setToast(rewriteMode ? '这一版已经重写好了。' : '结果已生成，可以直接复制或导出。')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '截图分析失败。')
    } finally {
      setIsAnalyzing(false)
      setIsRewriting(null)
    }
  }

  async function buildShareCardPngDataUrl() {
    if (!selectedShot || !result) {
      throw new Error('请先生成一条结果。')
    }

    const svg = buildShareCardSvg(
      {
        previewDataUrl: selectedShot.previewDataUrl,
        toneLabel: selectedToneMeta.label,
        accountEmail: account?.email ?? null,
        roast: result.roast,
        summary: result.summary,
        titles: result.titles,
      },
      shareCardTemplate,
    )

    const canvasSize = getShareCardCanvasSize(shareCardTemplate)
    return renderShareCardPngDataUrl(svg, canvasSize.width, canvasSize.height)
  }

  async function handleExportShareCard() {
    if (!selectedShot || !result) {
      setError('请先生成一条结果，再导出分享卡。')
      return
    }

    try {
      setIsExporting(true)
      setError(null)

      const pngDataUrl = await buildShareCardPngDataUrl()
      const savedPath = await window.cockpitShot.saveShareCard(pngDataUrl, buildShareCardFileName(shareCardTemplate))

      if (savedPath) {
        setToast(`分享卡已导出到 ${savedPath}`)
      } else {
        setToast('已取消导出。')
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '导出分享卡失败。')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleCopyShareCard() {
    if (!selectedShot || !result) {
      setError('请先生成一条结果，再复制分享卡。')
      return
    }

    try {
      setIsExporting(true)
      setError(null)

      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('当前环境不支持直接复制图片。')
      }

      const pngDataUrl = await buildShareCardPngDataUrl()
      const blob = dataUrlToBlob(pngDataUrl)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setToast(`分享卡已复制到剪贴板（${activeTemplateMeta.label}）`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '复制分享卡失败。')
    } finally {
      setIsExporting(false)
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault()

    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    setIsDragActive(false)
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(false)

    const droppedFile = extractImageFromTransfer(event.dataTransfer)
    if (!droppedFile) {
      setError('这里暂时只支持拖入图片文件。')
      return
    }

    try {
      const picked = await readDroppedImage(droppedFile)
      await applyPickedShot(picked, '截图已进入舞台，可以开始分析。')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '读取拖入图片失败。')
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    setToast(`${label}已复制`)
  }

  function copyAllResult() {
    if (!result) {
      return
    }

    const bundle = [`一句吐槽`, result.roast, '', '正经总结', result.summary, '', '分享标题', ...result.titles.map((title, index) => `${index + 1}. ${title}`)].join('\n')
    void copyText(bundle, '结果汇总')
  }

  function loadHistoryEntry(entry: AnalysisHistoryEntry) {
    setSelectedShot({
      path: entry.imagePath,
      previewDataUrl: entry.previewDataUrl,
    })
    setTone(entry.tone)
    setResult(entry.result)
    setResultVersions([entry.result])
    setError(null)
    setToast('已放回当前舞台。')
  }

  function resetHistoryFilters() {
    setHistoryQuery('')
    setHistoryToneFilter('all')
    setHistoryAccountFilter('all')
  }

  function restorePreviousVersion() {
    setResultVersions((current) => {
      if (current.length <= 1) {
        return current
      }

      const nextVersions = current.slice(0, -1)
      setResult(nextVersions[nextVersions.length - 1] ?? null)
      setToast('已回到上一版结果。')
      return nextVersions
    })
  }

  function dismissOnboarding() {
    dismissOnboardingPreference()
    setShowOnboarding(false)
  }

  function replayOnboarding() {
    resetOnboardingPreference()
    setShowOnboarding(true)
    setIsSettingsOpen(false)
  }

  function saveSettings() {
    setSettings(draftSettings)
    setTone(draftSettings.defaultTone)
    setIsSettingsOpen(false)
    setToast('偏好设置已保存。')
  }

  function handleGuidanceAction(action: 'retry' | 'focus-api' | undefined) {
    if (!action) {
      return
    }

    if (action === 'retry') {
      void runAnalysis()
      return
    }

    apiKeyInputRef.current?.focus()
  }

  const canStartAnalysis = Boolean(selectedShot) && !isAnalyzing && !isRewriting
  const canExport = Boolean(selectedShot && result) && !isExporting

  return (
    <main className="shell">
      <header className="app-bar">
        <div>
          <p className="eyebrow">Cockpit-linked Desktop Tool</p>
          <h1>截图吐槽机</h1>
        </div>
        <div className="head-cluster">
          <span className="badge subtle-badge">只读监听 Codex 账号</span>
          <button className="secondary-button" onClick={() => setIsSettingsOpen(true)} type="button">
            偏好设置
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Ready to Roast</p>
          <h2 className="hero-headline">把截图变成一段能直接发出去的结果</h2>
          <p className="supporting-text">
            这不是一个只会跑一遍结果的原型页。现在它已经能拖图、粘贴、二次改写、导出分享卡，还会跟随你当前的 Codex 账号同步显示。
          </p>
          <div className="hero-highlights">
            <article className="stat-card">
              <span>当前账号</span>
              <strong>{activeEmail}</strong>
            </article>
            <article className="stat-card">
              <span>舞台状态</span>
              <strong>{stageStatus}</strong>
            </article>
          </div>
        </div>
        <div className="hero-stats">
          <article className="info-card">
            <p className="panel-kicker">本地联动</p>
            <strong>账号切换会自动同步</strong>
            <p>{formatAccountSyncText(account)}</p>
          </article>
          <article className="info-card">
            <p className="panel-kicker">这版新增</p>
            <strong>全局导入 + 系统托盘 + 单实例唤醒</strong>
            <p>现在窗口没在前台也能用快捷键导入剪贴板，系统托盘能直接拉起主窗口，重复打开应用也只会唤醒当前这一份。</p>
          </article>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">工作区</p>
            <h2>第一版已经能跑，但这版开始更像一个真软件了</h2>
          </div>
          <span className="badge subtle-badge">全局导入 + 托盘入口</span>
        </div>

        <div className="workspace-grid">
          <article className="preview-stage spotlight-card">
            <div className="panel-topline">
              <div>
                <p className="panel-kicker">截图</p>
                <h3>{selectedShot ? '截图已选中' : '拖一张截图进来'}</h3>
              </div>
              <div className="panel-actions">
                <button className="secondary-button" onClick={() => void handleImportClipboardImage()} type="button">
                  导入剪贴板
                </button>
                <button className="secondary-button" onClick={() => void handlePickScreenshot()} type="button">
                  {selectedShot ? '换一张图' : '选择截图'}
                </button>
              </div>
            </div>

            <button
              aria-label="截图拖放区"
              className={`preview-frame ${isDragActive ? 'drag-active' : ''}`}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={(event) => void handleDrop(event)}
              type="button"
            >
              {selectedShot ? (
                <div className="preview-frame">
                  <img alt="当前截图预览" className="shot-preview" src={selectedShot.previewDataUrl} />
                </div>
              ) : (
                <div className="empty-spotlight">
                  <strong>拖图、点按钮，或者直接 Ctrl + V</strong>
                  <p>支持 PNG / JPG / WEBP / GIF / BMP / SVG，也支持全局快捷键 {globalClipboardShortcutLabel}。</p>
                </div>
              )}
            </button>

            {selectedShot ? <p className="supporting-text path-text">{selectedShot.path}</p> : null}
          </article>

          <aside className="control-card control-rail">
            <div className="panel-topline">
              <div>
                <p className="panel-kicker">控制台</p>
                <h3>开始吐槽</h3>
              </div>
              <span className="meta-pill">{selectedToneMeta.label}</span>
            </div>

            <label className="field" htmlFor="tone-select">
              <span>语气</span>
              <select id="tone-select" value={tone} onChange={(event) => setTone(event.target.value as RoastTone)}>
                {toneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>{selectedToneMeta.description}</small>
            </label>

            <label className="field" htmlFor="api-key-input">
              <span>OpenAI API Key</span>
              <input
                id="api-key-input"
                placeholder="可留空；如果系统里已经设置 OPENAI_API_KEY"
                ref={apiKeyInputRef}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <small>这里只影响这个应用，不会写回 Cockpit，也不会改它的账号配置。</small>
            </label>

            <div className="action-stack">
              <button
                className="primary-button"
                disabled={!canStartAnalysis}
                onClick={() => void runAnalysis()}
                type="button"
              >
                {isAnalyzing ? '分析中...' : '开始分析'}
              </button>
              <span className="shortcut-hint">Ctrl + Enter 也可以直接开始</span>
            </div>

            <div className="sharecard-toolbar">
              <div>
                <p className="field-label">分享卡模板</p>
                <div className="sharecard-templates">
                  {shareCardTemplateOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`ghost-chip ${shareCardTemplate === option.value ? 'active' : ''}`}
                      onClick={() => setShareCardTemplate(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="supporting-text">{activeTemplateMeta.description}</p>
              </div>

              <div className="rewrite-actions">
                <button className="ghost-chip" disabled={!result} onClick={copyAllResult} type="button">
                  复制结果汇总
                </button>
                <button className="ghost-chip" disabled={!canExport} onClick={() => void handleCopyShareCard()} type="button">
                  {isExporting ? '处理中...' : '复制分享卡'}
                </button>
                <button className="ghost-chip" disabled={!canExport} onClick={() => void handleExportShareCard()} type="button">
                  {isExporting ? '导出中...' : '导出分享卡'}
                </button>
              </div>
            </div>

            {error ? (
              <div className="error-card" role="alert">
                <strong>{errorGuidance?.title ?? '这次没有跑通。'}</strong>
                <p>{errorGuidance?.detail ?? error}</p>
                <div className="error-actions">
                  {errorGuidance?.primaryAction && errorGuidance.primaryLabel ? (
                    <button
                      className="primary-button small"
                      onClick={() => handleGuidanceAction(errorGuidance.primaryAction)}
                      type="button"
                    >
                      {errorGuidance.primaryLabel}
                    </button>
                  ) : null}

                  {errorGuidance?.secondaryAction && errorGuidance.secondaryLabel ? (
                    <button
                      className="ghost-link"
                      onClick={() => handleGuidanceAction(errorGuidance.secondaryAction)}
                      type="button"
                    >
                      {errorGuidance.secondaryLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="results-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">输出结果</p>
            <h2>这次不是只给一条文案，而是给你一整套可消费结果</h2>
          </div>
          <span className="badge subtle-badge">基于账号：{activeEmail}</span>
        </div>

        {result ? (
          <>
            <div className="rewrite-strip">
              <span className="rewrite-label">继续打磨这条结果</span>
              <div className="rewrite-actions">
                {rewriteActions.map((action) => (
                  <button
                    key={action.value}
                    className={`ghost-chip rewrite-button ${isRewriting === action.value ? 'busy' : ''}`}
                    disabled={Boolean(isRewriting)}
                    onClick={() => void runAnalysis(selectedShot, action.value)}
                    title={action.description}
                    type="button"
                  >
                    {isRewriting === action.value ? '重写中...' : action.label}
                  </button>
                ))}

                {resultVersions.length > 1 ? (
                  <button className="ghost-chip" onClick={restorePreviousVersion} type="button">
                    回到上一版
                  </button>
                ) : null}
              </div>
            </div>

            <div className="results-showcase">
              <article className="spotlight-card hero-result-card">
                <div className="result-topline">
                  <p className="panel-kicker">一句吐槽</p>
                  <button className="copy-link" onClick={() => void copyText(result.roast, '一句吐槽')} type="button">
                    复制
                  </button>
                </div>
                <p className="hero-result-text">{result.roast}</p>
              </article>

              <div className="result-side-stack">
                <article className="spotlight-card result-card spotlight-result">
                  <div className="result-topline">
                    <p className="panel-kicker">正经总结</p>
                    <button className="copy-link" onClick={() => void copyText(result.summary, '正经总结')} type="button">
                      复制
                    </button>
                  </div>
                  <p>{result.summary}</p>
                </article>

                <article className="spotlight-card result-card">
                  <div className="result-topline">
                    <p className="panel-kicker">分享标题</p>
                    <button className="copy-link" onClick={() => void copyText(result.titles.join('\n'), '分享标题')} type="button">
                      复制
                    </button>
                  </div>
                  <ol className="title-list">
                    {result.titles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ol>
                </article>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state wide richer">
            <p>这里会自动整理出一句吐槽、一段总结和三个标题。出结果后还能继续点“更毒一点”“更短一点”这类二次改写。</p>
          </div>
        )}
      </section>

      <section className="history-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">最近记录</p>
            <h2>本地保留最近 24 条，方便你按语气、账号和关键词回看素材</h2>
          </div>
          <span className="badge subtle-badge">显示 {filteredHistory.length} / {history.length}</span>
        </div>

        {history.length > 0 ? (
          <>
            <div className="history-toolbar">
              <input
                aria-label="搜索历史记录"
                className="history-search"
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="搜吐槽、标题、路径或账号"
                type="text"
                value={historyQuery}
              />

              <div className="history-filters">
                <select
                  aria-label="按语气筛选历史记录"
                  onChange={(event) => setHistoryToneFilter(event.target.value as 'all' | RoastTone)}
                  value={historyToneFilter}
                >
                  <option value="all">全部语气</option>
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="按账号筛选历史记录"
                  onChange={(event) => setHistoryAccountFilter(event.target.value)}
                  value={historyAccountFilter}
                >
                  <option value="all">全部账号</option>
                  {historyAccountOptions.map((accountLabel) => (
                    <option key={accountLabel} value={accountLabel}>
                      {accountLabel}
                    </option>
                  ))}
                </select>

                <button className="ghost-chip" disabled={!canResetHistoryFilters} onClick={resetHistoryFilters} type="button">
                  清空筛选
                </button>
              </div>
            </div>

            {filteredHistory.length > 0 ? (
              <div className="history-grid">
                {filteredHistory.map((entry) => {
                  const toneMeta = toneOptions.find((item) => item.value === entry.tone) ?? toneOptions[0]

                  return (
                    <article className="history-card" key={entry.id}>
                      <img alt="历史截图预览" className="history-thumb" src={entry.previewDataUrl} />
                      <div className="history-content">
                        <div className="history-topline">
                          <div>
                            <strong>{entry.accountEmail ?? '未知账号'}</strong>
                            <span>{formatTime(entry.createdAt)}</span>
                          </div>
                          <span className="meta-pill">{toneMeta.label}</span>
                        </div>

                        <p className="history-roast">{entry.result.roast}</p>
                        <p className="supporting-text history-path">{entry.imagePath}</p>
                        <button className="ghost-link" onClick={() => loadHistoryEntry(entry)} type="button">
                          放回当前舞台
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="empty-state wide richer">
                <p>当前筛选条件下还没有命中的历史记录。换个关键词，或者先清空筛选看看。</p>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state wide richer">
            <p>还没有历史记录。做完第一轮分析后，这里会变成你自己的梗图素材库。</p>
          </div>
        )}
      </section>

      {showOnboarding ? (
        <div aria-labelledby="onboarding-title" aria-modal="true" className="onboarding-overlay" role="dialog">
          <div className="onboarding-card">
            <p className="eyebrow">首次上手</p>
            <h2 id="onboarding-title">第一次打开，先看这 3 步</h2>
            <div className="onboarding-steps">
              <div className="onboarding-step">
                <span>1</span>
                <div>
                  <strong>先把截图放进来</strong>
                  <p>你可以拖图、点按钮选图，或者直接 Ctrl + V 粘贴截图。</p>
                </div>
              </div>
              <div className="onboarding-step">
                <span>2</span>
                <div>
                  <strong>选一个结果语气</strong>
                  <p>默认是毒舌，也可以切成温柔或者打工人风格。</p>
                </div>
              </div>
              <div className="onboarding-step">
                <span>3</span>
                <div>
                  <strong>分析后继续打磨</strong>
                  <p>除了复制和导出，你现在还能切换分享模板，并把分享卡直接复制到剪贴板。</p>
                </div>
              </div>
            </div>
            <button className="primary-button onboarding-button" onClick={dismissOnboarding} type="button">
              知道了，开始用
            </button>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div aria-labelledby="settings-title" aria-modal="true" className="onboarding-overlay" role="dialog">
          <div className="onboarding-card settings-card">
            <p className="eyebrow">偏好设置</p>
            <h2 id="settings-title">把常用操作提前配好</h2>

            <div className="settings-grid">
              <div className="settings-block">
                <strong>默认语气</strong>
                <p>每次打开时，先落在哪个语气上。</p>
                <div className="settings-option-grid">
                  {toneOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`tone-option ${draftSettings.defaultTone === option.value ? 'active' : ''}`}
                      onClick={() => setDraftSettings((current) => ({ ...current, defaultTone: option.value }))}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-block">
                <strong>导入后自动分析</strong>
                <p>开着之后，拖图、选图或粘贴都会自动发起分析。</p>
                <button
                  aria-pressed={draftSettings.autoAnalyzeAfterImport}
                  className={`toggle-card ${draftSettings.autoAnalyzeAfterImport ? 'active' : ''}`}
                  onClick={() =>
                    setDraftSettings((current) => ({
                      ...current,
                      autoAnalyzeAfterImport: !current.autoAnalyzeAfterImport,
                    }))
                  }
                  type="button"
                >
                  <span>{draftSettings.autoAnalyzeAfterImport ? '已开启' : '已关闭'}</span>
                  <strong>{draftSettings.autoAnalyzeAfterImport ? '导入截图就自动跑分析' : '保留手动点击开始分析'}</strong>
                </button>
              </div>

              <div className="settings-block">
                <strong>桌面行为</strong>
                <p>把全局快捷键和系统托盘做成可控开关，按你自己的使用习惯来。</p>
                <div className="settings-option-grid">
                  <button
                    aria-pressed={draftSettings.enableGlobalClipboardShortcut}
                    className={`toggle-card ${draftSettings.enableGlobalClipboardShortcut ? 'active' : ''}`}
                    onClick={() =>
                      setDraftSettings((current) => ({
                        ...current,
                        enableGlobalClipboardShortcut: !current.enableGlobalClipboardShortcut,
                      }))
                    }
                    type="button"
                  >
                    <span>{draftSettings.enableGlobalClipboardShortcut ? '已开启' : '已关闭'}</span>
                    <strong>
                      {draftSettings.enableGlobalClipboardShortcut
                        ? `全局快捷键 ${globalClipboardShortcutLabel} 可用`
                        : '关闭全局剪贴板导入快捷键'}
                    </strong>
                  </button>

                  <button
                    aria-pressed={draftSettings.enableTrayIcon}
                    className={`toggle-card ${draftSettings.enableTrayIcon ? 'active' : ''}`}
                    onClick={() =>
                      setDraftSettings((current) => ({
                        ...current,
                        enableTrayIcon: !current.enableTrayIcon,
                      }))
                    }
                    type="button"
                  >
                    <span>{draftSettings.enableTrayIcon ? '已开启' : '已关闭'}</span>
                    <strong>{draftSettings.enableTrayIcon ? '系统托盘入口保持可用' : '关闭系统托盘入口'}</strong>
                  </button>
                </div>
              </div>

              <div className="settings-block">
                <strong>首次提示</strong>
                <p>如果你想再看一次上手引导，可以在这里重放。</p>
                <button className="secondary-button" onClick={replayOnboarding} type="button">
                  重新查看首次引导
                </button>
              </div>
            </div>

            <div className="settings-actions">
              <button className="ghost-link" onClick={() => setIsSettingsOpen(false)} type="button">
                先不改
              </button>
              <button className="primary-button" onClick={saveSettings} type="button">
                保存设置
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast-banner">{toast}</div> : null}
    </main>
  )
}

function isSupportedImageFile(file: File) {
  return file.type.startsWith('image/') || supportedImagePattern.test(file.name)
}

function readDroppedImage(file: DroppedImageFile): Promise<PickedScreenshot> {
  return new Promise((resolve, reject) => {
    if (!isSupportedImageFile(file)) {
      reject(new Error('这里只能拖入图片文件。'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败。'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('读取图片失败。'))
        return
      }

      resolve({
        path: file.path ?? file.name,
        previewDataUrl: reader.result,
      })
    }

    reader.readAsDataURL(file)
  })
}

function extractImageFromTransfer(transfer: DataTransfer | null) {
  if (!transfer) {
    return null
  }

  const fileFromFiles = Array.from(transfer.files).find(isSupportedImageFile)
  if (fileFromFiles) {
    return fileFromFiles as DroppedImageFile
  }

  for (const item of Array.from(transfer.items)) {
    if (item.kind !== 'file') {
      continue
    }

    const file = item.getAsFile()
    if (file && isSupportedImageFile(file)) {
      return file as DroppedImageFile
    }
  }

  return null
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatAccountSyncText(account: CockpitAccountState | null) {
  if (!account?.updatedAt) {
    return '账号变化会自动同步到这个应用。整条链路只读，不会写回 Cockpit。'
  }

  return `最近同步于 ${new Date(account.updatedAt).toLocaleString('zh-CN', { hour12: false })}，整条链路只读，不会写回 Cockpit。`
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(',')
  const mimeType = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

export default App
