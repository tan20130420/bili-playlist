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

const UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]
const REFERER = 'https://www.bilibili.com/'

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range,Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges',
}

const API_HOSTS = ['https://api.bilibili.com', 'https://api.biliapi.net']

// ---------------- MD5（blueimp-md5，MIT） ----------------
function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff)
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
  return (msw << 16) | (lsw & 0xffff)
}
function bitRol(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt))
}
function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
}
function md5ff(a, b, c, d, x, s, t) {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t)
}
function md5gg(a, b, c, d, x, s, t) {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t)
}
function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t)
}
function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t)
}
function binlMD5(x, len) {
  x[len >> 5] |= 0x80 << len % 32
  x[(((len + 64) >>> 9) << 4) + 14] = len
  let i
  let olda
  let oldb
  let oldc
  let oldd
  let a = 1732584193
  let b = -271733879
  let c = -1732584194
  let d = 271733878
  for (i = 0; i < x.length; i += 16) {
    olda = a
    oldb = b
    oldc = c
    oldd = d
    a = md5ff(a, b, c, d, x[i], 7, -680876936)
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819)
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897)
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341)
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416)
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063)
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682)
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290)
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)

    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510)
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713)
    b = md5gg(b, c, d, a, x[i], 20, -373897302)
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691)
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335)
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438)
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961)
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467)
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473)
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)

    a = md5hh(a, b, c, d, x[i + 5], 4, -378558)
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562)
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060)
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632)
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174)
    d = md5hh(d, a, b, c, x[i], 11, -358537222)
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979)
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487)
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520)
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)

    a = md5ii(a, b, c, d, x[i], 6, -198630844)
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905)
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571)
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523)
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359)
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380)
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070)
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259)
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)

    a = safeAdd(a, olda)
    b = safeAdd(b, oldb)
    c = safeAdd(c, oldc)
    d = safeAdd(d, oldd)
  }
  return [a, b, c, d]
}
function binl2hex(input) {
  const hexTab = '0123456789abcdef'
  let output = ''
  for (let i = 0; i < input.length * 4; i += 1) {
    output +=
      hexTab.charAt((input[i >> 2] >> ((i % 4) * 8 + 4)) & 0x0f) +
      hexTab.charAt((input[i >> 2] >> ((i % 4) * 8)) & 0x0f)
  }
  return output
}
function str2binl(str) {
  // str 已是单字节序列（UTF-8 编码后）
  const output = []
  for (let i = 0; i < str.length; i += 1) {
    output[i >> 2] = output[i >> 2] || 0
    output[i >> 2] |= str.charCodeAt(i) << (i % 4) * 8
  }
  return output
}
function toUtf8(input) {
  let utf8 = ''
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i)
    if (c < 0x80) utf8 += String.fromCharCode(c)
    else if (c < 0x800) {
      utf8 += String.fromCharCode(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else {
      utf8 += String.fromCharCode(
        0xe0 | (c >> 12),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      )
    }
  }
  return utf8
}
function md5(input) {
  const utf8 = toUtf8(input)
  return binl2hex(binlMD5(str2binl(utf8), utf8.length * 8))
}

// ---------------- WBI 签名 ----------------

// B站公开的混淆表（从 img+sub 的 64 字符 key 派生 32 字符真实密钥）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
]

function getMixinKey(orig) {
  let str = ''
  for (const i of MIXIN_KEY_ENC_TAB) str += orig[i] || ''
  return str.slice(0, 32)
}

let wbiCache = { key: '', at: 0 }

/** 从 nav 接口获取 wbi 密钥（缓存一天） */
async function wbiKeys(fetcher, apiHosts, headersFn) {
  if (wbiCache.key && Date.now() - wbiCache.at < 86400_000) return wbiCache.key
  for (const host of apiHosts) {
    try {
      const res = await fetcher(`${host}/x/web-interface/nav`, { headers: headersFn(1) })
      const json = await res.json()
      const wbi = json?.data?.wbi_img
      if (!wbi?.img_url || !wbi?.sub_url) continue
      const img = wbi.img_url.split('/').pop().split('.')[0]
      const sub = wbi.sub_url.split('/').pop().split('.')[0]
      if (!img || !sub) continue
      wbiCache = { key: getMixinKey(img + sub), at: Date.now() }
      return wbiCache.key
    } catch {
      /* 换下一个域名 */
    }
  }
  return ''
}

/** 对参数做 WBI 签名，返回可拼接的查询字符串；wtsOverride 仅测试用 */
function wbiSign(params, mixinKey, wtsOverride) {
  if (!mixinKey) return null
  const wts = wtsOverride ?? Math.floor(Date.now() / 1000)
  const clean = { ...params, wts: String(wts) }
  // 过滤 value 中的 "!'()*" 字符（B站官方规则）
  for (const k of Object.keys(clean)) {
    clean[k] = String(clean[k]).replace(/[!'()*]/g, '')
  }
  const query = Object.keys(clean)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(clean[k])}`)
    .join('&')
  const wRid = md5(query + mixinKey)
  return `${query}&w_rid=${wRid}`
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

async function biliApi(path) {
  let attempt = 0
  for (let round = 0; round < 2; round += 1) {
    for (const host of API_HOSTS) {
      attempt += 1
      const headers = browserHeaders(attempt)
      const cookie = await getBuvid()
      if (cookie) headers.Cookie = cookie
      // WBI 签名（被风控 IP 未签名的请求会返回 -412）
      let reqPath = path
      if (path.includes('?')) {
        const [basePath, query] = path.split('?')
        const params = Object.fromEntries(new URLSearchParams(query))
        const key = await wbiKeys(fetch, API_HOSTS, browserHeaders)
        const signed = wbiSign(params, key)
        if (signed) reqPath = `${basePath}?${signed}`
      }
      let text = ''
      try {
        const res = await fetch(`${host}${reqPath}`, { headers })
        text = await res.text()
      } catch {
        continue
      }
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
    }
  }
  return null
}

async function resolveAudio({ bvid, aid, p }) {
  // view 接口用 aid，playurl 接口必须用 avid
  const viewId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${encodeURIComponent(aid)}`
  const playId = bvid ? `bvid=${encodeURIComponent(bvid)}` : `avid=${encodeURIComponent(aid)}`

  // 优先轻量 pagelist，被风控再用 view
  let cid = null
  let part = ''
  if (bvid) {
    const list = await biliApi(`/x/player/pagelist?bvid=${encodeURIComponent(bvid)}&jsonp=jsonp`)
    if (list && list.code === 0 && Array.isArray(list.data) && list.data.length) {
      const num = Math.max(1, Number(p) || 1)
      if (num > list.data.length) return { error: `该视频只有 ${list.data.length} 个分P` }
      cid = list.data[num - 1].cid
      part = list.data[num - 1].part || ''
    }
  }
  if (!cid) {
    const view = await biliApi(`/x/web-interface/view?${viewId}`)
    if (!view || view.code !== 0 || !view.data) {
      return { error: view?.message || '获取视频信息失败', step: 'view', detail: view ? JSON.stringify(view).slice(0, 200) : '' }
    }
    const pages = view.data.pages || []
    const num = Math.max(1, Number(p) || 1)
    if (pages.length && num > pages.length) {
      return { error: `该视频只有 ${pages.length} 个分P`, step: 'page' }
    }
    cid = pages[num - 1]?.cid || view.data.cid
    part = pages[num - 1]?.part || ''
  }
  if (!cid) return { error: '找不到该分P', step: 'page' }

  const play = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=16&fnver=0&fourk=1&platform=pc&high_quality=1`)
  let audio = null
  if (play && play.code === 0 && play.data) {
    const audios = play.data.dash?.audio || []
    if (audios.length) {
      audios.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))
      audio = { url: audios[0].baseUrl, backups: audios[0].backupUrl || [], bandwidth: audios[0].bandwidth || 0 }
    }
  }

  const play2 = await biliApi(`/x/player/playurl?${playId}&cid=${cid}&fnval=1&fnver=0&platform=html5&high_quality=1`)
  let mp4 = null
  if (play2 && play2.code === 0 && play2.data?.durl?.length) {
    const d = play2.data.durl[0]
    mp4 = { url: d.url, backups: d.backup_url || [], size: d.size || 0 }
  }

  if (!audio && !mp4) {
    return { error: play?.message || '该视频没有可用的音频流', step: 'dash' }
  }
  return { audio, mp4, cid, part }
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

  const bvid = url.searchParams.get('bvid') || ''
  const aid = url.searchParams.get('aid') || ''
  const p = url.searchParams.get('p') || '1'

  // 直链模式：只换地址，音频由客户端直连B站 CDN
  if (url.pathname === '/url') {
    if (!bvid && !aid) return json({ error: '缺少 bvid 或 aid 参数' }, 400)
    const info = await resolveAudio({ bvid, aid, p })
    if (info.error) return json(info, 502)
    return json({
      ok: true,
      cid: info.cid,
      part: info.part,
      mp4: info.mp4?.url ?? null,
      mp4Backups: info.mp4?.backups ?? [],
      mp4Size: info.mp4?.size ?? 0,
      audio: info.audio?.url ?? null,
      audioKbps: Math.round((info.audio?.bandwidth || 0) / 1000),
    })
  }

  if (url.pathname !== '/audio') {
    return new Response('Not Found. 可用路由：/health、/url、/audio', {
      status: 404,
      headers: CORS,
    })
  }

  if (!bvid && !aid) return json({ error: '缺少 bvid 或 aid 参数' }, 400)

  const info = await resolveAudio({ bvid, aid, p })
  if (info.error) return json(info, 502)
  if (!info.audio) return json({ error: '该视频没有独立音频流，请改用直链模式', step: 'dash' }, 502)

  const candidates = [info.audio.url, ...(info.audio.backups || [])]
  let upstream = null
  let lastStatus = 0
  const range = request.headers.get('Range')

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: {
          'User-Agent': UAS[0],
          Referer: REFERER,
          Accept: '*/*',
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
