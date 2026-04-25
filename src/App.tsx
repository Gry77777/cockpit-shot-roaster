import type { DragEvent } from 'react'
import { useEffect, useState } from 'react'
import { loadHistory, saveHistory, type AnalysisHistoryEntry } from './features/history/historyStore'
import { renderShareCardPngDataUrl } from './features/shareCard/renderShareCard'
import type { AnalysisResult, CockpitAccountState, PickedScreenshot, RoastTone } from './lib/contracts'
import { buildShareCardFileName, buildShareCardSvg } from './lib/shareCard/shareCard'

const toneOptions: Array<{ label: string; value: RoastTone; description: string }> = [
  { label: '毒舌', value: 'roast', description: '更冲一点，适合做带梗吐槽。' },
  { label: '温柔', value: 'gentle', description: '轻松一点，像朋友帮你点评。' },
  { label: '打工人', value: 'work', description: '更像会上复盘，但带一点幽默。' },
]

const supportedImagePattern = /\.(png|jpe?g|webp|gif|bmp|svg)$/i
const ONBOARDING_KEY = 'cockpit-shot-roaster-onboarding-dismissed'

type DroppedImageFile = File & { path?: string }

function App() {
  const [account, setAccount] = useState<CockpitAccountState | null>(null)
  const [selectedShot, setSelectedShot] = useState<PickedScreenshot | null>(null)
  const [tone, setTone] = useState<RoastTone>('roast')
  const [apiKey, setApiKey] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [history, setHistory] = useState<AnalysisHistoryEntry[]>(() => loadHistory())
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !readBooleanPreference(ONBOARDING_KEY))

  const selectedToneMeta = toneOptions.find((item) => item.value === tone) ?? toneOptions[0]
  const activeEmail = account?.email ?? '正在读取账号...'
  const stageStatus = !selectedShot ? '待选图' : result ? '可导出' : '待分析'

  useEffect(() => {
    let isMounted = true

    void window.cockpitShot.getCurrentAccount().then((value) => {
      if (isMounted) {
        setAccount(value)
      }
    })

    const unsubscribe = window.cockpitShot.onCurrentAccountChange((value) => {
      setAccount(value)
      setToast('Codex 账号已同步到当前桌面应用。')
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
    const handlePaste = async (event: ClipboardEvent) => {
      const pastedFile = extractImageFromTransfer(event.clipboardData)
      if (!pastedFile) {
        return
      }

      event.preventDefault()

      try {
        const picked = await readDroppedImage(pastedFile)
        setSelectedShot(picked)
        setResult(null)
        setError(null)
        setToast('粘贴成功，当前截图已经进入舞台。')
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : '读取粘贴图片失败。')
      }
    }

    window.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [])

  async function handlePickScreenshot() {
    const picked = await window.cockpitShot.pickScreenshot()
    if (!picked) {
      return
    }

    setSelectedShot(picked)
    setResult(null)
    setError(null)
    setToast('截图已经进入舞台，可以直接开始分析。')
  }

  async function handleAnalyze() {
    if (!selectedShot) {
      setError('请先选择一张截图。')
      return
    }

    try {
      setIsAnalyzing(true)
      setError(null)

      const nextResult = await window.cockpitShot.analyzeScreenshot({
        imagePath: selectedShot.path,
        tone,
        activeEmail: account?.email ?? null,
        apiKey: apiKey.trim() || undefined,
      })

      const nextEntry: AnalysisHistoryEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        imagePath: selectedShot.path,
        previewDataUrl: selectedShot.previewDataUrl,
        tone,
        accountEmail: account?.email ?? null,
        result: nextResult,
      }

      setResult(nextResult)
      setHistory((current) => [nextEntry, ...current].slice(0, 6))
      setToast('新结果已经生成，可以复制或者导出分享卡。')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '截图分析失败。')
    } finally {
      setIsAnalyzing(false)
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
      setError('只能拖入图片文件。')
      return
    }

    try {
      const picked = await readDroppedImage(droppedFile as DroppedImageFile)
      setSelectedShot(picked)
      setResult(null)
      setError(null)
      setToast('拖入成功，当前截图已经替换。')
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
    setError(null)
    setToast('历史记录已放回舞台。')
  }

  function dismissOnboarding() {
    window.localStorage.setItem(ONBOARDING_KEY, 'true')
    setShowOnboarding(false)
  }

  return (
    <main className="shell">
      <header className="app-bar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            SR
          </div>
          <div>
            <p className="eyebrow">Codex 联动桌面版</p>
            <h1 className="app-title">截图吐槽机</h1>
          </div>
        </div>

        <div className="head-cluster top-actions">
          <span className="badge strong-badge">桌面安装版</span>
          <span className="badge subtle-badge">只读监听 Codex</span>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copyblock">
          <p className="eyebrow">产品气质</p>
          <h2 className="hero-headline">把截图变成一句能发出去的梗</h2>
          <p className="hero-subtitle">只读联动当前 Codex 账号，不改 Cockpit 任何源码、逻辑和原始体验。</p>
          <p className="hero-copy">
            这不是一块冷冰冰的调试面板，而是一个更像成品的软件界面。你可以拖图、选语气、生成吐槽，再一键导出分享卡，
            直接把结果拿去发群、发推或者放进 GitHub README。
          </p>

          <div className="hero-highlights">
            <article className="highlight-card">
              <span>01</span>
              <strong>拖拽即用</strong>
              <p>截图可以直接丢进舞台，换图不需要重新找按钮。</p>
            </article>
            <article className="highlight-card">
              <span>02</span>
              <strong>结果能发</strong>
              <p>一句吐槽、正经总结、三条标题，输出就是为了分享。</p>
            </article>
            <article className="highlight-card">
              <span>03</span>
              <strong>本地留痕</strong>
              <p>最近 6 条历史留在本机，方便你反复挑最有梗的那一条。</p>
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
            <h2>选图、分析、导出，一条链路跑完</h2>
          </div>

          <div className="head-cluster">
            <span className="badge subtle-badge">只读监听 Codex 账号</span>
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
                <h3>{selectedShot ? '截图已进入舞台' : '拖一张图进来'}</h3>
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
                <p className="drop-caption">也可以直接拖进另一张图，松手后会立刻替换当前截图。</p>
              </div>
            ) : (
              <div className="empty-spotlight">
                <div className="empty-orb" />
                <div className="empty-copy">
                  <strong>拖入图片，或者点右上角按钮手动选择</strong>
                  <p>支持 PNG、JPG、WEBP、GIF 等常见格式。整个过程只读取你主动选中的文件。</p>
                </div>
              </div>
            )}

            {isDragActive ? (
              <div className="drop-overlay">
                <strong>松手即可导入截图</strong>
                <span>文件进入舞台后，可以直接开始分析或者替换当前图片。</span>
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
                  <p>由 Cockpit 只读同步。</p>
                </div>
                <div className="status-tile">
                  <span>结果语言</span>
                  <strong>简体中文</strong>
                  <p>适合直接展示和分享。</p>
                </div>
                <div className="status-tile">
                  <span>推荐标题</span>
                  <strong>{result?.titles[0] ?? '等分析后自动出现'}</strong>
                  <p>会跟随这次截图内容刷新。</p>
                </div>
              </div>

              <div className="workflow-list">
                <div className={`flow-step ${selectedShot ? 'active' : ''}`}>
                  <span>1</span>
                  <div>
                    <strong>准备截图</strong>
                    <p>拖拽或手动选择都可以。</p>
                  </div>
                </div>
                <div className={`flow-step ${selectedShot && !result ? 'active' : result ? 'done' : ''}`}>
                  <span>2</span>
                  <div>
                    <strong>生成吐槽</strong>
                    <p>根据当前语气生成整套结果。</p>
                  </div>
                </div>
                <div className={`flow-step ${result ? 'active' : ''}`}>
                  <span>3</span>
                  <div>
                    <strong>导出分享</strong>
                    <p>复制文本，或者导出分享卡图片。</p>
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
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="可留空，优先走当前 Codex 本地接入"
                  type="password"
                  value={apiKey}
                />
                <small>这里只影响这个应用，不会写回 Cockpit，也不会修改它原本的账号配置。</small>
              </label>

              <div className="action-stack">
                <button className="primary-button" disabled={isAnalyzing} onClick={handleAnalyze} type="button">
                  {isAnalyzing ? '分析中...' : '开始分析'}
                </button>

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

              {error ? <p className="error-banner">{error}</p> : null}
            </article>
          </aside>
        </div>
      </section>

      <section className="results-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">输出结果</p>
            <h2>{result ? '这轮结果已经可以直接拿去发' : '等你开始分析后，这里会变成结果舞台'}</h2>
          </div>

          {result ? (
            <div className="head-cluster">
              <span className="badge">{selectedToneMeta.label}</span>
              <span className="badge subtle-badge">{activeEmail}</span>
            </div>
          ) : null}
        </div>

        {result ? (
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
                  <p className="panel-kicker">推荐标题</p>
                  <button className="copy-link" onClick={() => copyText(result.titles[0] ?? '', '推荐标题')} type="button">
                    复制
                  </button>
                </div>
                <p className="spotlight-title">{result.titles[0]}</p>
                <p className="supporting-text">适合用来做分享图、动态文案或者 README 展示标题。</p>
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
        ) : (
          <div className="empty-state wide richer">
            <p>结果区会自动排好一句吐槽、一段总结和三条标题，点一下就能复制，点一下也能导出分享卡。</p>
          </div>
        )}
      </section>

      <section className="history-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">最近记录</p>
            <h2>本地保留最近 6 条，用来回看最好笑的那一条</h2>
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
            <p>还没有历史记录。做完第一次分析后，这里会变成你的梗图素材库。</p>
          </div>
        )}
      </section>

      {showOnboarding ? (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
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
                  <strong>选一种结果语气</strong>
                  <p>默认是毒舌，也可以切成温柔或者打工人。</p>
                </div>
              </div>
              <div className="onboarding-step">
                <span>3</span>
                <div>
                  <strong>分析后直接复制或导出</strong>
                  <p>结果会给你一句吐槽、一段总结和 3 个分享标题。</p>
                </div>
              </div>
            </div>
            <button className="primary-button onboarding-button" onClick={dismissOnboarding} type="button">
              知道了，开始用
            </button>
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
      reject(new Error('只能拖入图片文件。'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取拖入图片失败。'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('读取拖入图片失败。'))
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

function readBooleanPreference(key: string) {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatAccountSyncText(account: CockpitAccountState | null) {
  if (!account?.updatedAt) {
    return '账号变化会自动同步到这个应用，整个流程只读，不会写回 Cockpit。'
  }

  return `最近同步于 ${new Date(account.updatedAt).toLocaleString('zh-CN', { hour12: false })}，整个流程只读，不会写回 Cockpit。`
}

export default App
