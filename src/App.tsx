import { useEffect, useState } from 'react'
import { useLibrary } from './stores/library'
import { playerSrc } from './utils/bili'
import { clearUrlPayload, decodeShare, readUrlPayload } from './utils/share'
import Sidebar from './components/Sidebar'
import SongList from './components/SongList'
import PlayerBar from './components/PlayerBar'
import AudioPlayer from './components/AudioPlayer'
import SettingsModal from './components/SettingsModal'

function fmtAgo(ts: number | null): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '刚刚同步'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前同步`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前同步`
  return `${Math.floor(diff / 86400)} 天前同步`
}

export default function App() {
  const {
    playlists,
    activePlaylistId,
    createPlaylist,
    playerVisible,
    currentSongId,
    syncStatus,
    lastSyncAt,
    githubToken,
    audioMode,
  } = useLibrary()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 启动：先处理链接导入，再从云端拉取，最后兜底建默认歌单
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { share, gist } = readUrlPayload()
      if (share) {
        const data = await decodeShare(share)
        if (data && !cancelled) {
          useLibrary.getState().importShared(data.name, data.songs)
          clearUrlPayload()
        }
      } else if (gist) {
        await useLibrary.getState().mergeFromGist(gist)
        if (!cancelled) clearUrlPayload()
      }

      if (cancelled) return
      await useLibrary.getState().autoPull()
      if (cancelled) return

      const state = useLibrary.getState()
      if (state.playlists.length === 0) {
        state.createPlaylist('我的歌单', { silent: true })
      } else if (!state.activePlaylistId) {
        state.setActive(state.playlists[0].id)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0]

  const syncDot =
    syncStatus === 'error'
      ? 'bg-red-400'
      : syncStatus === 'syncing'
        ? 'bg-accent2 animate-pulse'
        : githubToken
          ? 'bg-accent'
          : 'bg-muted/50'

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3 sm:px-6">
        <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
          <path d="M20 16l6 8h12l6-8" stroke="#3ddc97" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="14" y="24" width="36" height="26" rx="6" fill="none" stroke="#3ddc97" strokeWidth="5" />
          <path d="M28 32v10l8-5z" fill="#f4b942" />
        </svg>
        <h1 className="font-serif text-xl font-black tracking-wide sm:text-2xl">
          B<span className="text-accent">歌单</span>
        </h1>
        <span className="ml-auto hidden text-xs text-muted lg:block">
          {githubToken ? fmtAgo(lastSyncAt) : '粘贴B站链接 · 建立自己的音乐电台'}
        </span>
        <button
          className="btn-ghost ml-auto shrink-0 gap-1.5 lg:ml-3"
          onClick={() => setSettingsOpen(true)}
          title="设置"
        >
          <span className={`h-2 w-2 rounded-full ${syncDot}`} aria-hidden="true" />
          <span className="text-xs">设置</span>
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="min-h-0 shrink-0 border-b border-white/5 md:w-64 md:border-b-0 md:border-r">
          <Sidebar />
        </aside>
        <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {active ? (
            <SongList playlist={active} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
              <p>左侧还没有歌单</p>
              <button className="btn-primary" onClick={() => createPlaylist('我的歌单')}>
                新建歌单
              </button>
            </div>
          )}
        </section>
      </main>

      {audioMode === 'audio' ? <AudioPlayer /> : <PlayerBar />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {audioMode === 'iframe' && playerVisible && currentSongId && <PlayerModal />}
    </div>
  )
}

function PlayerModal() {
  const { currentPlaylistId, currentSongId, playlists, playNext, togglePlayer } = useLibrary()
  const pl = playlists.find((p) => p.id === currentPlaylistId)
  const song = pl?.songs.find((s) => s.id === currentSongId)
  if (!pl || !song) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={togglePlayer}
    >
      <div
        className="panel w-full max-w-3xl overflow-hidden rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <span className="truncate font-serif font-bold">{song.title}</span>
          <span className="ml-auto text-xs text-muted">P{song.page}</span>
          <button className="btn-ghost" onClick={togglePlayer} aria-label="关闭">
            关闭
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe
            key={song.id + '-' + song.page}
            src={playerSrc(song, true)}
            title={song.title}
            className="h-full w-full"
            allowFullScreen
            scrolling="no"
            frameBorder="0"
          />
        </div>
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          <button className="btn-ghost" onClick={() => playNext(-1)}>
            上一首
          </button>
          <button className="btn-ghost" onClick={() => playNext(1)}>
            下一首
          </button>
        </div>
      </div>
    </div>
  )
}
