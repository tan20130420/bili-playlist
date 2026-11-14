/**
 * B歌单 - 音频代理 Worker
 *
 * 作用：把B站视频的 DASH 音频流代理出来，让浏览器 <audio> 能播放，
 * 从而实现「纯音频播放」和「手机锁屏后台播放」。
 *
 * 为什么需要它：B站音频 CDN 校验 Referer，浏览器里的 <audio> 无法伪造 Referer，
 * 且 playurl 接口需要 buvid cookie 才不被风控。Worker 可以带上正确的请求头。
 *
 * 路由：
 *   GET /health                    健康检查
 *   GET /audio?bvid=BVxxx&p=1      返回音频流（支持 Range，可拖动进度）
 *   GET /audio?aid=123&p=1         同上，用 av 号
 *
 * 部署：见同目录 README.md
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const REFERER = 'https://www.bilibili.com/'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
}

let cachedBuvid = ''

async function getBuvid() {
  if (cachedBuvid) return cachedBuvid
  const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
    headers: { 'User-Agent': UA, Referer: REFERER },
  })
  const json = await res.json()
  cachedBuvid = json?.data?.b_3 || ''
  return cachedBuvid
}

/** 请求B站 API，遇到风控（返回 HTML）时带上 buvid 重试 */
async function biliApi(path) {
  const url = `https://api.bilibili.com${path}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { 'User-Agent': UA, Referer: REFERER }
    if (attempt === 1) {
      const b3 = await getBuvid()
      if (b3) headers.Cookie = `buvid3=${b3}`
    }
    const res = await fetch(url, { headers })
    const text = await res.text()
    if (text.trim().startsWith('<')) continue // 风控页，重试
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  return null
}

async function resolveAudio({ bvid, aid, p }) {
  // view 接口用 aid，playurl 接口必须用 avid
  const viewId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`
  const playId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `avid=${encodeURIComponent(aid)}`
  const view = await biliApi(`/x/web-interface/view?${viewId}`)
  if (!view || view.code !== 0 || !view.data) {
    return { error: view?.message || '获取视频信息失败' }
  }
  const pages = view.data.pages || []
  const pageNum = Math.max(1, Number(p) || 1)
  const target = pages[pageNum - 1]
  const cid = target?.cid || view.data.cid
  if (!cid) return { error: '找不到该分P' }
  if (pages.length && pageNum > pages.length) {
    return { error: `该视频只有 ${pages.length} 个分P` }
  }

  const play = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=16&fnver=0&fourk=1`)
  if (!play || play.code !== 0 || !play.data) {
    return { error: play?.message || '获取播放地址失败' }
  }
  const audios = play.data.dash?.audio || []
  if (!audios.length) return { error: '该视频没有可用的音频流' }
  // 选码率最高的一条
  audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
  return {
    url: audios[0].baseUrl,
    backups: audios[0].backupUrl || [],
    title: target?.part ? `${view.data.title} - ${target.part}` : view.data.title,
    duration: play.data.dash?.duration || view.data.duration || 0,
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (url.pathname !== '/audio') {
      return new Response('Not Found. 可用路由：/health、/audio?bvid=BVxxx&p=1', {
        status: 404,
        headers: CORS,
      })
    }

    const bvid = url.searchParams.get('bvid') || ''
    const aid = url.searchParams.get('aid') || ''
    const p = url.searchParams.get('p') || '1'
    if (!bvid && !aid) {
      return new Response(JSON.stringify({ error: '缺少 bvid 或 aid 参数' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const info = await resolveAudio({ bvid, aid, p })
    if (info.error) {
      return new Response(JSON.stringify(info), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const candidates = [info.url, ...(info.backups || [])]
    let upstream = null
    let lastStatus = 0
    for (const candidate of candidates) {
      const range = request.headers.get('Range')
      const res = await fetch(candidate, {
        headers: {
          'User-Agent': UA,
          Referer: REFERER,
          ...(range ? { Range: range } : {}),
        },
      })
      lastStatus = res.status
      if (res.ok || res.status === 206) {
        upstream = res
        break
      }
    }

    if (!upstream) {
      return new Response(JSON.stringify({ error: `音频源不可用（${lastStatus}）` }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const headers = new Headers(CORS)
    headers.set('Content-Type', 'audio/mp4')
    headers.set('Accept-Ranges', 'bytes')
    const len = upstream.headers.get('Content-Length')
    const rangeHeader = upstream.headers.get('Content-Range')
    if (len) headers.set('Content-Length', len)
    if (rangeHeader) headers.set('Content-Range', rangeHeader)
    headers.set('Cache-Control', 'public, max-age=3600')

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  },
}
