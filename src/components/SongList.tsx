import { useState } from 'react'
import { useLibrary } from '../stores/library'
import { parseBiliLink, playerSrc } from '../utils/bili'
import type { Playlist } from '../types'

export default function SongList({ playlist }: { playlist: Playlist }) {
  const { addSong, updateSong, removeSong, moveSong, playSong, currentSongId } = useLibrary()
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [page, setPage] = useState('1')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPage, setEditPage] = useState('1')

  const handleAdd = () => {
    setError('')
    setOkMsg('')
    const parsed = parseBiliLink(link, parseInt(page, 10) || 1)
    if (!parsed.valid) {
      setError(parsed.error ?? '链接无法识别')
      return
    }
    const added = addSong(playlist.id, {
      bvid: parsed.bvid,
      aid: parsed.aid,
      page: parsed.page,
      title: title.trim() || parsed.bvid || `av${parsed.aid ?? '0'}`,
    })
    if (!added) {
      setError('这首歌已经在歌单里了')
      return
    }
    setLink('')
    setTitle('')
    setPage('1')
    setOkMsg('已加入歌单')
  }

  const startEdit = (songId: string, curTitle: string, curPage: number) => {
    setEditingId(songId)
    setEditTitle(curTitle)
    setEditPage(String(curPage))
  }

  const submitEdit = (songId: string) => {
    updateSong(playlist.id, songId, {
      title: editTitle.trim() || '未命名',
      page: Math.max(1, parseInt(editPage, 10) || 1),
    })
    setEditingId(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 rise-in">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl font-black">{playlist.name}</h2>
        <span className="text-xs text-muted">{playlist.songs.length} 首</span>
      </div>

      {/* 添加歌曲 */}
      <div className="panel space-y-2 p-4">
        <label className="text-xs font-bold uppercase tracking-widest text-muted" htmlFor="link-input">
          添加歌曲 - 粘贴B站链接
        </label>
        <input
          id="link-input"
          className="input"
          placeholder="https://www.bilibili.com/video/BV1xx411c7mD?p=2 或直接粘贴 BV 号"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[140px]"
            placeholder="备注名（可选，默认用视频号）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input w-20 shrink-0"
            type="number"
            min={1}
            placeholder="分P"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            aria-label="分P页码"
          />
          <button className="btn-primary shrink-0" onClick={handleAdd}>
            加入歌单
          </button>
        </div>
        {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
        {okMsg && <p className="text-xs text-accent" role="status">{okMsg}</p>}
        <p className="text-[11px] leading-relaxed text-muted">
          支持 BV 号 / av 号 / 完整视频链接，链接带 ?p=N 会自动识别分P，也可手动指定分P页码。
        </p>
      </div>

      {/* 歌曲列表 */}
      {playlist.songs.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center text-muted">
          <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M9 18V5l12-2v13" strokeLinecap="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p className="text-sm">歌单还是空的</p>
          <p className="text-xs">粘贴一个B站视频链接开始吧</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {playlist.songs.map((song, idx) => {
            const isCurrent = song.id === currentSongId
            return (
              <li
                key={song.id}
                className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                  isCurrent ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-panel2'
                }`}
              >
                <span className={`w-6 shrink-0 text-center text-xs ${isCurrent ? 'text-accent' : 'text-muted'}`}>
                  {isCurrent ? '♪' : idx + 1}
                </span>

                {editingId === song.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    <input
                      autoFocus
                      className="input flex-1 min-w-[120px]"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitEdit(song.id)}
                    />
                    <input
                      className="input w-16"
                      type="number"
                      min={1}
                      value={editPage}
                      onChange={(e) => setEditPage(e.target.value)}
                      aria-label="分P页码"
                    />
                    <button className="btn-primary shrink-0" onClick={() => submitEdit(song.id)}>
                      保存
                    </button>
                    <button className="btn-ghost shrink-0" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => playSong(playlist.id, song.id)}
                      title="播放"
                    >
                      <span className="block truncate text-sm font-medium hover:text-accent">
                        {song.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {song.bvid ?? `av${song.aid}`} · P{song.page}
                      </span>
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button
                        className="btn-ghost px-1.5 py-0.5 text-xs"
                        aria-label="上移"
                        disabled={idx === 0}
                        onClick={() => moveSong(playlist.id, song.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn-ghost px-1.5 py-0.5 text-xs"
                        aria-label="下移"
                        disabled={idx === playlist.songs.length - 1}
                        onClick={() => moveSong(playlist.id, song.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="btn-ghost px-1.5 py-0.5 text-xs"
                        aria-label="编辑"
                        onClick={() => startEdit(song.id, song.title, song.page)}
                      >
                        改
                      </button>
                      <button
                        className="btn-danger px-1.5 py-0.5 text-xs"
                        aria-label="删除"
                        onClick={() => removeSong(playlist.id, song.id)}
                      >
                        删
                      </button>
                    </span>
                    <button
                      className="btn-ghost shrink-0 px-2 py-1 text-xs text-accent md:hidden"
                      onClick={() => playSong(playlist.id, song.id)}
                    >
                      播放
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* 内嵌预览区：当前选中歌曲 */}
      <CurrentPreview playlistId={playlist.id} />
    </div>
  )
}

function CurrentPreview({ playlistId }: { playlistId: string }) {
  const { currentPlaylistId, currentSongId, playlists } = useLibrary()
  if (currentPlaylistId !== playlistId) return null
  const pl = playlists.find((p) => p.id === playlistId)
  const song = pl?.songs.find((s) => s.id === currentSongId)
  if (!song) return null
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/5 px-4 py-2 text-xs text-muted">
        正在预览：{song.title}（P{song.page}）
      </div>
      <div className="aspect-video w-full bg-black">
        <iframe
          key={song.id + '-' + song.page}
          src={playerSrc(song, false)}
          title={song.title}
          className="h-full w-full"
          allowFullScreen
          scrolling="no"
          frameBorder="0"
        />
      </div>
    </div>
  )
}
