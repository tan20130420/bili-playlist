import { useLibrary } from '../stores/library'

export default function PlayerBar() {
  const { currentPlaylistId, currentSongId, playlists, playNext, togglePlayer, playerVisible } =
    useLibrary()
  const pl = playlists.find((p) => p.id === currentPlaylistId)
  const song = pl?.songs.find((s) => s.id === currentSongId)

  if (!pl || !song) {
    return (
      <footer className="border-t border-white/5 px-4 py-2.5 text-center text-xs text-muted">
        从歌单中选一首歌开始播放
      </footer>
    )
  }

  return (
    <footer className="border-t border-white/5 bg-panel/90 backdrop-blur px-3 py-2 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <span className="text-accent" aria-hidden="true">
          ♪
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{song.title}</p>
          <p className="truncate text-[11px] text-muted">
            {pl.name} · P{song.page}
          </p>
        </div>
        <button className="btn-ghost" onClick={() => playNext(-1)} aria-label="上一首">
          ⏮
        </button>
        <button className="btn-ghost" onClick={() => playNext(1)} aria-label="下一首">
          ⏭
        </button>
        <button className="btn-primary" onClick={togglePlayer}>
          {playerVisible ? '收起' : '播放'}
        </button>
      </div>
    </footer>
  )
}
