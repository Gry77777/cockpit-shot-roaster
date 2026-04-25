export interface ErrorGuidance {
  title: string
  detail: string
  primaryAction?: 'retry' | 'focus-api'
  primaryLabel?: string
  secondaryAction?: 'focus-api'
  secondaryLabel?: string
}

export function getErrorGuidance(errorMessage: string | null): ErrorGuidance | null {
  if (!errorMessage) {
    return null
  }

  if (errorMessage.includes('未找到可用认证') || errorMessage.includes('API Key')) {
    return {
      title: '这次不是截图问题，是认证链路没接上。',
      detail: '先确认 Codex 本地接入是否可用；如果只是想先跑通，也可以直接在右侧填一个 OpenAI API Key。',
      primaryAction: 'focus-api',
      primaryLabel: '去填 API Key',
    }
  }

  if (errorMessage.includes('请求超时')) {
    return {
      title: '这次请求超时了。',
      detail: '通常是当前认证链路响应太慢。先重试一次；如果还是慢，改走 API Key 会更稳。',
      primaryAction: 'retry',
      primaryLabel: '再试一次',
      secondaryAction: 'focus-api',
      secondaryLabel: '改填 API Key',
    }
  }

  if (errorMessage.includes('本地接入') || errorMessage.includes('Cockpit') || errorMessage.includes('Codex')) {
    return {
      title: 'Codex 本地接入当前不可用。',
      detail: '应用已经识别到当前账号，但这条本地接入没有给出可调用能力。你可以先切回可用账号，或者临时改用 API Key。',
      primaryAction: 'focus-api',
      primaryLabel: '先用 API Key',
    }
  }

  return {
    title: '这次分析没跑通。',
    detail: '先保留当前截图，直接重试一次通常就够；如果连续失败，再切换认证方式。',
    primaryAction: 'retry',
    primaryLabel: '重试分析',
  }
}
