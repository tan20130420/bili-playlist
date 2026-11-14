/**
 * B歌单 - 音频代理 Worker（Cloudflare）
 *
 * 作用：把B站视频的 DASH 音频流代理出来，让浏览器 <audio> 能播放，
 * 从而实现「纯音频播放」和「手机锁屏后台播放」。
 *
 * 为什么需要它：B站音频 CDN 校验 Referer，浏览器里的 <audio> 无法伪造 Referer，
 * 且 playurl 接口需要 buvid cookie 才不被风控。
 *
 * 路由：
 *   GET /health                     健康检查
 *   GET /audio?bvid=BVxxx&p=1       返回音频流（支持 Range，可拖动进度）
 *   GET /audio?aid=123&p=1          同上，用 av 号
 *   GET /debug?bvid=BVxxx&p=1       诊断：返回每一步B站接口的真实状态
 *
 * 部署：见同目录 README.md
 */

// Cloudflare 机房 IP 容易被B站风控，用真实移动端 UA + 完整浏览器头降低概率
const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]
const REFERER = 'https://www.bilibili.com/'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
}

let cachedCookie = ''
let cookieAt = 0

/** 取一组 buvid，用于通过风控校验 */
async function getCookie() {
  if (cachedCookie && Date.now() - cookieAt < 3600_000) return cachedCookie
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: browserHeaders(0),
    })
    const json = await res.json()
    const b3 = json?.data?.b_3 || ''
    const b4 = json?.data?.b_4 || ''
    const parts = []
    if (b3) parts.push(`buvid3=${b3}`)
    if (b4) parts.push(`buvid4=${b4}`)
    parts.push('b_nut=' + Math.floor(Date.now() / 1000))
    cachedCookie = parts.join('; ')
    cookieAt = Date.now()
  } catch {
    cachedCookie = ''
  }
  return cachedCookie
}

function browserHeaders(uaIndex) {
  return {
    'User-Agent': UAS[uaIndex % UAS.length],
    Referer: REFERER,
    Origin: 'https://www.bilibili.com',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  }
}

/** 请求B站 API：返回 { ok, json, status, raw } */
async function biliApi(path) {
  const url = `https://api.bilibili.com${path}`
  let last = { ok: false, json: null, status: 0, raw: '' }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const headers = browserHeaders(attempt)
    const cookie = await getCookie()
    if (cookie) headers.Cookie = cookie
    try {
      const res = await fetch(url, { headers })
      const text = await res.text()
      last = { ok: res.ok, status: res.status, raw: text.slice(0, 300), json: null }
      const trimmed = text.trim()
      // 风控页返回 HTML，换一组头再试
      if (trimmed.startsWith('<')) continue
      try {
        const json = JSON.parse(trimmed)
        last.json = json
        if (json.code === 0) return last
        // -412 被风控、-400 参数错，前者重试
        if (json.code !== -412) return last
      } catch {
        /* 解析失败，重试 */
      }
    } catch (e) {
      last = { ok: false, status: 0, raw: String(e).slice(0, 200), json: null }
    }
  }
  return last
}

async function resolveAudio({ bvid, aid, p }) {
  // view 接口用 aid，playurl 接口必须用 avid，写错会返回 -400
  const viewId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`
  const playId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `avid=${encodeURIComponent(aid)}`

  const view = await biliApi(`/x/web-interface/view?${viewId}`)
  if (!view.json || view.json.code !== 0 || !view.json.data) {
    return {
      error: view.json?.message || `获取视频信息失败（HTTP ${view.status}）`,
      step: 'view',
      detail: view.raw,
    }
  }

  const pages = view.json.data.pages || []
  const pageNum = Math.max(1, Number(p) || 1)
  if (pages.length && pageNum > pages.length) {
    return { error: `该视频只有 ${pages.length} 个分P`, step: 'page' }
  }
  const target = pages[pageNum - 1]
  const cid = target?.cid || view.json.data.cid
  if (!cid) return { error: '找不到该分P', step: 'page' }

  const play = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=16&fnver=0&fourk=1`)
  if (!play.json || play.json.code !== 0 || !play.json.data) {
    return {
      error: play.json?.message || `获取播放地址失败（HTTP ${play.status}）`,
      step: 'playurl',
      detail: play.raw,
    }
  }

  const audios = play.json.data.dash?.audio || []
  if (!audios.length) {
    // 部分视频没有 dash，尝试 MP4（需自己有音轨）
    return { error: '该视频没有可用的音频流（可能为纯音乐区特殊稿件）', step: 'dash' }
  }
  audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
  return {
    url: audios[0].baseUrl,
    backups: audios[0].backupUrl || [],
    title: target?.part ? `${view.json.data.title} - ${target.part}` : view.json.data.title,
    bandwidth: audios[0].bandwidth,
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (url.pathname === '/health') {
      return json({ ok: true })
    }

    const bvid = url.searchParams.get('bvid') || ''
    const aid = url.searchParams.get('aid') || ''
    const p = url.searchParams.get('p') || '1'

    // 诊断接口：不返回音频，只返回每一步的真实结果
    if (url.pathname === '/debug') {
      if (!bvid && !aid) return json({ error: '缺少 bvid 或 aid 参数' }, 400)
      const viewId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`
      const view = await biliApi(`/x/web-interface/view?${viewId}`)
      const info = await resolveAudio({ bvid, aid, p })
      return json({
        ok: !info.error,
        cookie: (await getCookie()).slice(0, 60),
        view: {
          status: view.status,
          code: view.json?.code,
          message: view.json?.message,
          title: view.json?.data?.title,
          raw: view.raw,
        },
        resolve: info,
      })
    }

    if (url.pathname !== '/audio') {
      return new Response(
        'Not Found. 可用路由：/health、/audio?bvid=BVxxx&p=1、/debug?bvid=BVxxx',
        { status: 404, headers: CORS },
      )
    }

    if (!bvid && !aid) return json({ error: '缺少 bvid 或 aid 参数' }, 400)

    const info = await resolveAudio({ bvid, aid, p })
    if (info.error) {
      return json({ error: info.error, step: info.step, detail: info.detail }, 502)
    }

    const candidates = [info.url, ...(info.backups || [])]
    let upstream = null
    let lastStatus = 0
    const range = request.headers.get('Range')

    for (const candidate of candidates) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await fetch(candidate, {
            headers: {
              'User-Agent': UAS[attempt % UAS.length],
              Referer: REFERER,
              Accept: '*/*',
              'Accept-Language': 'zh-CN,zh;q=0.9',
              ...(range ? { Range: range } : {}),
            },
          })
          lastStatus = res.status
          if (res.ok || res.status === 206) {
            upstream = res
            break
          }
        } catch {
          lastStatus = 0
        }
      }
      if (upstream) break
    }

    if (!upstream) {
      return json({ error: `音频源不可用（${lastStatus}）`, step: 'cdn' }, 502)
    }

    const headers = new Headers(CORS)
    headers.set('Content-Type', 'audio/mp4')
    headers.set('Accept-Ranges', 'bytes')
    const len = upstream.headers.get('Content-Length')
    const rangeHeader = upstream.headers.get('Content-Range')
    if (len) headers.set('Content-Length', len)
    if (rangeHeader) headers.set('Content-Range', rangeHeader)
    headers.set('Cache-Control', 'no-store')

    if (request.method === 'HEAD') {
      return new Response(null, { status: upstream.status, headers })
    }

    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
