import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'

function mockCockpitBridge() {
  window.cockpitShot = {
    getCurrentAccount: vi.fn().mockResolvedValue({
      email: 'demo@codex.dev',
    }),
    pickScreenshot: vi.fn().mockResolvedValue(null),
    analyzeScreenshot: vi.fn(),
    saveShareCard: vi.fn(),
    onCurrentAccountChange: vi.fn(() => () => {}),
  }
}

async function dismissOnboardingIfPresent() {
  const onboardingDialog = screen.queryByRole('dialog')
  if (!onboardingDialog) {
    return
  }

  fireEvent.click(within(onboardingDialog).getByRole('button', { name: /知道了，开始用/ }))

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders the polished Chinese desktop shell and current Codex account', async () => {
    mockCockpitBridge()

    render(<App />)

    expect(screen.getByRole('heading', { name: /截图吐槽机/ })).toBeInTheDocument()
    expect(screen.getByText(/把截图变成一句能发出去的梗/)).toBeInTheDocument()
    expect(screen.getByText(/桌面安装版/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /选择截图/ })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('demo@codex.dev')).toBeInTheDocument()
    })
  })

  it('accepts a dropped image file and updates the preview stage', async () => {
    mockCockpitBridge()

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,dragged-preview',
      })
      this.onload?.(new ProgressEvent('load'))
    })

    render(<App />)
    await dismissOnboardingIfPresent()

    const droppedFile = new File(['demo'], 'drop-image.png', { type: 'image/png' }) as File & { path?: string }
    Object.defineProperty(droppedFile, 'path', {
      configurable: true,
      value: 'C:\\shots\\drop-image.png',
    })

    const [dropZone] = screen.getAllByLabelText(/截图拖放区/)

    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [droppedFile],
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /截图已进入舞台/ })).toBeInTheDocument()
    })

    expect(screen.getByText('C:\\shots\\drop-image.png')).toBeInTheDocument()
  })

  it('accepts a pasted image file and updates the preview stage', async () => {
    mockCockpitBridge()

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,pasted-preview',
      })
      this.onload?.(new ProgressEvent('load'))
    })

    render(<App />)
    await dismissOnboardingIfPresent()

    const pastedFile = new File(['demo'], 'paste-image.png', { type: 'image/png' }) as File & { path?: string }
    Object.defineProperty(pastedFile, 'path', {
      configurable: true,
      value: 'C:\\shots\\paste-image.png',
    })

    fireEvent.paste(window, {
      clipboardData: {
        files: [pastedFile],
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => pastedFile,
          },
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('C:\\shots\\paste-image.png')).toBeInTheDocument()
    })
  })

  it('shows onboarding tips on first open and lets the user dismiss them', async () => {
    mockCockpitBridge()

    render(<App />)

    const onboardingDialog = screen.getByRole('dialog')
    expect(onboardingDialog).toBeInTheDocument()
    expect(within(onboardingDialog).getByText(/Ctrl\+V/)).toBeInTheDocument()

    fireEvent.click(within(onboardingDialog).getByRole('button', { name: /知道了，开始用/ }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    render(<App />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an export share card action after analysis finishes', async () => {
    mockCockpitBridge()
    window.cockpitShot.analyzeScreenshot = vi.fn().mockResolvedValue({
      roast: 'alpha roast line',
      summary: 'plain summary block',
      titles: ['first share title', 'second share title', 'third share title'],
    })

    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function mockReadAsDataURL(this: FileReader) {
      Object.defineProperty(this, 'result', {
        configurable: true,
        value: 'data:image/png;base64,dragged-preview',
      })
      this.onload?.(new ProgressEvent('load'))
    })

    render(<App />)
    await dismissOnboardingIfPresent()

    const droppedFile = new File(['demo'], 'drop-image.png', { type: 'image/png' }) as File & { path?: string }
    Object.defineProperty(droppedFile, 'path', {
      configurable: true,
      value: 'C:\\shots\\drop-image.png',
    })

    const [dropZone] = screen.getAllByLabelText(/截图拖放区/)
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [droppedFile],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('C:\\shots\\drop-image.png')).toBeInTheDocument()
    })

    const [analyzeButton] = screen.getAllByRole('button', { name: /开始分析/ })
    fireEvent.click(analyzeButton)

    await waitFor(() => {
      expect(screen.getAllByText('alpha roast line').length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /导出分享卡/ })).toBeInTheDocument()
    })
  })
})
