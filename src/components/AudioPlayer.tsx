import { useEffect, useRef, useState } from 'react'
import { useLibrary, effectiveWorkerUrl } from '../stores/library'

/**
 * 纯音频播放器。
 *
 * 播放源策略（按顺序回退）：
 *  1) 直链模式：向代理要 /url，拿到B站 CDN 直链后由手机直接拉流。
 *     MP4 直链不需要 Referer，浏览器 <audio> 可直接播放，速度快且不占代理带宽。
 *  2) 流代理模式：/audio 由代理转发，兼容只有 DASH 音频流的情况。
 *
 * 相比 iframe 播放器：只出声音、手机锁屏可继续播放（MediaSession）、
 * 可拖动进度、放完自动下一首。
 */
export default function AudioPlayer() {
  const { currentPlaylistId, currentSongId, playlists, playNext, audioMode, workerUrl } =
    useLibrary()
  const audioRef = useRef<HTMLAudioElement>(null)
  const [err, setErr] = useState('')
  const [diag, setDiag] = useState('')
  const [resolving, setResolving] = useState(false)
  const [src, setSrc] = useState('')
  const [direct, setDirect] = useState(false)

  const pl = playlists.find((p) => p.id === currentPlaylistId)
  const song = pl?.songs.find((s) => s.id === currentSongId)
  const effUrl = effectiveWorkerUrl(workerUrl)
  const enabled = audioMode === 'audio' && Boolean(effUrl) && Boolean(song)

  const base = effUrl.replace(/\/+$/, '')
  const idQuery = song ? (song.bvid ? `bvid=${song.bvid}` : `aid=${song.aid ?? ''}`) : ''
  const streamSrc = enabled && idQuery ? `${base}/audio?${idQuery}&p=${song?.page ?? 1}` : ''

  // 换歌时解析播放地址
  useEffect(() => {
    setErr('')
    setDiag('')
    setSrc('')
    setDirect(false)
    if (!enabled || !idQuery) return

    let cancelled = false
    setResolving(true)

    void (async () => {
      try {
        // 先要直链：MP4 可被浏览器直接播放，无需 Referer
        const res = await fetch(`${base}/url?${idQuery}&p=${song?.page ?? 1}`, {
          cache: 'no-store',
        })
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('json')) {
          const data = (await res.json()) as {
            ok?: boolean
            mp4?: string | null
            error?: string
            step?: string
            detail?: string
            host?: string
          }
          if (cancelled) return
          if (data.ok && data.mp4) {
            setSrc(data.mp4)
            setDirect(true)
            setResolving(false)
            return
          }
          // 直链拿不到，记录原因后回退流代理
          if (data.error) {
            setDiag(`直链失败（${data.step ?? '?'}）：${data.error}`)
          }
        }
      } catch {
        if (cancelled) return
        setDiag('代理无法访问，回退到流代理模式')
      }
      if (cancelled) return
      // 回退：由代理转发音频流
      setSrc(streamSrc)
      setDirect(false)
      setResolving(false)
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, idQuery, base, streamSrc, song?.page])

  // 地址就绪后自动播放
  useEffect(() => {
    const el = audioRef.current
    if (!src || !el) return
    el.load()
    void el.play().catch(() => {
      /* 自动播放被浏览器拦截时，等用户手动点 */
    })
  }, [src])

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

  /** <audio> 的 error 事件拿不到响应内容，单独请求一次读取真实原因 */
  const diagnose = async () => {
    if (!streamSrc) return
    setDiag('正在诊断…')
    try {
      const res = await fetch(streamSrc, { headers: { Range: 'bytes=0-1' }, cache: 'no-store' })
      const type = res.headers.get('content-type') || ''
      if (type.includes('json')) {
        const data = (await res.json()) as { error?: string; step?: string; detail?: string }
        setDiag(
          `代理返回：${data.error || '未知错误'}（步骤 ${data.step ?? '?'}）${data.detail ? `｜${String(data.detail).slice(0, 80)}` : ''}`,
        )
      } else if (!res.ok) {
        setDiag(`代理返回 HTTP ${res.status}`)
      } else {
        setDiag(`代理正常返回 ${type}，问题可能在浏览器解码`)
      }
    } catch {
      setDiag('无法连接代理，请确认该地址在当前网络可访问')
    }
  }

  if (audioMode !== 'audio') return null

  if (!effUrl) {
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
          {song && (
            <span className="shrink-0 text-[11px] text-muted">
              P{song.page}
              {direct && src && !resolving ? ' · 直连' : ''}
              {!workerUrl.trim() && ' · 默认线路'}
            </span>
          )}
        </div>

        {resolving && <p className="text-[11px] text-muted">正在解析播放地址…</p>}

        <audio
          ref={audioRef}
          src={src || undefined}
          controls
          preload="auto"
          className="h-9 w-full"
          onEnded={() => playNext(1)}
          onError={() => {
            setErr('音频加载失败')
            void diagnose()
          }}
        />

        {err && (
          <div className="space-y-1">
            <p className="text-[11px] text-red-400">{err}</p>
            {diag && <p className="break-all text-[11px] text-accent2">{diag}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => void diagnose()}>
                重新诊断
              </button>
              {src && (
                <a className="btn-ghost px-2 py-1 text-[11px]" href={src} target="_blank" rel="noreferrer">
                  直接打开音频地址
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
