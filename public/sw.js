/**
 * B歌单 Service Worker
 *
 * 作用（华为/鸿蒙设备重点）：
 *  - 让网页满足 PWA 可安装条件，从桌面图标启动后以「独立应用」身份运行，
 *    系统对其后台媒体的豁免等级更高，息屏播放更稳定
 *  - 缓存应用外壳，弱网/重启后秒开
 *  - 音频请求本身不缓存（B站直链有时效），只缓存静态资源
 */

const CACHE = 'bili-playlist-v1'
const SHELL = ['./', './index.html', './manifest.json', './favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 音频与代理接口：绝不缓存，直接放行走网络
  if (url.pathname.includes('/audio') || url.pathname.includes('/url') ||
      /bilivideo|akamaized|bilibili\.com|tencentscf/i.test(url.hostname)) {
    return
  }

  // 应用外壳与静态资源：缓存优先，后台更新
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetching = fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(event.request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || fetching
    }),
  )
})
