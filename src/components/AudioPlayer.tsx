import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../stores/library'

/**
 * 纯音频播放器：通过自建 Worker 代理B站 DASH 音频流，用 <audio> 播放。
 * 相比 iframe：
 *  - 只出声音，省流量
 *  - 手机锁屏 / 切后台可继续播放（配合 MediaSession 显示锁屏控制）
 *  - 可拖动进度、自动连播下一首
 */
export default function AudioPlayer() {
  const { currentPlaylistId, currentSongId, playlists, playNext, audioMode, workerUrl } =
    useLibrary()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [err, setErr] = useState('')

  const pl = playlists.find((p) => p.id === currentPlaylistId)
  const song = pl?.songs.find((s) => s.id === currentSongId)
  const enabled = audioMode === 'audio' && Boolean(workerUrl) && Boolean(song)

  const base = workerUrl.replace(/\/+$/, '')
  const idQuery = song ? (song.bvid ? `bvid=${song.bvid}` : `aid=${song.aid ?? ''}`) : ''
  const src = enabled && idQuery ? `${base}/audio?${idQuery}&p=${song?.page ?? 1}` : ''

  // 切歌时自动播放
  useEffect(() => {
    setErr('')
    const el = audioRef.current
    if (!enabled || !src || !el) return
    el.load()
    void el.play().catch(() => {
      /* 自动播放被拦截时等用户点播放 */
    })
  }, [src, enabled])

  // 锁屏 / 通知栏控制
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!song) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: 'B歌单',
        album: pl?.name ?? '',
      })
      navigator.mediaSession.setActionHandler('play', () => void audioRef.current?.play())
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext(1))
      navigator.mediaSession.setActionHandler('previoustrack', () => playNext(-1))
    } catch {
      /* 部分浏览器不支持，忽略 */
    }
  }, [song, pl?.name, playNext])

  if (audioMode !== 'audio') return null

  if (!workerUrl) {
    return (
      <div className="border-t border-white/5 bg-panel/90 px-4 py-2 text-center text-xs text-accent2">
        纯音频模式需要先填写音频代理地址：点右上角「设置」→ 音频
      </div>
    )
  }

  return (
    <div className="border-t border-white/5 bg-panel/95 px-3 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-accent" aria-hidden="true">♪</span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {song ? song.title : '从歌单中选一首歌'}
          </p>
          {song && <span className="shrink-0 text-[11px] text-muted">P{song.page}</span>}
        </div>
        <audio
          ref={audioRef}
          src={src}
          controls
          preload="auto"
          className="h-9 w-full"
          onEnded={() => playNext(1)}
          onError={() =>
            setErr('音频加载失败，请检查 Worker 地址是否正确、是否已部署')
          }
        />
        {err && <p className="text-[11px] text-red-400">{err}</p>}
      </div>
    </div>
  )
}
