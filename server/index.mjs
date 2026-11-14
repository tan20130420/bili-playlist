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

const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]
const UA = UAS[0]
const REFERER = 'https://www.bilibili.com/'
const API_HOSTS = ['https://api.bilibili.com', 'https://api.biliapi.net']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
}

let cachedBuvid = ''
let buvidAt = 0

async function getBuvid() {
  if (cachedBuvid && Date.now() - buvidAt < 1800_000) return cachedBuvid
  for (const host of API_HOSTS) {
    try {
      const res = await fetch(`${host}/x/frontend/finger/spi`, {
        headers: { 'User-Agent': UA, Referer: REFERER },
      })
      const json = await res.json()
      const b3 = json?.data?.b_3 || ''
      const b4 = json?.data?.b_4 || ''
      if (!b3) continue
      const now = Math.floor(Date.now() / 1000)
      cachedBuvid = [
        `buvid3=${b3}`,
        b4 ? `buvid4=${encodeURIComponent(b4)}` : '',
        `b_nut=${now}`,
        `b_lsid=${now.toString(16).toUpperCase()}`,
      ]
        .filter(Boolean)
        .join('; ')
      buvidAt = Date.now()
      return cachedBuvid
    } catch {
      /* 下一个域名 */
    }
  }
  return ''
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

/** 请求B站 API：多域名 × 多指纹 × 两轮重试，应对 -412 风控 */
async function biliApi(path) {
  let attempt = 0
  for (let round = 0; round < 2; round += 1) {
    for (const host of API_HOSTS) {
      attempt += 1
      const headers = await (async () => {
        const h = browserHeaders(attempt)
        const c = await getBuvid()
        if (c) h.Cookie = c
        return h
      })()
      try {
        const res = await fetch(`${host}${path}`, { headers })
        const text = await res.text()
        const trimmed = text.trim()
        if (trimmed.startsWith('<')) continue
        let json
        try {
          json = JSON.parse(trimmed)
        } catch {
          continue
        }
        if (json.code === 0) return json
        if (json.code !== -412 && json.code !== -352) return json
        cachedBuvid = ''
      } catch {
        /* 下一个 */
      }
    }
  }
  return null
}

async function resolveAudio({ bvid, aid, p }) {
  // view 接口用 aid，playurl 接口必须用 avid，写错会返回 -400 请求错误
  const viewId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`
  const playId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `avid=${encodeURIComponent(aid)}`

  // 优先用更轻量的 pagelist 取 cid，被风控时再用 view
  let cid = null
  let part = ''
  let failInfo = null
  if (bvid) {
    const list = await biliApi(`/x/player/pagelist?bvid=${encodeURIComponent(bvid)}&jsonp=jsonp`)
    if (list && list.code === 0 && Array.isArray(list.data) && list.data.length) {
      const num = Math.max(1, Number(p) || 1)
      if (num > list.data.length) return { error: `该视频只有 ${list.data.length} 个分P` }
      cid = list.data[num - 1].cid
      part = list.data[num - 1].part || ''
    } else {
      failInfo = list
    }
  }
  if (!cid) {
    const view = await biliApi(`/x/web-interface/view?${viewId}`)
    if (!view || view.code !== 0 || !view.data) {
      return { error: view?.message || failInfo?.message || '获取视频信息失败' }
    }
    const pages = view.data.pages || []
    const pageNum = Math.max(1, Number(p) || 1)
    if (pages.length && pageNum > pages.length) {
      return { error: `该视频只有 ${pages.length} 个分P` }
    }
    cid = pages[pageNum - 1]?.cid || view.data.cid
    part = pages[pageNum - 1]?.part || ''
  }
  if (!cid) return { error: '找不到该分P' }

  // DASH 纯音频（需 Referer，只能走 /audio 代理）
  const play = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=16&fnver=0&fourk=1&platform=pc&high_quality=1`)
  let audio = null
  if (play && play.code === 0 && play.data) {
    const audios = play.data.dash?.audio || []
    if (audios.length) {
      audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
      audio = { url: audios[0].baseUrl, backups: audios[0].backupUrl || [], bandwidth: audios[0].bandwidth || 0 }
    }
  }

  // MP4 直链（不需 Referer，浏览器可直连）
  const play2 = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=1&fnver=0&platform=html5&high_quality=1`)
  let mp4 = null
  if (play2 && play2.code === 0 && play2.data?.durl?.length) {
    const d = play2.data.durl[0]
    mp4 = { url: d.url, backups: d.backup_url || [], size: d.size || 0 }
  }

  if (!audio && !mp4) {
    return { error: play?.message || '该视频没有可用的音频流' }
  }
  return { audio, mp4, cid, part }
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

  const bvid = url.searchParams.get('bvid') || ''
  const aid = url.searchParams.get('aid') || ''
  const p = url.searchParams.get('p') || '1'

  // 直链模式：只换地址，音频由客户端直连B站 CDN
  if (url.pathname === '/url') {
    if (!bvid && !aid) {
      sendJson(res, { error: '缺少 bvid 或 aid 参数' }, 400)
      return
    }
    const info = await resolveAudio({ bvid, aid, p })
    if (info.error) {
      sendJson(res, info, 502)
      return
    }
    sendJson(res, {
      ok: true,
      cid: info.cid,
      part: info.part,
      mp4: info.mp4?.url ?? null,
      mp4Backups: info.mp4?.backups ?? [],
      mp4Size: info.mp4?.size ?? 0,
      audio: info.audio?.url ?? null,
      audioKbps: Math.round((info.audio?.bandwidth || 0) / 1000),
    })
    return
  }

  if (url.pathname !== '/audio') {
    res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found. 可用路由：/health、/url、/audio')
    return
  }

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
    if (!info.audio) {
      sendJson(res, { error: '该视频没有独立音频流，请改用直链模式', step: 'dash' }, 502)
      return
    }

    const candidates = [info.audio.url, ...(info.audio.backups || [])]
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
