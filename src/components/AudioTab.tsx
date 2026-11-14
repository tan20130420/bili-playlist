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
      setMsg('请先填写 Worker 地址')
      return
    }
    setTestState('testing')
    setMsg('测试中…')
    try {
      const res = await fetch(`${base}/health`)
      const data = (await res.json()) as { ok?: boolean }
      if (data.ok) {
        setTestState('ok')
        setMsg('连接成功，可以切换为纯音频模式了')
      } else {
        setTestState('fail')
        setMsg('地址可访问，但返回内容不对，请确认部署的是本项目的 Worker')
      }
    } catch {
      setTestState('fail')
      setMsg('无法连接，请检查地址是否正确、Worker 是否已部署')
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
          音频代理地址（Worker）
        </label>
        <input
          id="worker-url"
          className="input font-mono text-xs"
          placeholder="https://bili-audio.你的子域.workers.dev"
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
        <summary className="cursor-pointer text-text/80">为什么要代理？怎么部署？（免费 2 分钟）</summary>
        <div className="mt-2 space-y-1.5 leading-relaxed">
          <p>
            B站音频 CDN 校验 Referer，浏览器里的播放器无法伪造，直接播放会 403；
            同时 iframe 播放器在手机锁屏后会暂停。所以需要一个自己的小代理。
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>注册 https://dash.cloudflare.com （免费）</li>
            <li>Workers &amp; Pages → Create → Hello World → Deploy</li>
            <li>Edit code，粘贴项目里 <code>worker/bili-audio-worker.js</code> 全文 → Deploy</li>
            <li>复制形如 <code>https://xxx.workers.dev</code> 的地址，填到上面</li>
          </ol>
          <p className="text-[11px]">
            部署用到的代码已放在项目 <code>worker/</code> 目录，含详细说明。
          </p>
        </div>
      </details>
    </div>
  )
}
