import type { ParsedLink } from '../types'

/**
 * 解析B站视频链接，支持：
 * - BV号: BV1xx411c7mD / bilibili.com/video/BV1xx411c7mD
 * - av号: av170001 / bilibili.com/video/av170001
 * - 分P: 任意上述链接 + ?p=2 或 &p=2
 * - 粘贴带参数的分享短链接 b23.tv 无法在前端解析，提示使用完整链接
 */
export function parseBiliLink(input: string, defaultPage = 1): ParsedLink {
  const raw = input.trim()
  if (!raw) {
    return { kind: 'video', page: 1, valid: false, error: '请粘贴B站视频链接或BV号' }
  }
  if (/^https?:\/\/b23\.tv/i.test(raw)) {
    return {
      kind: 'video',
      page: 1,
      valid: false,
      error: '不支持 b23.tv 短链接，请在浏览器打开后复制完整 video 链接',
    }
  }

  // 直接粘贴纯 ID
  let bvid: string | undefined
  let aid: string | undefined

  const pureBv = raw.match(/^(BV[0-9A-Za-z]{10})$/)
  const pureAv = raw.match(/^av(\d+)$/i)
  if (pureBv) bvid = pureBv[1]
  if (pureAv) aid = pureAv[1]

  if (!bvid && !aid) {
    // 从 URL 提取
    let url: URL | null = null
    try {
      url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    } catch {
      url = null
    }
    if (!url || !/bilibili\.com$/i.test(url.hostname)) {
      return { kind: 'video', page: 1, valid: false, error: '无法识别，请粘贴 bilibili.com 的视频链接' }
    }
    const m = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i)
    if (!m) {
      return { kind: 'video', page: 1, valid: false, error: '链接中未找到视频 ID（BV号或av号）' }
    }
    if (/^BV/i.test(m[1])) bvid = m[1]
    else aid = m[1].replace(/^av/i, '')
  }

  // 分P参数
  let page = defaultPage
  try {
    const url2 = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    const p = url2.searchParams.get('p')
    if (p) {
      const n = parseInt(p, 10)
      if (!Number.isNaN(n) && n > 0) page = n
    }
  } catch {
    /* 纯 ID 无分P */
  }

  return { kind: 'video', bvid, aid, page, valid: true }
}

/** 生成 iframe 播放地址 */
export function playerSrc(song: { bvid?: string; aid?: string; page: number }, autoplay: boolean): string {
  const id = song.bvid ? `bvid=${song.bvid}` : song.aid ? `aid=${song.aid}` : ''
  return `https://player.bilibili.com/player.html?${id}&p=${song.page}&autoplay=${autoplay ? 1 : 0}&danmaku=0&high_quality=1&loop=0`
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
