import { useState } from 'react'
import { useLibrary } from '../stores/library'

function fmtTime(ts: number | null) {
  if (!ts) return '尚未同步'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function SyncTab() {
  const {
    githubToken,
    githubUser,
    gistId,
    gistPublic,
    autoSync,
    syncStatus,
    syncMessage,
    lastSyncAt,
    connectGithub,
    disconnectGithub,
    pushToCloud,
    pullFromCloud,
    saveGithubConfig,
  } = useLibrary()

  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const connected = Boolean(githubToken)

  const handleConnect = async () => {
    setLocalError('')
    const t = tokenInput.trim()
    if (!t) {
      setLocalError('请先粘贴 Token')
      return
    }
    if (!/^(ghp_|github_pat_)/.test(t)) {
      setLocalError('Token 格式不对，应以 ghp_ 或 github_pat_ 开头')
      return
    }
    setBusy(true)
    try {
      await connectGithub(t)
      setTokenInput('')
    } catch {
      /* 错误已写入 store */
    } finally {
      setBusy(false)
    }
  }

  const statusColor =
    syncStatus === 'error'
      ? 'text-red-400'
      : syncStatus === 'ok'
        ? 'text-accent'
        : syncStatus === 'syncing'
          ? 'text-accent2'
          : 'text-muted'

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted">
        歌单可备份到你自己的 GitHub 私有 Gist。不填 Token 也能用：直接生成「分享链接」发给其他设备导入。
      </p>

      {!connected ? (
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted" htmlFor="gh-token">
            个人访问令牌（Token）
          </label>
          <input
            id="gh-token"
            className="input font-mono text-xs"
            type="password"
            autoComplete="off"
            placeholder="ghp_xxx 或 github_pat_xxx"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
          {localError && <p className="text-xs text-red-400">{localError}</p>}
          <button className="btn-primary w-full" onClick={handleConnect} disabled={busy}>
            {busy ? '验证中…' : '连接 GitHub'}
          </button>
          <details className="rounded-lg bg-panel2/60 p-3 text-xs text-muted">
            <summary className="cursor-pointer text-text/80">怎么获取 Token？（30 秒）</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
              <li>
                打开{' '}
                <a
                  className="text-accent underline"
                  href="https://github.com/settings/tokens/new?scopes=gist&description=BiliPlaylist"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/settings/tokens
                </a>
                （已默认勾选 gist 权限）
              </li>
              <li>选择有效期，例如 90 天，生成后复制以 ghp_ 开头的字符串</li>
              <li>粘贴到上面输入框，点「连接 GitHub」</li>
              <li>点「上传到云端」建立备份；另一台设备填同一个 Token 会自动找到</li>
            </ol>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
            <span className="text-muted">账号</span>
            <span className="font-medium">@{githubUser || '已连接'}</span>
            <span className="ml-auto text-xs text-muted">
              {gistId ? `Gist ${gistId.slice(0, 8)}…` : '未找到云端文件'}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#3ddc97]"
              checked={autoSync}
              onChange={(e) => void saveGithubConfig({ autoSync: e.target.checked })}
            />
            <span>自动同步（修改后自动上传，打开页面时自动拉取）</span>
          </label>

          {!gistId && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#3ddc97]"
                checked={gistPublic}
                onChange={(e) => void saveGithubConfig({ gistPublic: e.target.checked })}
              />
              <span>
                公开备份（可生成免 Token 的分享链接）
                <span className="block text-[11px] text-muted">
                  歌单内容（标题、BV号）任何人凭链接可见；不勾选则为私有，只能自己用 Token 读
                </span>
              </span>
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={() => void pushToCloud()} disabled={syncStatus === 'syncing'}>
              上传到云端
            </button>
            <button
              className="btn"
              disabled={syncStatus === 'syncing' || !githubToken}
              onClick={() => void pullFromCloud()}
            >
              从云端恢复
            </button>
          </div>

          <p className={`text-xs ${statusColor}`}>
            {syncStatus === 'syncing' && '同步中… '}
            {syncMessage || '就绪'}
          </p>
          <p className="text-[11px] text-muted">最后同步：{fmtTime(lastSyncAt)}</p>

          <button
            className="btn-danger w-full"
            onClick={() => {
              if (window.confirm('断开后本机将不再同步云端歌单（本地歌单保留），确定？')) {
                disconnectGithub()
              }
            }}
          >
            断开连接
          </button>
        </div>
      )}

      <p className="border-t border-white/5 pt-3 text-[11px] leading-relaxed text-muted">
        多设备注意：同一时间只在一台设备上修改，避免覆盖。冲突时以最后同步的一方为准。
      </p>
    </div>
  )
}
