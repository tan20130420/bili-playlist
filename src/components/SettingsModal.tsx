import { useState } from 'react'
import SyncTab from './SyncPanel'
import AudioTab from './AudioTab'
import ShareTab from './ShareTab'

type TabKey = 'sync' | 'audio' | 'share'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'sync', label: '云端同步' },
  { key: 'audio', label: '音频' },
  { key: 'share', label: '分享导入' },
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('sync')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="panel my-auto w-full max-w-lg rise-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <h3 className="font-serif text-lg font-black">设置</h3>
          <button className="btn-ghost ml-auto" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </div>

        <div className="flex gap-1 border-b border-white/5 px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === t.key ? 'bg-accent/10 font-bold text-accent' : 'text-muted hover:bg-panel2'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {tab === 'sync' && <SyncTab />}
          {tab === 'audio' && <AudioTab />}
          {tab === 'share' && <ShareTab />}
        </div>
      </div>
    </div>
  )
}
