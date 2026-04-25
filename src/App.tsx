import type { DragEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { loadHistory, saveHistory, type AnalysisHistoryEntry } from './features/history/historyStore'
import { renderShareCardPngDataUrl } from './features/shareCard/renderShareCard'
import { dismissOnboardingPreference, hasDismissedOnboarding, loadAppSettings, resetOnboardingPreference, saveAppSettings, type AppSettings } from './lib/appSettings'
import type {
  AnalysisResult,
  CockpitAccountState,
  PickedScreenshot,
  RoastTone,
  RewriteMode,
} from './lib/contracts'
import { getErrorGuidance } from './lib/errorGuidance'
import { buildShareCardFileName, buildShareCardSvg } from './lib/shareCard/shareCard'

const toneOptions: Array<{ label: string; value: RoastTone; description: string }> = [
  { label: '毒舌', value: 'roast', description: '更冲一点，适合把截图里的情绪值直接拉满。' },
  { label: '温柔', value: 'gentle', description: '轻一点，更像朋友在旁边帮你补一句。' },
  { label: '打工人', value: 'work', description: '像复盘会发言，但保留一点幽默感。' },
]

const rewriteActions: Array<{ label: string; value: RewriteMode; description: string }> = [
  { label: '更毒一点', value: 'spicier', description: '把梗味往上推一档。' },
  { label: '更短一点', value: 'shorter', description: '压成更利落的短句。' },
  { label: '标题党一点', value: 'headline', description: '让标题更像能直接发出去。' },
]

const supportedImagePattern = /\.(png|jpe?g|webp|gif|bmp|svg)$/i

type DroppedImageFile = File & { path?: string }

function App() {
  const [account, setAccount] = useState<CockpitAccountState | null>(null)
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings())
  const [draftSettings, setDraftSettings] = useState<AppSettings>(() => loadAppSettings())
  const [selectedShot, setSelectedShot] = useState<PickedScreenshot | null>(null)
  const [tone, setTone] = useState<RoastTone>(() => loadAppSettings().defaultTone)
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [resultVersions, setResultVersions] = useState<AnalysisResult[]>([])
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>(() => loadHistory())
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

  useEffect(() => {
    let isMounted = true

    void window.cockpitShot.getCurrentAccount().then((value) => {
      if (isMounted) {
        setAccount(value)
      }
    })

    const unsubscribe = window.cockpitShot.onCurrentAccountChange((value) => {
      setAccount(value)
      setToast('Codex 账号已切换，桌面应用也已经跟上。')
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    saveHistory(history)
  }, [history])

  useEffect(() => {
    saveAppSettings(settings)
  }, [settings])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 2400)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [toast])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    setDraftSettings(settings)
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

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [settings.autoAnalyzeAfterImport, tone, account?.email, apiKey, result])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !event.ctrlKey) {
        return
      }

      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') {
          return
        }
      }

      if (!selectedShot || isAnalyzing || isRewriting) {
        return
      }

      event.preventDefault()
      void runAnalysis()
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
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

  async function handleExportShareCard() {
    if (!selectedShot || !result) {
      setError('请先生成一条结果，再导出分享卡。')
      return
    }

    try {
      setIsExporting(true)
      setError(null)

      const svg = buildShareCardSvg({
        previewDataUrl: selectedShot.previewDataUrl,
        toneLabel: selectedToneMeta.label,
        accountEmail: account?.email ?? null,
        roast: result.roast,
        summary: result.summary,
        titles: result.titles,
      })
      const pngDataUrl = await renderShareCardPngDataUrl(svg)
      const savedPath = await window.cockpitShot.saveShareCard(pngDataUrl, buildShareCardFileName())

      if (savedPath) {
        setToast('分享卡已经保存到本地。')
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '导出分享卡失败。')
    } finally {
      setIsExporting(false)
    }
  }

  function handleStageDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(true)
  }

  function handleStageDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragActive(true)
  }

  function handleStageDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    setIsDragActive(false)
  }

  async function handleStageDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(false)

    const droppedFile = Array.from(event.dataTransfer.files).find(isSupportedImageFile)
    if (!droppedFile) {
      setError('这里只能拖入图片文件。')
      return
    }

    try {
      const picked = await readDroppedImage(droppedFile as DroppedImageFile)
      await applyPickedShot(picked, '截图已替换，可以继续分析。')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '读取拖入图片失败。')
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setToast(`${label}已复制到剪贴板。`)
    } catch {
      setError('复制失败，请稍后重试。')
    }
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
    setToast('这条历史结果已经放回当前舞台。')
  }

  function restorePreviousVersion() {
    setResultVersions((current) => {
      if (current.length <= 1) {
        return current
      }

      const nextVersions = current.slice(0, -1)
      const previousVersion = nextVersions[nextVersions.length - 1] ?? null
      setResult(previousVersion)
      setToast('已经回到上一版结果。')
      return nextVersions
    })
  }

  function dismissOnboarding() {
    dismissOnboardingPreference()
    setShowOnboarding(false)
  }

  function openSettings() {
    setDraftSettings(settings)
    setIsSettingsOpen(true)
  }

  function saveSettings() {
    setSettings(draftSettings)
    setTone(draftSettings.defaultTone)
    setToast('偏好设置已更新。')
    setIsSettingsOpen(false)
  }

  function replayOnboarding() {
    resetOnboardingPreference()
    setIsSettingsOpen(false)
    setShowOnboarding(true)
  }

  function handleGuidanceAction(action: 'retry' | 'focus-api') {
    if (action === 'retry') {
      void runAnalysis()
      return
    }

    apiKeyInputRef.current?.focus()
  }

  return (
    <main className="shell">
      <header className="app-bar">
        <div className="brand-lockup">
          <div aria-hidden="true" className="brand-mark">
            SR
          </div>
          <div>
            <p className="eyebrow">Codex 联动桌面版</p>
            <h1 className="app-title">截图吐槽机</h1>
          </div>
        </div>

        <div className="head-cluster top-actions">
          <span className="badge strong-badge">可安装软件</span>
          <span className="badge subtle-badge">只读监听 Codex</span>
          <button className="secondary-button top-icon-button" onClick={openSettings} type="button">
            偏好设置
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copyblock">
          <p className="eyebrow">产品气质</p>
          <h2 className="hero-headline">把截图变成一段能直接发出去的结果</h2>
          <p className="hero-subtitle">只读联动当前 Codex 账号，不改 Cockpit 原有代码、不碰原有逻辑。</p>
          <p className="hero-copy">
            你可以拖图、选语气、生成吐槽，再一键导出分享卡。现在这版还多了结果二次改写、失败下一步引导和偏好设置，
            更像一个真正能长期留在桌面上的小工具。
          </p>

          <div className="hero-highlights">
            <article className="highlight-card">
              <span>01</span>
              <strong>接图够快</strong>
              <p>支持拖图、选图和 Ctrl+V 粘贴，导入后也能按偏好自动开始分析。</p>
            </article>
            <article className="highlight-card">
              <span>02</span>
              <strong>结果可继续打磨</strong>
              <p>不是一次性吐完就结束，还能继续改得更毒、更短或者更像传播标题。</p>
            </article>
            <article className="highlight-card">
              <span>03</span>
              <strong>失败也给下一步</strong>
              <p>认证、超时、本地接入异常都会给出更明确的补救动作，不让你自己猜。</p>
            </article>
          </div>
        </div>

        <div className="hero-aside">
          <article className="spotlight-card">
            <span className="spotlight-label">当前 Codex 账号</span>
            <strong>{activeEmail}</strong>
            <p>{formatAccountSyncText(account)}</p>
          </article>

          <div className="hero-stats">
            <div className="mini-stat">
              <span>当前阶段</span>
              <strong>{stageStatus}</strong>
            </div>
            <div className="mini-stat">
              <span>当前语气</span>
              <strong>{selectedToneMeta.label}</strong>
            </div>
            <div className="mini-stat">
              <span>本地历史</span>
              <strong>{history.length}/6</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">主工作台</p>
            <h2>导入截图、生成结果、继续打磨，整条链路都在这</h2>
          </div>

          <div className="head-cluster">
            <span className="badge subtle-badge">默认语气：{toneOptions.find((item) => item.value === settings.defaultTone)?.label}</span>
            <span className="badge">{stageStatus}</span>
          </div>
        </div>

        <div className="workspace-grid">
          <article
            aria-label="截图拖放区"
            className={`preview-stage ${isDragActive ? 'drag-active' : ''}`}
            onDragEnter={handleStageDragEnter}
            onDragLeave={handleStageDragLeave}
            onDragOver={handleStageDragOver}
            onDrop={handleStageDrop}
          >
            <div className="panel-topline">
              <div>
                <p className="panel-kicker">截图舞台</p>
                <h3>{selectedShot ? '截图已就位' : '拖一张图进来'}</h3>
              </div>
              <button className="secondary-button" onClick={handlePickScreenshot} type="button">
                {selectedShot ? '换一张图' : '选择截图'}
              </button>
            </div>

            {selectedShot ? (
              <div className="preview-frame">
                <img alt="当前截图预览" className="shot-preview" src={selectedShot.previewDataUrl} />
                <div className="preview-meta">
                  <span className="meta-pill">{selectedToneMeta.label}</span>
                  <span className="meta-pill subtle">{activeEmail}</span>
                  <span className="meta-pill subtle">当前阶段 · {stageStatus}</span>
                </div>
                <p className="supporting-text path-text">{selectedShot.path}</p>
                <p className="drop-caption">继续拖进另一张图会直接替换当前截图。开启自动分析后，导入就会立刻开跑。</p>
              </div>
            ) : (
              <div className="empty-spotlight">
                <div className="empty-orb" />
                <div className="empty-copy">
                  <strong>拖入图片，或者点击右上角按钮手动选择</strong>
                  <p>支持 PNG、JPG、WEBP、GIF 等常见格式，Ctrl+V 也能直接把截图贴进来。</p>
                </div>
              </div>
            )}

            {isDragActive ? (
              <div className="drop-overlay">
                <strong>松手即可导入截图</strong>
                <span>进入舞台后可以直接分析，也可以继续替换当前截图。</span>
              </div>
            ) : null}
          </article>

          <aside className="control-rail">
            <article className="control-card">
              <div className="panel-topline compact">
                <div>
                  <p className="panel-kicker">状态面板</p>
                  <h3>当前这轮在做什么</h3>
                </div>
              </div>

              <div className="status-grid">
                <div className="status-tile">
                  <span>账号来源</span>
                  <strong>Codex 当前账号</strong>
                  <p>由 Cockpit 只读同步，不反向写回。</p>
                </div>
                <div className="status-tile">
                  <span>结果语言</span>
                  <strong>简体中文</strong>
                  <p>截图内容即使是英文或日文，输出也统一转成中文。</p>
                </div>
                <div className="status-tile">
                  <span>当前首推标题</span>
                  <strong>{result?.titles[0] ?? '等分析后自动出现'}</strong>
                  <p>适合直接拿去做分享文案或 README 截图标题。</p>
                </div>
              </div>

              <div className="workflow-list">
                <div className={`flow-step ${selectedShot ? 'done' : 'active'}`}>
                  <span>1</span>
                  <div>
                    <strong>准备截图</strong>
                    <p>拖图、选图、粘贴都可以。</p>
                  </div>
                </div>
                <div className={`flow-step ${selectedShot && !result ? 'active' : result ? 'done' : ''}`}>
                  <span>2</span>
                  <div>
                    <strong>生成首轮结果</strong>
                    <p>先拿到一句吐槽、一段总结和三个分享标题。</p>
                  </div>
                </div>
                <div className={`flow-step ${result ? 'active' : ''}`}>
                  <span>3</span>
                  <div>
                    <strong>继续打磨或导出</strong>
                    <p>可以再改写一版，也可以直接导出分享卡。</p>
                  </div>
                </div>
              </div>
            </article>

            <article className="control-card">
              <div className="panel-topline compact">
                <div>
                  <p className="panel-kicker">控制台</p>
                  <h3>开始分析</h3>
                </div>
                <span className="tone-badge">{selectedToneMeta.label}</span>
              </div>

              <div className="tone-grid">
                {toneOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`tone-option ${tone === option.value ? 'active' : ''}`}
                    onClick={() => setTone(option.value)}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>

              <label className="field">
                <span>OpenAI API Key</span>
                <input
                  aria-label="OpenAI API Key"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="可留空，优先走当前 Codex 本地接入"
                  ref={apiKeyInputRef}
                  type="password"
                  value={apiKey}
                />
                <small>这里只影响这个应用，不会写回 Cockpit，也不会改它原来的账号配置。</small>
              </label>

              <div className="action-stack">
                <button className="primary-button" disabled={isAnalyzing || Boolean(isRewriting)} onClick={() => void runAnalysis()} type="button">
                  {isAnalyzing ? '分析中...' : '开始分析'}
                </button>
                <p className="shortcut-hint">快捷键：`Ctrl + Enter` 直接开始分析</p>

                {result ? (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        copyText(
                          [result.roast, result.summary, ...result.titles.map((title, index) => `${index + 1}. ${title}`)].join('\n'),
                          '结果汇总',
                        )
                      }
                      type="button"
                    >
                      复制结果汇总
                    </button>
                    <button className="secondary-button accent-button" disabled={isExporting} onClick={handleExportShareCard} type="button">
                      {isExporting ? '导出中...' : '导出分享卡'}
                    </button>
                  </>
                ) : null}
              </div>

              {error ? (
                <div className="error-panel" role="alert">
                  <p className="error-title">{errorGuidance?.title ?? '这次没跑通'}</p>
                  <p className="error-detail">{errorGuidance?.detail ?? error}</p>
                  <p className="error-raw">{error}</p>
                  <div className="error-actions">
                    {errorGuidance?.primaryAction && errorGuidance.primaryLabel ? (
                      <button className="secondary-button slim-button" onClick={() => handleGuidanceAction(errorGuidance.primaryAction!)} type="button">
                        {errorGuidance.primaryLabel}
                      </button>
                    ) : null}
                    {errorGuidance?.secondaryAction && errorGuidance.secondaryLabel ? (
                      <button className="ghost-link" onClick={() => handleGuidanceAction(errorGuidance.secondaryAction!)} type="button">
                        {errorGuidance.secondaryLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          </aside>
        </div>
      </section>

      <section className="results-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">输出结果</p>
            <h2>{result ? '结果已经出来了，而且还能继续改得更顺手' : '开始分析后，这里会变成你的结果舞台'}</h2>
          </div>

          {result ? (
            <div className="head-cluster">
              <span className="badge">{selectedToneMeta.label}</span>
              <span className="badge subtle-badge">{activeEmail}</span>
            </div>
          ) : null}
        </div>

        {result ? (
          <>
            <div className="rewrite-strip">
              <span className="rewrite-label">二次改写</span>
              <div className="rewrite-actions">
                {resultVersions.length > 1 ? (
                  <button className="ghost-chip" onClick={restorePreviousVersion} type="button">
                    回到上一版
                  </button>
                ) : null}
                {rewriteActions.map((action) => (
                  <button
                    key={action.value}
                    className={`secondary-button rewrite-button ${isRewriting === action.value ? 'busy' : ''}`}
                    disabled={Boolean(isRewriting) || isAnalyzing}
                    onClick={() => void runAnalysis(selectedShot, action.value)}
                    type="button"
                  >
                    {isRewriting === action.value ? '改写中...' : action.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="results-showcase">
              <article className="hero-result-card">
                <div className="result-topline">
                  <p className="panel-kicker">一句吐槽</p>
                  <button className="copy-link" onClick={() => copyText(result.roast, '一句吐槽')} type="button">
                    复制
                  </button>
                </div>
                <p className="hero-result-text">{result.roast}</p>
              </article>

              <div className="result-side-stack">
                <article className="result-card spotlight-result">
                  <div className="result-topline">
                    <p className="panel-kicker">首推标题</p>
                    <button className="copy-link" onClick={() => copyText(result.titles[0] ?? '', '首推标题')} type="button">
                      复制
                    </button>
                  </div>
                  <p className="spotlight-title">{result.titles[0]}</p>
                  <p className="supporting-text">适合做分享图标题、动态文案，或者 GitHub 首页展示图旁边那一句。</p>
                </article>

                <article className="result-card">
                  <div className="result-topline">
                    <p className="panel-kicker">正经总结</p>
                    <button className="copy-link" onClick={() => copyText(result.summary, '正经总结')} type="button">
                      复制
                    </button>
                  </div>
                  <p>{result.summary}</p>
                </article>

                <article className="result-card">
                  <div className="result-topline">
                    <p className="panel-kicker">分享标题</p>
                    <button className="copy-link" onClick={() => copyText(result.titles.join('\n'), '分享标题')} type="button">
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
            <p>这里会自动整理出一句吐槽、一段总结和三个标题。出结果后还能继续点“更毒一点”“更短一点”这种二次改写。</p>
          </div>
        )}
      </section>

      <section className="history-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">最近记录</p>
            <h2>本地保留最近 6 条，方便你回看哪条最能打</h2>
          </div>
          <span className="badge subtle-badge">仅存本地</span>
        </div>

        {history.length > 0 ? (
          <div className="history-grid">
            {history.map((entry) => {
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
                  <p>你可以拖图、点按钮选图，或者直接 Ctrl+V 粘贴截图。</p>
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
                  <p>除了复制和导出，你现在还能继续把结果改得更毒、更短或者更像传播标题。</p>
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
    return '账号变化会自动同步到这个应用。整个链路只读，不会写回 Cockpit。'
  }

  return `最近同步于 ${new Date(account.updatedAt).toLocaleString('zh-CN', { hour12: false })}，整个链路只读，不会写回 Cockpit。`
}

export default App
