import { useMemo, useState } from 'react'
import { useLibrary } from '../stores/library'
import { buildShareLink, decodeShare } from '../utils/share'

export default function ShareTab() {
  const { playlists, activePlaylistId, gistId, gistPublic, importShared, mergeFromGist } =
    useLibrary()
  const active = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0]

  const [link, setLink] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importText, setImportText] = useState('')
  const [feedback, setFeedback] = useState('')
  const [err, setErr] = useState('')

  const gistLink = useMemo(() => {
    if (!gistId || !gistPublic) return ''
    const base = `${window.location.origin}${window.location.pathname}`
    return `${base}#gist=${gistId}`
  }, [gistId, gistPublic])

  const generate = async () => {
    if (!active) return
    setGenerating(true)
    setErr('')
    try {
      const url = await buildShareLink(active)
      setLink(url)
      setCopied(false)
    } catch {
      setErr('生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setErr('复制失败，请手动长按选择复制')
    }
  }

  const doImport = async () => {
    setErr('')
    setFeedback('')
    const raw = importText.trim()
    if (!raw) {
      setErr('请粘贴分享码或分享链接')
      return
    }
    // 支持三种输入：完整链接、#gist=xxx、分享码本体
    const gistMatch = raw.match(/[#?&]gist=([0-9a-f]{8,})/i) || raw.match(/^([0-9a-f]{20,})$/i)
    if (gistMatch) {
      await mergeFromGist(gistMatch[1])
      const st = useLibrary.getState()
      if (st.syncStatus === 'ok') {
        setFeedback(st.syncMessage)
        setImportText('')
      } else {
        setErr(st.syncMessage)
      }
      return
    }
    const shareMatch = raw.match(/[#?&]share=([A-Za-z0-9_-]+)/) || raw.match(/^[zb][A-Za-z0-9_-]{10,}$/)
    const code = shareMatch ? (shareMatch[1] ?? shareMatch[0]) : null
    if (!code) {
      setErr('无法识别，请粘贴完整的分享链接或分享码')
      return
    }
    const data = await decodeShare(code)
    if (!data) {
      setErr('分享码已损坏或格式不支持')
      return
    }
    importShared(data.name, data.songs)
    setFeedback(`已导入歌单「${data.name}」，共 ${data.songs.length} 首`)
    setImportText('')
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted">
          分享当前歌单（不需要 Token）
        </h4>
        <p className="text-xs leading-relaxed text-muted">
          把歌单压缩后装进链接里，别人或你的另一台设备打开即可导入。不依赖账号、网盘或任何服务器。
        </p>
        <p className="text-[11px] text-muted">
          当前歌单：<span className="text-text/80">{active?.name ?? '无'}</span>（{active?.songs.length ?? 0} 首）
        </p>
        <button className="btn-primary w-full" onClick={() => void generate()} disabled={!active || generating}>
          {generating ? '生成中…' : '生成分享链接'}
        </button>
        {link && (
          <div className="space-y-1">
            <textarea
              readOnly
              className="input h-20 resize-none font-mono text-[11px]"
              value={link}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => void copy(link)}>
                {copied ? '已复制' : '复制链接'}
              </button>
              <span className="flex-1 self-center text-[11px] text-muted">
                {link.length} 字符{link.length > 1800 ? '（较长，建议用短歌单）' : ''}
              </span>
            </div>
          </div>
        )}
        {gistLink && (
          <div className="rounded-lg bg-panel2/60 p-2.5 text-[11px] leading-relaxed">
            <p className="mb-1 text-muted">或使用公开备份链接（对方无需 Token 即可导入）：</p>
            <button className="break-all text-left text-accent underline" onClick={() => void copy(gistLink)}>
              {gistLink}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-white/5 pt-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted">导入歌单</h4>
        <textarea
          className="input h-20 resize-none font-mono text-[11px]"
          placeholder="粘贴分享链接、分享码，或 #gist= 开头的公开备份链接"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button className="btn-primary w-full" onClick={() => void doImport()}>
          导入
        </button>
        {feedback && <p className="text-xs text-accent">{feedback}</p>}
        {err && <p className="text-xs text-red-400">{err}</p>}
        <p className="text-[11px] leading-relaxed text-muted">
          导入只会新增一个歌单，不会覆盖你现有的歌单。
        </p>
      </div>
    </div>
  )
}
