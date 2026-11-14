import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Playlist, Song } from '../types'
import { uid } from '../utils/bili'
import { findGist, pullGist, pushGist, verifyToken } from '../services/gist'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error'

interface LibraryState {
  playlists: Playlist[]
  activePlaylistId: string | null
  currentPlaylistId: string | null
  currentSongId: string | null
  playerVisible: boolean
  /** 本地最后一次修改时间，用于与云端比较 */
  localUpdatedAt: number

  // GitHub 同步
  githubToken: string
  gistId: string
  githubUser: string
  autoSync: boolean
  syncStatus: SyncStatus
  syncMessage: string
  lastSyncAt: number | null

  createPlaylist: (name: string, opts?: { silent?: boolean }) => string
  deletePlaylist: (id: string) => void
  renamePlaylist: (id: string, name: string) => void
  setActive: (id: string) => void
  addSong: (playlistId: string, song: Omit<Song, 'id' | 'addedAt'>) => boolean
  updateSong: (playlistId: string, songId: string, patch: Partial<Song>) => void
  removeSong: (playlistId: string, songId: string) => void
  moveSong: (playlistId: string, songId: string, dir: -1 | 1) => void
  playSong: (playlistId: string, songId: string) => void
  playNext: (dir: 1 | -1) => void
  togglePlayer: () => void

  // 同步动作
  saveGithubConfig: (cfg: { token?: string; gistId?: string; autoSync?: boolean }) => Promise<void>
  connectGithub: (token: string) => Promise<void>
  disconnectGithub: () => void
  pushToCloud: () => Promise<void>
  pullFromCloud: (opts?: { silent?: boolean }) => Promise<void>
  autoPull: () => Promise<void>
}

/** 云端拉取时抑制自动推送，避免回环 */
let suppressPush = false

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      playlists: [],
      activePlaylistId: null,
      currentPlaylistId: null,
      currentSongId: null,
      playerVisible: false,
      localUpdatedAt: 0,

      githubToken: '',
      gistId: '',
      githubUser: '',
      autoSync: true,
      syncStatus: 'idle',
      syncMessage: '',
      lastSyncAt: null,

      createPlaylist: (name, opts) => {
        const id = uid()
        set((s) => ({
          playlists: [
            ...s.playlists,
            { id, name: name.trim() || '未命名歌单', songs: [], createdAt: Date.now() },
          ],
          activePlaylistId: s.activePlaylistId ?? id,
          ...(opts?.silent ? {} : { localUpdatedAt: Date.now() }),
        }))
        return id
      },

      deletePlaylist: (id) =>
        set((s) => {
          const playlists = s.playlists.filter((p) => p.id !== id)
          const next: Partial<LibraryState> = { playlists, localUpdatedAt: Date.now() }
          if (s.activePlaylistId === id) next.activePlaylistId = playlists[0]?.id ?? null
          if (s.currentPlaylistId === id) {
            next.currentPlaylistId = null
            next.currentSongId = null
          }
          return next
        }),

      renamePlaylist: (id, name) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name } : p,
          ),
          localUpdatedAt: Date.now(),
        })),

      setActive: (id) => set({ activePlaylistId: id }),

      addSong: (playlistId, song) => {
        const pl = get().playlists.find((p) => p.id === playlistId)
        if (!pl) return false
        const dup = pl.songs.some((x) => x.bvid === song.bvid && x.page === song.page)
        if (dup) return false
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, songs: [...p.songs, { ...song, id: uid(), addedAt: Date.now() }] }
              : p,
          ),
          localUpdatedAt: Date.now(),
        }))
        return true
      },

      updateSong: (playlistId, songId, patch) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  songs: p.songs.map((song) =>
                    song.id === songId ? { ...song, ...patch } : song,
                  ),
                }
              : p,
          ),
          localUpdatedAt: Date.now(),
        })),

      removeSong: (playlistId, songId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, songs: p.songs.filter((song) => song.id !== songId) }
              : p,
          ),
          currentSongId: s.currentSongId === songId ? null : s.currentSongId,
          localUpdatedAt: Date.now(),
        })),

      moveSong: (playlistId, songId, dir) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== playlistId) return p
            const idx = p.songs.findIndex((song) => song.id === songId)
            const target = idx + dir
            if (idx < 0 || target < 0 || target >= p.songs.length) return p
            const songs = [...p.songs]
            const [item] = songs.splice(idx, 1)
            songs.splice(target, 0, item)
            return { ...p, songs }
          }),
          localUpdatedAt: Date.now(),
        })),

      playSong: (playlistId, songId) =>
        set({ currentPlaylistId: playlistId, currentSongId: songId, playerVisible: true }),

      playNext: (dir) => {
        const { currentPlaylistId, currentSongId, playlists } = get()
        if (!currentPlaylistId || !currentSongId) return
        const pl = playlists.find((p) => p.id === currentPlaylistId)
        if (!pl) return
        const idx = pl.songs.findIndex((song) => song.id === currentSongId)
        const next = pl.songs[idx + dir]
        if (next) set({ currentSongId: next.id })
      },

      togglePlayer: () => set((s) => ({ playerVisible: !s.playerVisible })),

      saveGithubConfig: async (cfg) => {
        set((s) => ({
          githubToken: cfg.token ?? s.githubToken,
          gistId: cfg.gistId ?? s.gistId,
          autoSync: cfg.autoSync ?? s.autoSync,
        }))
      },

      connectGithub: async (token) => {
        set({ syncStatus: 'syncing', syncMessage: '正在验证 Token…' })
        try {
          const login = await verifyToken(token)
          // 新设备没有 Gist ID 时，自动在账号下找到已有歌单文件
          let gistId = get().gistId
          if (!gistId) {
            try {
              gistId = (await findGist(token)) ?? ''
            } catch {
              gistId = ''
            }
          }
          set({
            githubToken: token,
            githubUser: login,
            gistId,
            syncStatus: 'ok',
            syncMessage: gistId
              ? `已连接 @${login}，找到云端歌单，可点「从云端恢复」`
              : `已连接 @${login}`,
            lastSyncAt: Date.now(),
          })
        } catch (e) {
          set({
            syncStatus: 'error',
            syncMessage: e instanceof Error ? e.message : '连接失败',
          })
          throw e
        }
      },

      disconnectGithub: () =>
        set({
          githubToken: '',
          gistId: '',
          githubUser: '',
          syncStatus: 'idle',
          syncMessage: '已断开，歌单仅保存在本机',
        }),

      pushToCloud: async () => {
        const { githubToken, gistId, playlists } = get()
        if (!githubToken) {
          set({ syncStatus: 'error', syncMessage: '请先填写 GitHub Token' })
          return
        }
        set({ syncStatus: 'syncing', syncMessage: '正在上传…' })
        try {
          const id = await pushGist(githubToken, gistId || null, {
            version: 1,
            updatedAt: Date.now(),
            playlists,
          })
          set({
            gistId: id,
            syncStatus: 'ok',
            syncMessage: `已上传 ${playlists.length} 个歌单`,
            lastSyncAt: Date.now(),
          })
        } catch (e) {
          set({
            syncStatus: 'error',
            syncMessage: e instanceof Error ? e.message : '上传失败',
          })
        }
      },

      pullFromCloud: async (opts) => {
        const { githubToken } = get()
        let { gistId } = get()
        if (!githubToken) {
          if (!opts?.silent) {
            set({ syncStatus: 'error', syncMessage: '请先连接 GitHub' })
          }
          return
        }
        set({ syncStatus: 'syncing', syncMessage: '正在下载…' })
        try {
          // 新设备未记录 Gist ID 时，先自动发现
          if (!gistId) {
            const found = await findGist(githubToken)
            if (!found) {
              set({
                syncStatus: 'error',
                syncMessage: '账号下没有找到歌单备份，请先在一台设备上「上传到云端」',
              })
              return
            }
            gistId = found
            set({ gistId })
          }
          const data = await pullGist(githubToken, gistId)
          if (!data) {
            set({ syncStatus: 'ok', syncMessage: '云端还没有歌单数据', lastSyncAt: Date.now() })
            return
          }
          const local = get().playlists
          suppressPush = true
          set({
            playlists: data.playlists,
            activePlaylistId: data.playlists[0]?.id ?? null,
            currentPlaylistId: null,
            currentSongId: null,
            localUpdatedAt: data.updatedAt,
            syncStatus: 'ok',
            syncMessage: `已从云端恢复 ${data.playlists.length} 个歌单`,
            lastSyncAt: Date.now(),
          })
          if (local.length === 0) suppressPush = false
          setTimeout(() => {
            suppressPush = false
          }, 500)
        } catch (e) {
          set({
            syncStatus: 'error',
            syncMessage: e instanceof Error ? e.message : '下载失败',
          })
        }
      },

      /** 启动时静默同步：本地为空则拉取云端，否则比较时间戳，云端更新则覆盖 */
      autoPull: async () => {
        const { githubToken, autoSync, playlists } = get()
        if (!autoSync || !githubToken) return
        let { gistId } = get()
        try {
          if (!gistId) {
            const found = await findGist(githubToken)
            if (!found) return
            gistId = found
            set({ gistId })
          }
          const data = await pullGist(githubToken, gistId)
          if (!data) {
            if (playlists.length > 0) await get().pushToCloud()
            return
          }
          if (playlists.length === 0 || data.updatedAt > get().localUpdatedAt) {
            suppressPush = true
            set({
              playlists: data.playlists,
              activePlaylistId:
                data.playlists.find((p) => p.id === get().activePlaylistId)?.id ??
                data.playlists[0]?.id ??
                null,
              localUpdatedAt: data.updatedAt,
              syncStatus: 'ok',
              syncMessage: `已同步云端（${data.playlists.length} 个歌单）`,
              lastSyncAt: Date.now(),
            })
            setTimeout(() => {
              suppressPush = false
            }, 500)
          } else {
            set({ syncStatus: 'ok', syncMessage: '本地已是最新', lastSyncAt: Date.now() })
          }
        } catch (e) {
          set({
            syncStatus: 'error',
            syncMessage: e instanceof Error ? e.message : '同步失败',
          })
        }
      },
    }),
    {
      name: 'bili-playlist-v2',
      // 只持久化数据和配置，不持久化瞬时状态
      partialize: (s) => ({
        playlists: s.playlists,
        activePlaylistId: s.activePlaylistId,
        currentPlaylistId: s.currentPlaylistId,
        currentSongId: s.currentSongId,
        localUpdatedAt: s.localUpdatedAt,
        githubToken: s.githubToken,
        gistId: s.gistId,
        githubUser: s.githubUser,
        autoSync: s.autoSync,
        lastSyncAt: s.lastSyncAt,
      }),
      version: 2,
      migrate: (persisted) => persisted as LibraryState,
    },
  ),
)

/* ---------------- 自动同步：歌单变化后延迟上传 ---------------- */
let pushTimer: ReturnType<typeof setTimeout> | undefined

useLibrary.subscribe((state, prev) => {
  if (state.playlists === prev.playlists) return
  if (suppressPush) return
  const { autoSync, githubToken, gistId } = state
  if (!autoSync || !githubToken || !gistId) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void useLibrary.getState().pushToCloud()
  }, 2500)
})

/* ---------------- 旧版本数据迁移（v1 -> v2） ---------------- */
if (typeof window !== 'undefined') {
  try {
    const legacy = window.localStorage.getItem('bili-playlist-v1')
    const current = window.localStorage.getItem('bili-playlist-v2')
    if (legacy && !current) {
      const old = JSON.parse(legacy) as { state?: { playlists?: Playlist[] } }
      if (old.state?.playlists?.length) {
        useLibrary.setState({
          playlists: old.state.playlists,
          activePlaylistId: old.state.playlists[0]?.id ?? null,
          localUpdatedAt: Date.now(),
        })
      }
    }
  } catch {
    /* 忽略迁移异常 */
  }
}
