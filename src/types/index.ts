export interface Song {
  id: string
  bvid?: string // 供 iframe 播放的 src 标识，如 BV1xx411c7mD 或 av170001
  aid?: string
  page: number // 分P页码，从1开始
  title: string
  cover?: string
  addedAt: number
}

export interface Playlist {
  id: string
  name: string
  songs: Song[]
  createdAt: number
}

export interface ParsedLink {
  kind: 'video'
  bvid?: string
  aid?: string
  page: number
  valid: boolean
  error?: string
}

// iframe 播放协议标识，用于持久化恢复
export interface PlayerState {
  playlistId: string | null
  songId: string | null
  playing: boolean
  visible: boolean
}
