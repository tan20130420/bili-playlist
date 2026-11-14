import { useState } from 'react'
import { useLibrary } from '../stores/library'
import type { Playlist } from '../types'

export default function Sidebar() {
  const {
    playlists,
    activePlaylistId,
    setActive,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
  } = useLibrary()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const submitCreate = () => {
    if (newName.trim()) createPlaylist(newName)
    setNewName('')
    setCreating(false)
  }

  const submitRename = (p: Playlist) => {
    renamePlaylist(p.id, editName)
    setEditingId(null)
  }

  const confirmDelete = (p: Playlist) => {
    if (window.confirm(`确定删除歌单「${p.name}」？其中 ${p.songs.length} 首歌曲将一并移除。`)) {
      deletePlaylist(p.id)
    }
  }

  return (
    <div className="flex h-full flex-col p-3 md:p-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">歌单</h2>
        <button
          className="btn-ghost text-accent"
          onClick={() => setCreating(true)}
          aria-label="新建歌单"
        >
          ＋ 新建
        </button>
      </div>

      {creating && (
        <div className="mb-2 flex gap-1">
          <input
            autoFocus
            className="input"
            placeholder="歌单名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
          <button className="btn-primary shrink-0" onClick={submitCreate}>
            确定
          </button>
        </div>
      )}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {playlists.map((p) => {
          const isActive = p.id === activePlaylistId
          return (
            <li key={p.id}>
              {editingId === p.id ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename(p)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                  <button className="btn-primary shrink-0" onClick={() => submitRename(p)}>
                    存
                  </button>
                </div>
              ) : (
                <div
                  className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent ring-1 ring-accent/30'
                      : 'hover:bg-panel2 text-text'
                  }`}
                  onClick={() => setActive(p.id)}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" strokeLinecap="round" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted">{p.songs.length}</span>
                  <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                    <button
                      className="btn-ghost px-1.5 py-0.5 text-xs"
                      aria-label="重命名"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(p.id)
                        setEditName(p.name)
                      }}
                    >
                      改
                    </button>
                    <button
                      className="btn-danger px-1.5 py-0.5 text-xs"
                      aria-label="删除歌单"
                      onClick={(e) => {
                        e.stopPropagation()
                        confirmDelete(p)
                      }}
                    >
                      删
                    </button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {playlists.length === 0 && !creating && (
        <p className="px-1 py-4 text-center text-xs text-muted">暂无歌单，点击右上角新建</p>
      )}
    </div>
  )
}
