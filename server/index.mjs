/**
 * B歌单 - 音频代理（通用 Node 版，零依赖）
 *
 * 适用平台：Koyeb / Render / Railway / Zeabur / 自建 VPS / 腾讯云函数容器
 * 运行要求：Node.js 18+（需要内置 fetch）
 *
 * 启动：
 *   node server/index.mjs
 *   或 PORT=8080 node server/index.mjs
 *
 * 路由：
 *   GET /health                    健康检查
 *   GET /audio?bvid=BVxxx&p=1      返回B站 DASH 音频流（支持 Range 拖动）
 *   GET /audio?aid=123&p=1
 */

import http from 'node:http'

const PORT = Number(process.env.PORT) || 8080

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
  // 注意：view 接口用 aid，playurl 接口必须用 avid，写错会返回 -400 请求错误
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
  return { url: audios[0].baseUrl, backups: audios[0].backupUrl || [] }
}

function sendJson(res, body, status = 200) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  })
  res.end(data)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  if (url.pathname === '/health') {
    sendJson(res, { ok: true })
    return
  }

  if (url.pathname !== '/audio') {
    res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found. 可用路由：/health、/audio?bvid=BVxxx&p=1')
    return
  }

  const bvid = url.searchParams.get('bvid') || ''
  const aid = url.searchParams.get('aid') || ''
  const p = url.searchParams.get('p') || '1'
  if (!bvid && !aid) {
    sendJson(res, { error: '缺少 bvid 或 aid 参数' }, 400)
    return
  }

  try {
    const info = await resolveAudio({ bvid, aid, p })
    if (info.error) {
      sendJson(res, info, 502)
      return
    }

    const candidates = [info.url, ...(info.backups || [])]
    const range = req.headers.range
    let upstream = null
    let lastStatus = 0

    for (const candidate of candidates) {
      try {
        const r = await fetch(candidate, {
          headers: {
            'User-Agent': UA,
            Referer: REFERER,
            ...(range ? { Range: range } : {}),
          },
        })
        lastStatus = r.status
        if (r.ok || r.status === 206) {
          upstream = r
          break
        }
      } catch {
        lastStatus = 0
      }
    }

    if (!upstream) {
      sendJson(res, { error: `音频源不可用（${lastStatus}）` }, 502)
      return
    }

    const headers = {
      ...CORS,
      'Content-Type': 'audio/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    const len = upstream.headers.get('content-length')
    const rangeHeader = upstream.headers.get('content-range')
    if (len) headers['Content-Length'] = len
    if (rangeHeader) headers['Content-Range'] = rangeHeader

    res.writeHead(upstream.status, headers)

    // HEAD 请求只要响应头，避免客户端按 body 解析出错
    if (req.method === 'HEAD' || !upstream.body) {
      res.end()
      return
    }
    // 流式转发，边下边播，不占内存
    const reader = upstream.body.getReader()
    const pump = async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once('drain', resolve))
        }
        if (res.destroyed) break
      }
      res.end()
    }
    pump().catch(() => {
      if (!res.destroyed) res.end()
    })
    req.on('close', () => {
      reader.cancel().catch(() => {})
    })
  } catch (e) {
    sendJson(res, { error: e instanceof Error ? e.message : '服务器异常' }, 500)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`B歌单音频代理已启动：http://0.0.0.0:${PORT}`)
  console.log(`  健康检查  /health`)
  console.log(`  音频流    /audio?bvid=BV1xx411c7mD&p=1`)
})
