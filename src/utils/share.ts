import type { Playlist } from '../types'

/**
 * 歌单分享码：把歌单压缩后放进 URL hash / 二维码，完全脱离账号与网络即可恢复。
 * 优先用 CompressionStream(deflate-raw) 压缩，浏览器不支持时降级为不压缩 base64。
 */

interface SharePayload {
  v: 1
  n?: string // 歌单名
  s: Array<[string, string | null, number, string | null]> // [标题, bvid, page, aid]
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const cs = new CompressionStream('deflate-raw')
    const buf = data.slice().buffer as ArrayBuffer
    const stream = new Blob([buf]).stream().pipeThrough(cs)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const ds = new DecompressionStream('deflate-raw')
    const buf = data.slice().buffer as ArrayBuffer
    const stream = new Blob([buf]).stream().pipeThrough(ds)
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch {
    return null
  }
}

/** 生成分享码，格式：z + base64（z 表示压缩过），或 b + base64（未压缩） */
export async function encodePlaylist(playlist: Playlist): Promise<string> {
  const payload: SharePayload = {
    v: 1,
    n: playlist.name,
    s: playlist.songs.map((s) => [s.title, s.bvid ?? null, s.page, s.aid ?? null]),
  }
  const raw = new TextEncoder().encode(JSON.stringify(payload))
  const packed = await deflate(raw)
  if (packed) return 'z' + toBase64Url(packed)
  return 'b' + toBase64Url(raw)
}

/** 解析分享码，失败返回 null */
export async function decodeShare(
  code: string,
): Promise<{ name: string; songs: Array<{ title: string; bvid?: string; page: number; aid?: string }> } | null> {
  const trimmed = code.trim()
  if (!trimmed) return null
  const flag = trimmed[0]
  const body = trimmed.slice(1)
  if (flag !== 'z' && flag !== 'b') return null
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(body)
  } catch {
    return null
  }
  if (flag === 'z') {
    const unpacked = await inflate(bytes)
    if (!unpacked) return null
    bytes = unpacked
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload
    if (!data || !Array.isArray(data.s)) return null
    return {
      name: data.n || '导入的歌单',
      songs: data.s
        .filter((row) => Array.isArray(row) && typeof row[0] === 'string')
        .map((row) => ({
          title: row[0],
          bvid: row[1] || undefined,
          page: Number(row[2]) || 1,
          aid: row[3] || undefined,
        })),
    }
  } catch {
    return null
  }
}

/** 生成完整分享链接 */
export async function buildShareLink(playlist: Playlist): Promise<string> {
  const code = await encodePlaylist(playlist)
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#share=${code}`
}

/** 读取当前 URL 中的分享码 / 公开 Gist 参数 */
export function readUrlPayload(): { share?: string; gist?: string } {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return {}
  const params = new URLSearchParams(hash)
  return {
    share: params.get('share') ?? undefined,
    gist: params.get('gist') ?? undefined,
  }
}

/** 清除 URL 中的导入参数，避免刷新重复导入 */
export function clearUrlPayload(): void {
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', base)
}
