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
 * 锁屏/后台播放说明：
 *  - 依赖 MediaSession API 让系统把它当作媒体应用：锁屏显示控制、后台不断流
 *  - 华为/鸿蒙浏览器省电策略激进，额外做三件事：
 *    1. 定时校验：若页面隐藏时播放器被系统暂停，自动恢复
 *    2. play() 需在用户手势链路上调用，首次由点击歌曲触发
 *    3. 提示用户把网页「添加到主屏幕」用独立窗口打开，避开浏览器省电拦截
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
  const [resumed, setResumed] = useState(0)

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
          }
          if (cancelled) return
          if (data.ok && data.mp4) {
            setSrc(data.mp4)
            setDirect(true)
            setResolving(false)
            return
          }
          if (data.error) {
            setDiag(`直链失败（${data.step ?? '?'}）：${data.error}`)
          }
        }
      } catch {
        if (cancelled) return
        setDiag('代理无法访问，回退到流代理模式')
      }
      if (cancelled) return
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

  // MediaSession：让系统把网页当媒体应用（锁屏控制的前提）
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

  // 华为/鸿蒙省电策略：页面转入后台时系统可能强制暂停播放
  // 监听 visibilitychange，若非用户主动暂停则自动恢复
  useEffect(() => {
    const onVis = () => {
      const el = audioRef.current
      if (!el) return
      // 文档变为隐藏且音频被暂停（非用户暂停、非播放结束）时恢复
      if (document.visibilityState === 'hidden' && el.paused && !el.ended) {
        const wasUserPaused = el.dataset.userPaused === '1'
        if (!wasUserPaused) {
          el.dataset.autoResume = '1'
          void el.play().then(() => setResumed((n) => n + 1)).catch(() => {})
        }
      }
      if (document.visibilityState === 'visible') {
        el.dataset.userPaused = '0'
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

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
          onPlay={() => {
            const el = audioRef.current
            if (el) {
              el.dataset.userPaused = '0'
              el.dataset.autoResume = '0'
            }
          }}
          onPause={() => {
            const el = audioRef.current
            // 仅记录用户主动暂停（播放器可见时发生的暂停）
            if (el && document.visibilityState === 'visible') {
              el.dataset.userPaused = '1'
            }
          }}
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

        <p className="text-[10px] leading-relaxed text-muted/70">
          息屏即停？华为/鸿蒙浏览器会拦截后台网页。两个办法：
          ①点播放后立刻锁屏（不要先切走）；
          ②菜单里选「添加到桌面」，从桌面图标打开后播放，系统会把它当独立应用，不拦截。
          {resumed > 0 && `（已自动恢复 ${resumed} 次后台暂停）`}
        </p>
      </div>
    </div>
  )

  function diagnose() {
    return (async () => {
      if (!streamSrc) return
      setDiag('正在诊断…')
      try {
        const res = await fetch(streamSrc, { headers: { Range: 'bytes=0-1' }, cache: 'no-store' })
        const type = res.headers.get('content-type') || ''
        if (type.includes('json')) {
          const data = (await res.json()) as { error?: string; step?: string }
          setDiag(
            `代理返回：${data.error || '未知错误'}（步骤 ${data.step ?? '?'}）`,
          )
        } else if (!res.ok) {
          setDiag(`代理返回 HTTP ${res.status}`)
        } else {
          setDiag(`代理正常返回 ${type}，问题可能在浏览器解码`)
        }
      } catch {
        setDiag('无法连接代理，请确认该地址在当前网络可访问')
      }
    })()
  }
}
