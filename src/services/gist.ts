import type { Playlist } from '../types'

export const GIST_FILE = 'bili-playlist.json'

export interface CloudPayload {
  version: 1
  updatedAt: number
  playlists: Playlist[]
}

const API = 'https://api.github.com'

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('网络连接失败，请检查网络或代理设置')
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token 无效或已过期（401）')
    if (res.status === 403) throw new Error('Token 权限不足或触发限流（403）')
    if (res.status === 404) throw new Error('找不到 Gist，请检查 Gist ID（404）')
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      detail = body.message ?? ''
    } catch {
      /* ignore */
    }
    throw new Error(`请求失败（${res.status}）${detail ? '：' + detail : ''}`)
  }
  return (await res.json()) as T
}

interface GistResponse {
  id: string
  html_url: string
  updated_at: string
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
}

/** 读取云端歌单 */
export async function pullGist(token: string, gistId: string): Promise<CloudPayload | null> {
  const gist = await request<GistResponse>(`${API}/gists/${gistId}`, {
    method: 'GET',
    headers: headers(token),
  })
  const file = gist.files[GIST_FILE]
  if (!file) return null
  let content = file.content
  if ((!content || file.truncated) && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: headers(token) })
    content = await raw.text()
  }
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as CloudPayload
    if (!Array.isArray(parsed.playlists)) return null
    return parsed
  } catch {
    throw new Error('云端文件格式损坏，无法解析')
  }
}

/** 写入云端歌单（gistId 为空则新建私有 Gist） */
export async function pushGist(
  token: string,
  gistId: string | null,
  payload: CloudPayload,
): Promise<string> {
  const body = JSON.stringify({
    description: 'B歌单 - 歌单备份（由 B歌单 自动同步）',
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } },
  })

  if (!gistId) {
    const created = await request<GistResponse>(`${API}/gists`, {
      method: 'POST',
      headers: headers(token),
      body,
    })
    return created.id
  }
  const updated = await request<GistResponse>(`${API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } } }),
  })
  return updated.id
}

/** 校验 token 对应的账号 */
export async function verifyToken(token: string): Promise<string> {
  const user = await request<{ login: string }>(`${API}/user`, {
    method: 'GET',
    headers: headers(token),
  })
  return user.login
}
