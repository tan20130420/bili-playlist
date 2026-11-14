# 音频代理部署指南（纯音频 + 锁屏播放）

部署后可以：**只播放音频**、**手机锁屏/切后台继续播放**、锁屏界面切歌、拖动进度、自动连播。

## 为什么需要代理

实测结论（2026-11）：

| 检查项 | 结果 |
|---|---|
| B站音频 CDN 无 Referer 请求 | **403 拒绝** |
| B站音频 CDN 带 `Referer: bilibili.com` | 206 正常 |
| B站 playurl 接口无 buvid cookie | 403 风控页 |
| iframe 播放器锁屏后 | 暂停（浏览器策略，无法绕过） |

浏览器里的 `<audio>` 既无法伪造 Referer，也无法设置 Cookie 头，所以必须有一个服务端代理带着正确的请求头去取流。

## 选哪个平台

| 平台 | 国内可直连 | 说明 |
|---|---|---|
| **Netlify**（推荐） | 是 | 自有 CDN，实测 `*.netlify.app` 可访问 |
| Cloudflare Workers | 部分网络不行 | `*.workers.dev` TLS 握手在部分网络被重置 |

> 实测：同一 Cloudflare IP，SNI 为 `www.cloudflare.com` 正常 200，SNI 为 `*.workers.dev` 直接被 RST 重置。

---

## 方案一：Netlify（推荐，手机无需开代理）

代码位置：`netlify/edge-functions/bili-audio.js`（已在仓库里，无需改动）。

### 步骤

1. 打开 https://app.netlify.com ，**用 GitHub 账号登录**（不用注册新账号）
2. 点 **Add new site** → **Import an existing project**
3. 选 **GitHub** → 授权 → 选择 `bili-playlist` 仓库
4. 构建设置保持默认（`netlify.toml` 已写好：命令 `npm run build`、目录 `dist`）
5. 点 **Deploy site**，等 1-2 分钟
6. 拿到地址，形如 `https://calm-tiger-1234.netlify.app`
7. 在 B歌单 → 设置 → 音频 → 填入这个地址 → **测试连接** → 选**纯音频**

### 验证

浏览器打开：

```
https://你的站点.netlify.app/health
```

返回 `{"ok":true}` 即成功。

```
https://你的站点.netlify.app/audio?bvid=BV1GJ411x7h7&p=1
```

能播放/下载音频即完全打通。

### 说明
- 同一个 Netlify 站点**同时托管前端页面和音频代理**：`/` 是应用，`/audio` 是代理
- 以后 `git push` 到 main，Netlify 会自动重新部署
- 免费额度：每月 100GB 带宽 + 300 构建分钟，个人听歌绰绰有余
- 如果不想连 GitHub，也可把整个项目文件夹（含 `netlify/` 和 `netlify.toml`）拖到 https://app.netlify.com/drop

---

## 方案二：Cloudflare Workers（备选，需要能访问 workers.dev）

代码位置：`worker/bili-audio-worker.js`。

1. 登录 https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Hello World**
2. 名称随意，例如 `bili-audio` → **Deploy**
3. 点 **Edit code**，把 `worker/bili-audio-worker.js` 全文粘进去覆盖 → **Deploy**
4. 复制 `https://xxx.你的子域.workers.dev`，填到应用里

> 注意：`*.workers.dev` 在部分国内网络（尤其是手机流量）会被阻断。
> 如果你电脑开了 VPN 能访问、手机不能，说明属于这种情况，请改用 Netlify 方案。

---

## 接口说明（两个平台一致）

| 路由 | 参数 | 返回 |
|---|---|---|
| `GET /health` | - | `{"ok":true}` |
| `GET /audio` | `bvid` 或 `aid`、`p`（分P，默认1） | B站 DASH 音频流（m4a），支持 Range 拖动 |

自动选择最高码率音频流；主域名失败时自动切换 B站给的备用 CDN 域名。

---

## 常见问题

**`测试连接` 报无法连接**
- 用 workers.dev 地址：该域名在你的网络被限制，换 Netlify
- 用 netlify.app：站点是否部署成功？打开根路径看是不是你的 B歌单页面

**`/audio` 返回 `获取视频信息失败`**
B站接口临时风控，等几分钟再试；或换一个视频测试。

**`/audio` 返回 `音频源不可用（403）`**
B站调整了 CDN 校验策略，需要更新代理代码（`bili-audio-worker.js` 和 `netlify/edge-functions/bili-audio.js` 两份都要改）。

**手机锁屏后还是停**
- iOS Safari：首次需手动点一次播放，之后锁屏可继续
- 部分安卓浏览器需要在系统设置里允许该浏览器的通知/媒体权限

**音质一般**
未登录 B站时音频最高约 132kbps。要更高音质需在代理里带账号 cookie（有封号风险，不建议）。

---

## 隐私与合规

- 代理只转发你自己的播放请求，不落地存储任何音频
- 音频版权归 B站与原作者，仅供个人收听
