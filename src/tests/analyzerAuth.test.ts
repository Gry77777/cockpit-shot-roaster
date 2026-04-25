// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  buildAnalysisResponseRequest,
  buildLocalCodexResponseRequest,
  extractLocalCodexOutputText,
  resolveAnalyzerAuthToken,
  resolveAnalyzerModel,
  resolveLocalCodexAccess,
} from '../../electron/services/analyzerService'

describe('resolveAnalyzerAuthToken', () => {
  it('falls back to the current Codex access token when no API key is provided', () => {
    const result = resolveAnalyzerAuthToken(
      undefined,
      '',
      JSON.stringify({
        OPENAI_API_KEY: null,
        tokens: {
          access_token: 'codex-access-token',
        },
      }),
    )

    expect(result).toBe('codex-access-token')
  })
})

describe('resolveLocalCodexAccess', () => {
  it('extracts the local Codex bridge settings from cockpit config', () => {
    const result = resolveLocalCodexAccess(
      JSON.stringify({
        enabled: true,
        port: 11070,
        apiKey: 'agt_codex_demo',
      }),
    )

    expect(result).toEqual({
      apiKey: 'agt_codex_demo',
      baseURL: 'http://127.0.0.1:11070/v1',
    })
  })
})

describe('resolveAnalyzerModel', () => {
  it('switches to a ChatGPT-account-safe model when using the local Codex bridge', () => {
    expect(resolveAnalyzerModel(true, '')).toBe('gpt-5.4-mini')
  })

  it('keeps the regular default model when local Codex bridge is not used', () => {
    expect(resolveAnalyzerModel(false, '')).toBe('gpt-4.1-mini')
  })
})

describe('buildAnalysisResponseRequest', () => {
  it('forces store=false so the local Codex bridge accepts the request', () => {
    const result = buildAnalysisResponseRequest({
      model: 'gpt-5.4-mini',
      instructions: 'Return JSON.',
      userPrompt: 'Analyze this screenshot.',
      imageDataUrl: 'data:image/png;base64,abc',
    })

    expect(result).toMatchObject({
      model: 'gpt-5.4-mini',
      instructions: 'Return JSON.',
      store: false,
      max_output_tokens: 400,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Analyze this screenshot.',
            },
            {
              type: 'input_image',
              detail: 'low',
              image_url: 'data:image/png;base64,abc',
            },
          ],
        },
      ],
    })
  })
})

describe('buildLocalCodexResponseRequest', () => {
  it('uses the local bridge streaming format without unsupported fields', () => {
    const result = buildLocalCodexResponseRequest({
      model: 'gpt-5.4-mini',
      instructions: 'Return JSON.',
      userPrompt: 'Analyze this screenshot.',
      imageDataUrl: 'data:image/png;base64,abc',
    })

    expect(result).toMatchObject({
      model: 'gpt-5.4-mini',
      instructions: 'Return JSON.',
      store: false,
      stream: true,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Analyze this screenshot.',
            },
            {
              type: 'input_image',
              detail: 'low',
              image_url: 'data:image/png;base64,abc',
            },
          ],
        },
      ],
    })

    expect(result).not.toHaveProperty('max_output_tokens')
  })
})

describe('extractLocalCodexOutputText', () => {
  it('rebuilds the final text from streamed delta events', () => {
    const result = extractLocalCodexOutputText(`
event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"{\\"roast\\":\\"hi","sequence_number":1}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":" there\\",\\"summary\\":\\"ok\\",\\"titles\\":[\\"a\\",\\"b\\",\\"c\\"]}","sequence_number":2}
`)

    expect(result).toBe('{"roast":"hi there","summary":"ok","titles":["a","b","c"]}')
  })
})
