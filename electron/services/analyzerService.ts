import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import OpenAI from 'openai'
import type { AnalysisRequest, AnalysisResult } from '@/lib/contracts'
import { buildAnalysisPrompt, parseAnalysisResponse } from '@/lib/openai/analyzeScreenshot'

const DEFAULT_MODEL = 'gpt-4.1-mini'
const DEFAULT_LOCAL_CODEX_MODEL = 'gpt-5.4-mini'
const DEFAULT_CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json')
const DEFAULT_CODEX_LOCAL_ACCESS_PATH = join(homedir(), '.antigravity_cockpit', 'codex_local_access.json')

export async function analyzeScreenshot(request: AnalysisRequest): Promise<AnalysisResult> {
  const codexAuthRaw = await readFile(DEFAULT_CODEX_AUTH_PATH, 'utf8').catch(() => '')
  const codexLocalAccessRaw = await readFile(DEFAULT_CODEX_LOCAL_ACCESS_PATH, 'utf8').catch(() => '')
  const apiKey = resolveAnalyzerAuthToken(request.apiKey, process.env.OPENAI_API_KEY, codexAuthRaw)
  const localCodexAccess = resolveLocalCodexAccess(codexLocalAccessRaw)

  if (!localCodexAccess && !apiKey) {
    throw new Error('未找到可用认证。请先登录 Codex，或手动填写 OpenAI API Key。')
  }

  const imageBuffer = await readFile(request.imagePath)
  const prompt = buildAnalysisPrompt(request)
  const model = resolveAnalyzerModel(Boolean(localCodexAccess), process.env.OPENAI_MODEL)
  const imageDataUrl = fileBufferToDataUrl(imageBuffer, request.imagePath)

  try {
    if (localCodexAccess) {
      const outputText = await createLocalCodexResponse(localCodexAccess.baseURL, localCodexAccess.apiKey, {
        model,
        instructions: prompt.instructions,
        userPrompt: prompt.userPrompt,
        imageDataUrl,
      })

      return parseAnalysisResponse(outputText)
    }

    const client = new OpenAI({
      apiKey: apiKey ?? '',
      maxRetries: 0,
      timeout: 15000,
    })
    const response = await client.responses.create(
      buildAnalysisResponseRequest({
        model,
        instructions: prompt.instructions,
        userPrompt: prompt.userPrompt,
        imageDataUrl,
      }),
    )

    return parseAnalysisResponse(response.output_text)
  } catch (error) {
    throw rewriteAnalyzerError(error, Boolean(localCodexAccess))
  }
}

interface CodexAuthPayload {
  OPENAI_API_KEY?: unknown
  tokens?: {
    access_token?: unknown
  }
}

export function resolveAnalyzerAuthToken(
  manualApiKey?: string | null,
  envApiKey?: string | null,
  codexAuthRaw?: string | null,
) {
  const trimmedManual = manualApiKey?.trim()
  if (trimmedManual) {
    return trimmedManual
  }

  const trimmedEnv = envApiKey?.trim()
  if (trimmedEnv) {
    return trimmedEnv
  }

  if (!codexAuthRaw?.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(codexAuthRaw) as CodexAuthPayload
    const authApiKey = typeof parsed.OPENAI_API_KEY === 'string' ? parsed.OPENAI_API_KEY.trim() : ''
    if (authApiKey) {
      return authApiKey
    }

    const accessToken = typeof parsed.tokens?.access_token === 'string' ? parsed.tokens.access_token.trim() : ''
    return accessToken || null
  } catch {
    return null
  }
}

interface LocalCodexAccessPayload {
  enabled?: unknown
  port?: unknown
  apiKey?: unknown
}

export function resolveLocalCodexAccess(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as LocalCodexAccessPayload
    if (parsed.enabled !== true || typeof parsed.port !== 'number' || typeof parsed.apiKey !== 'string' || !parsed.apiKey.trim()) {
      return null
    }

    return {
      apiKey: parsed.apiKey.trim(),
      baseURL: `http://127.0.0.1:${parsed.port}/v1`,
    }
  } catch {
    return null
  }
}

export function resolveAnalyzerModel(usedLocalCodexAccess: boolean, envModel?: string | null) {
  const trimmedEnvModel = envModel?.trim()
  if (trimmedEnvModel) {
    return trimmedEnvModel
  }

  return usedLocalCodexAccess ? DEFAULT_LOCAL_CODEX_MODEL : DEFAULT_MODEL
}

interface BuildAnalysisResponseRequestOptions {
  model: string
  instructions: string
  userPrompt: string
  imageDataUrl: string
}

export function buildAnalysisResponseRequest(options: BuildAnalysisResponseRequestOptions) {
  return {
    model: options.model,
    instructions: options.instructions,
    input: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'input_text' as const,
            text: options.userPrompt,
          },
          {
            type: 'input_image' as const,
            detail: 'low' as const,
            image_url: options.imageDataUrl,
          },
        ],
      },
    ],
    max_output_tokens: 400,
    store: false,
  }
}

export function buildLocalCodexResponseRequest(options: BuildAnalysisResponseRequestOptions) {
  return {
    model: options.model,
    instructions: options.instructions,
    input: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'input_text' as const,
            text: options.userPrompt,
          },
          {
            type: 'input_image' as const,
            detail: 'low' as const,
            image_url: options.imageDataUrl,
          },
        ],
      },
    ],
    store: false,
    stream: true,
  }
}

export function extractLocalCodexOutputText(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  let collected = ''

  for (const line of trimmed.split(/\r?\n/)) {
    const cleanedLine = line.trim()
    if (!cleanedLine.startsWith('data:')) {
      continue
    }

    const payload = cleanedLine.slice(5).trim()
    if (!payload || payload === '[DONE]') {
      continue
    }

    try {
      const parsed = JSON.parse(payload) as {
        type?: unknown
        delta?: unknown
        response?: {
          output_text?: unknown
        }
      }

      if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
        collected += parsed.delta
        continue
      }

      if (!collected && parsed.type === 'response.completed' && typeof parsed.response?.output_text === 'string') {
        collected = parsed.response.output_text
      }
    } catch {
      continue
    }
  }

  return collected
}

async function createLocalCodexResponse(baseURL: string, apiKey: string, options: BuildAnalysisResponseRequestOptions) {
  const response = await fetch(`${baseURL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(buildLocalCodexResponseRequest(options)),
  })
  const rawText = await response.text()

  if (!response.ok) {
    throw new Error(rawText)
  }

  const outputText = extractLocalCodexOutputText(rawText)
  if (!outputText) {
    throw new Error('本地 Codex 接入没有返回可解析的文本结果。')
  }

  return outputText
}

function rewriteAnalyzerError(error: unknown, usedLocalCodexAccess: boolean) {
  if (!(error instanceof Error)) {
    return new Error('截图分析失败。')
  }

  if (usedLocalCodexAccess && error.message.includes('本地接入集合暂无账号')) {
    return new Error('Cockpit 的 Codex 本地接入当前没有可用账号。')
  }

  if (error.message.includes('Request timed out')) {
    return new Error('请求超时了，当前认证链路没有及时返回结果。')
  }

  if (usedLocalCodexAccess && error.message.includes('not supported when using Codex with a ChatGPT account')) {
    return new Error('当前 Codex 聊天账号不支持这个模型，应用会自动改用兼容模型。')
  }

  if (usedLocalCodexAccess && error.message.includes('Store must be set to false')) {
    return new Error('本地 Codex 接入要求 store=false，请升级到最新构建后再试。')
  }

  if (usedLocalCodexAccess && error.message.includes('Stream must be set to true')) {
    return new Error('本地 Codex 接入要求 stream=true，请升级到最新构建后再试。')
  }

  if (usedLocalCodexAccess && error.message.includes('Unsupported parameter: max_output_tokens')) {
    return new Error('本地 Codex 接入不支持 max_output_tokens，应用会自动使用兼容请求格式。')
  }

  return error
}

function fileBufferToDataUrl(buffer: Buffer, filePath: string) {
  const extension = filePath.toLowerCase().split('.').pop()
  const mimeType =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'gif'
          ? 'image/gif'
          : 'image/png'

  return `data:${mimeType};base64,${buffer.toString('base64')}`
}
