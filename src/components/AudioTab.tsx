import { useState } from 'react'
import { useLibrary } from '../stores/library'

interface DebugPayload {
  ok?: boolean
  cookie?: string
  view?: { status: number; code?: number; message?: string; title?: string; raw?: string }
  resolve?: { error?: string; step?: string; detail?: string; bandwidth?: number }
  error?: string
}

export default function AudioTab() {
  const { audioMode, workerUrl, saveAudioConfig, playlists, currentSongId, activePlaylistId } =
    useLibrary()
  const [url, setUrl] = useState(workerUrl)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [msg, setMsg] = useState('')
  const [diagLines, setDiagLines] = useState<string[]>([])
  const [diagging, setDiagging] = useState(false)

  const save = () => {
    saveAudioConfig({ workerUrl: url })
    setMsg('已保存')
    setTestState('idle')
  }

  const baseOf = () => url.trim().replace(/\/+$/, '')

  const test = async () => {
    const base = baseOf()
    if (!base) {
      setMsg('请先填写代理地址')
      return
    }
    setTestState('testing')
    setMsg('测试中…')
    try {
      const res = await fetch(`${base}/health`, { cache: 'no-store' })
      const data = (await res.json()) as { ok?: boolean }
      if (data.ok) {
        setTestState('ok')
        setMsg('地址可访问。再点「诊断音频」确认能否取到B站音频流')
      } else {
        setTestState('fail')
        setMsg('地址可访问，但返回内容不对，请确认粘贴的是本项目的代理代码')
      }
    } catch {
      setTestState('fail')
      setMsg('无法连接。若用 workers.dev，该域名可能被网络限制，建议换 Koyeb / Render')
    }
  }

  /** 用当前歌单里的一首歌实际走一遍 /debug */
  const diagnose = async () => {
    const base = baseOf()
    if (!base) {
      setMsg('请先填写代理地址')
      return
    }
    const all = playlists.flatMap((p) => p.songs)
    const song =
      all.find((s) => s.id === currentSongId) ??
      playlists.find((p) => p.id === activePlaylistId)?.songs[0] ??
      all[0]
    if (!song) {
      setMsg('歌单里还没有歌曲，先添加一首再诊断')
      return
    }
    setDiagging(true)
    setDiagLines([])
    const idq = song.bvid ? `bvid=${song.bvid}` : `aid=${song.aid ?? ''}`
    const lines: string[] = [`诊断歌曲：${song.title}（${idq} P${song.page}）`]
    try {
      const res = await fetch(`${base}/debug?${idq}&p=${song.page}`, { cache: 'no-store' })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('json')) {
        lines.push(`✗ 代理没有 /debug 接口（HTTP ${res.status}）`)
        lines.push('→ 你的代理可能是旧版代码，请重新粘贴 worker/bili-audio-worker.js 最新全文')
        setDiagLines(lines)
        return
      }
      const data = (await res.json()) as DebugPayload
      if (data.error) {
        lines.push(`✗ ${data.error}`)
      }
      if (data.view) {
        lines.push(
          data.view.code === 0
            ? `✓ B站视频信息正常：${data.view.title ?? ''}`
            : `✗ B站视频信息失败：code=${data.view.code} ${data.view.message ?? ''}（HTTP ${data.view.status}）`,
        )
        if (data.view.code !== 0 && data.view.raw) {
          lines.push(`  原始响应：${data.view.raw.slice(0, 120)}`)
          lines.push('  → 这是B站风控，通常因 Cloudflare 机房 IP 被拦，可稍后重试或改用 Koyeb/Render')
        }
      }
      if (data.resolve) {
        if (data.resolve.error) {
          lines.push(`✗ 取音频流失败（步骤 ${data.resolve.step ?? '?'}）：${data.resolve.error}`)
          if (data.resolve.detail) lines.push(`  原始响应：${String(data.resolve.detail).slice(0, 120)}`)
        } else {
          lines.push(`✓ 已取到音频流，码率约 ${Math.round((data.resolve.bandwidth ?? 0) / 1000)} kbps`)
          lines.push('→ 代理链路完全正常，回到播放器重试即可')
        }
      }
    } catch {
      lines.push('✗ 无法连接代理的 /debug 接口')
      lines.push('→ 确认地址正确、当前网络能访问该域名')
    } finally {
      setDiagging(false)
      setDiagLines(lines)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">播放方式</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              audioMode === 'iframe'
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-white/10 text-muted hover:bg-panel2'
            }`}
            onClick={() => saveAudioConfig({ audioMode: 'iframe' })}
          >
            视频模式
            <span className="mt-0.5 block text-[11px] opacity-70">B站播放器，有画面</span>
          </button>
          <button
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              audioMode === 'audio'
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-white/10 text-muted hover:bg-panel2'
            }`}
            onClick={() => saveAudioConfig({ audioMode: 'audio' })}
          >
            纯音频
            <span className="mt-0.5 block text-[11px] opacity-70">只出声，锁屏可放</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-muted" htmlFor="worker-url">
          音频代理地址
        </label>
        <input
          id="worker-url"
          className="input font-mono text-xs"
          placeholder="https://xxx.koyeb.app 或 https://xxx.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-primary" onClick={save}>
            保存
          </button>
          <button className="btn" onClick={() => void test()} disabled={testState === 'testing'}>
            {testState === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button className="btn" onClick={() => void diagnose()} disabled={diagging}>
            {diagging ? '诊断中…' : '诊断音频'}
          </button>
        </div>
        {msg && (
          <p
            className={`text-xs ${
              testState === 'ok' ? 'text-accent' : testState === 'fail' ? 'text-red-400' : 'text-muted'
            }`}
          >
            {msg}
          </p>
        )}
        {diagLines.length > 0 && (
          <div className="space-y-1 rounded-lg bg-panel2/70 p-2.5">
            {diagLines.map((line, i) => (
              <p
                key={i}
                className={`break-all font-mono text-[11px] leading-relaxed ${
                  line.startsWith('✓')
                    ? 'text-accent'
                    : line.startsWith('✗')
                      ? 'text-red-400'
                      : 'text-muted'
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="rounded-lg bg-panel2/60 p-3 text-xs text-muted">
        <summary className="cursor-pointer text-text/80">为什么需要代理？怎么部署？</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            B站音频 CDN 要求请求带 B站来源，浏览器里的播放器无法伪造；iframe 播放器锁屏就会暂停。
            所以需要一个自己的小代理（免费）。部署时填它的地址即可。
          </p>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent">方案一：Koyeb（推荐，国内可直连，不休眠）</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>GitHub 登录 https://app.koyeb.com</li>
              <li>Create Service → GitHub → 选 bili-playlist 仓库</li>
              <li>Builder 选 Dockerfile，目录填 server，端口 8080</li>
            </ol>
          </div>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent">方案二：Render（不用绑卡，会休眠）</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>GitHub 登录 https://render.com → New → Web Service</li>
              <li>Root Directory 填 server，Start Command 填 node index.mjs</li>
            </ol>
          </div>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent2">方案三：Cloudflare Worker（需能访问 workers.dev）</p>
            <p>
              见项目 <code>worker/</code>。workers.dev 在部分国内网络被阻断，
              需要手机能直连或开着代理。
            </p>
          </div>
          <p className="text-[11px]">
            详细步骤见 <code>server/README.md</code> 与 <code>worker/README.md</code>。
          </p>
        </div>
      </details>
    </div>
  )
}
