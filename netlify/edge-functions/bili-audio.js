/**
 * B歌单 - 音频代理（Netlify Edge Function 版）
 *
 * 为什么有这个版本：*.workers.dev 在国内部分网络被阻断（TLS 握手被重置），
 * 而 *.netlify.app 使用 Netlify 自有 CDN，国内可直连，因此手机无需开代理即可播放。
 *
 * 路由：
 *   GET /health                    健康检查
 *   GET /audio?bvid=BVxxx&p=1      返回音频流（支持 Range）
 *   GET /audio?aid=123&p=1
 */

export const config = {
  path: ['/audio', '/health'],
}

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
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
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': UA, Referer: REFERER },
    })
    const json = await res.json()
    cachedBuvid = json?.data?.b_3 || ''
  } catch {
    cachedBuvid = ''
  }
  return cachedBuvid
}

/** 请求B站 API；遇到风控页（返回 HTML）时带 buvid 重试 */
async function biliApi(path) {
  const url = `https://api.bilibili.com${path}`
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = { 'User-Agent': UA, Referer: REFERER }
    if (attempt === 1) {
      const b3 = await getBuvid()
      if (b3) headers.Cookie = `buvid3=${b3}`
    }
    let text = ''
    try {
      const res = await fetch(url, { headers })
      text = await res.text()
    } catch {
      return null
    }
    if (text.trim().startsWith('<')) continue
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
  if (pages.length && pageNum > pages.length) {
    return { error: `该视频只有 ${pages.length} 个分P` }
  }
  const target = pages[pageNum - 1]
  const cid = target?.cid || view.data.cid
  if (!cid) return { error: '找不到该分P' }

  const play = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=16&fnver=0&fourk=1`)
  if (!play || play.code !== 0 || !play.data) {
    return { error: play?.message || '获取播放地址失败' }
  }
  const audios = play.data.dash?.audio || []
  if (!audios.length) return { error: '该视频没有可用的音频流' }
  audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
  return {
    url: audios[0].baseUrl,
    backups: audios[0].backupUrl || [],
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export default async function handler(request) {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (url.pathname === '/health') {
    return json({ ok: true })
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
  if (!bvid && !aid) return json({ error: '缺少 bvid 或 aid 参数' }, 400)

  const info = await resolveAudio({ bvid, aid, p })
  if (info.error) return json(info, 502)

  const candidates = [info.url, ...(info.backups || [])]
  let upstream = null
  let lastStatus = 0
  const range = request.headers.get('Range')

  for (const candidate of candidates) {
    try {
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
    } catch {
      lastStatus = 0
    }
  }

  if (!upstream) {
    return json({ error: `音频源不可用（${lastStatus}）` }, 502)
  }

  const headers = new Headers(CORS)
  headers.set('Content-Type', 'audio/mp4')
  headers.set('Accept-Ranges', 'bytes')
  const len = upstream.headers.get('Content-Length')
  const rangeHeader = upstream.headers.get('Content-Range')
  if (len) headers.set('Content-Length', len)
  if (rangeHeader) headers.set('Content-Range', rangeHeader)
  // 音频直链有时效，不能长缓存
  headers.set('Cache-Control', 'no-store')

  return new Response(upstream.body, { status: upstream.status, headers })
}
