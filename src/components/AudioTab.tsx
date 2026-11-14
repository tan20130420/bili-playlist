import { useState } from 'react'
import { useLibrary } from '../stores/library'

export default function AudioTab() {
  const { audioMode, workerUrl, saveAudioConfig } = useLibrary()
  const [url, setUrl] = useState(workerUrl)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [msg, setMsg] = useState('')

  const save = () => {
    saveAudioConfig({ workerUrl: url })
    setMsg('已保存')
    setTestState('idle')
  }

  const test = async () => {
    const base = url.trim().replace(/\/+$/, '')
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
        setMsg('连接成功，可以切换为纯音频模式了')
      } else {
        setTestState('fail')
        setMsg('地址可访问，但返回内容不对，请确认部署的是本项目的代理代码')
      }
    } catch {
      setTestState('fail')
      setMsg('无法连接。若用的是 workers.dev 地址，可能是该域名被网络限制，建议改用 Netlify')
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
          placeholder="https://xxx.netlify.app 或 https://xxx.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>
            保存
          </button>
          <button className="btn flex-1" onClick={() => void test()} disabled={testState === 'testing'}>
            {testState === 'testing' ? '测试中…' : '测试连接'}
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
      </div>

      <details className="rounded-lg bg-panel2/60 p-3 text-xs text-muted">
        <summary className="cursor-pointer text-text/80">为什么需要代理？怎么部署？</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            B站音频 CDN 要求请求带 B站来源，浏览器里的播放器无法伪造；iframe 播放器锁屏就会暂停。
            所以需要一个自己的小代理（免费）。部署时填它的地址即可。
          </p>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent">方案一：Koyeb（推荐，手机无需代理）</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>GitHub 登录 https://app.koyeb.com</li>
              <li>Create Service → GitHub → 选 bili-playlist 仓库</li>
              <li>Builder 选 Dockerfile，目录填 server，端口 8080</li>
              <li>得到 https://xxx.koyeb.app，填到上面</li>
            </ol>
          </div>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent">方案二：Render（可直连，但会休眠）</p>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>GitHub 登录 https://render.com → New → Web Service</li>
              <li>选仓库，Root Directory 填 server，Start Command 填 node index.mjs</li>
              <li>得到 https://xxx.onrender.com</li>
            </ol>
          </div>
          <div className="rounded-md bg-bg/60 p-2">
            <p className="mb-1 font-bold text-accent2">方案三：Cloudflare Worker（需能访问 workers.dev）</p>
            <p>
              见项目 <code>worker/</code> 目录。workers.dev 在部分国内网络被阻断（TLS 被重置），
              有代理时可用。
            </p>
          </div>
          <p className="text-[11px]">
            详细步骤见项目里的 <code>server/README.md</code> 和 <code>worker/README.md</code>。
          </p>
        </div>
      </details>
    </div>
  )
}
