const CARD_WIDTH = 1600
const CARD_HEIGHT = 960

interface ShareCardPayload {
  previewDataUrl: string
  toneLabel: string
  accountEmail: string | null
  roast: string
  summary: string
  titles: string[]
}

export function buildShareCardSvg(payload: ShareCardPayload) {
  const roastLines = wrapText(payload.roast, 18, 6)
  const summaryLines = wrapText(payload.summary, 24, 4)
  const titleLines = payload.titles.slice(0, 3).map((title, index) => `${index + 1}. ${title}`)
  const accountText = payload.accountEmail?.trim() || '未知账号'
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false })

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#120f16" />
        <stop offset="45%" stop-color="#10161c" />
        <stop offset="100%" stop-color="#1b0f10" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#f7a76a" />
        <stop offset="100%" stop-color="#7ed6ff" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="20" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <clipPath id="shotClip">
        <rect x="72" y="98" width="760" height="522" rx="36" ry="36" />
      </clipPath>
    </defs>

    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="44" fill="url(#bg)" />
    <circle cx="180" cy="120" r="160" fill="#f7a76a" fill-opacity="0.08" filter="url(#glow)" />
    <circle cx="1410" cy="120" r="140" fill="#7ed6ff" fill-opacity="0.08" filter="url(#glow)" />
    <rect x="38" y="38" width="${CARD_WIDTH - 76}" height="${CARD_HEIGHT - 76}" rx="40" fill="none" stroke="rgba(255,255,255,0.12)" />

    <text x="72" y="86" fill="#f7a76a" font-size="24" letter-spacing="6" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">SCREENSHOT ROASTER</text>
    <text x="72" y="690" fill="#fff4e7" font-size="70" font-weight="800" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">截图吐槽机</text>
    <text x="72" y="740" fill="#c9c6be" font-size="28" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">拖一张图，吐一句槽，顺手导出分享卡。</text>

    <image href="${payload.previewDataUrl}" x="72" y="98" width="760" height="522" preserveAspectRatio="xMidYMid slice" clip-path="url(#shotClip)" />
    <rect x="72" y="98" width="760" height="522" rx="36" fill="none" stroke="rgba(255,255,255,0.12)" />

    <rect x="882" y="94" width="646" height="334" rx="34" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
    <text x="922" y="152" fill="#f7a76a" font-size="22" letter-spacing="4" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">一句吐槽</text>
    ${renderTextBlock(roastLines, 922, 214, 52, 22, '#fff7ed', 44)}

    <rect x="882" y="454" width="306" height="224" rx="28" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.08)" />
    <text x="914" y="506" fill="#f7a76a" font-size="20" letter-spacing="3" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">正经总结</text>
    ${renderTextBlock(summaryLines, 914, 552, 32, 16, '#ddd8cd', 28)}

    <rect x="1212" y="454" width="316" height="224" rx="28" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.08)" />
    <text x="1244" y="506" fill="#7ed6ff" font-size="20" letter-spacing="3" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">分享标题</text>
    ${renderTextBlock(titleLines, 1244, 552, 26, 16, '#eef7ff', 26)}

    <rect x="882" y="716" width="646" height="166" rx="30" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
    <rect x="918" y="752" width="136" height="42" rx="21" fill="url(#accent)" />
    <text x="986" y="780" text-anchor="middle" fill="#181311" font-size="22" font-weight="700" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">${escapeXml(payload.toneLabel)}</text>
    <text x="918" y="834" fill="#9fdfff" font-size="22" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">当前账号</text>
    <text x="918" y="868" fill="#ffffff" font-size="28" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">${escapeXml(accountText)}</text>
    <text x="1528" y="868" text-anchor="end" fill="#a8a39a" font-size="20" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">${escapeXml(exportedAt)}</text>
  </svg>
  `.trim()
}

export function buildShareCardFileName() {
  const now = new Date()
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `shot-roaster-${date}-${time}.png`
}

function pad(value: number) {
  return value.toString().padStart(2, '0')
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function wrapText(text: string, charsPerLine: number, maxLines: number) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ['']
  }

  const lines: string[] = []
  let current = ''

  for (const char of normalized) {
    current += char
    if (current.length >= charsPerLine) {
      lines.push(current)
      current = ''
      if (lines.length === maxLines) {
        break
      }
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current)
  }

  if (lines.length === 0) {
    lines.push(normalized.slice(0, charsPerLine))
  }

  if (lines.length === maxLines && normalized.length > lines.join('').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, charsPerLine - 1))}…`
  }

  return lines
}

function renderTextBlock(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  fontWeight: number,
  fill: string,
  lineHeight: number,
) {
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="Microsoft YaHei UI, PingFang SC, sans-serif">${tspans}</text>`
}
