# 音频代理 · 通用 Node 版（Koyeb / Render 等）

零依赖，Node 18+ 直接跑。部署后得到 `https://xxx.koyeb.app` 之类的地址，填进 B歌单「设置 → 音频」。

## 为什么需要它

| 检查 | 结果 |
|---|---|
| B站音频 CDN 不带 `Referer: bilibili.com` | **403** |
| 带正确 Referer | 206 正常 |
| `playurl` 接口不带 buvid cookie | 403 风控页 |
| iframe 播放器锁屏 | 暂停（浏览器策略） |

浏览器 `<audio>` 既不能伪造 Referer 也不能加 Cookie 头，所以必须有个服务端代理；同时只有顶层 `<audio>` + MediaSession 才能锁屏播放。

---

## 先说结论：选哪个平台

实测国内网络可达性（2026-11）：

| 域名 | 可直连 | 备注 |
|---|---|---|
| `*.koyeb.app` | ✅ | **推荐**，免费层需绑卡验证身份 |
| `*.onrender.com` | ✅ | 免费但会休眠，冷启动约 50 秒 |
| `*.railway.app` | ✅ | 已取消免费层 |
| `*.netlify.app` | ✅ | 可用，但账号需正常 |
| `*.workers.dev` | ❌ | TLS 被重置（部分网络） |
| `*.pages.dev` | ❌ | 同上 |
| `*.vercel.app` | ❌ | 不通 |
| `*.deno.dev` | ❌ | 不通 |

> 若你的电脑开着代理能访问 workers.dev 而手机不能，属于 SNI 层阻断，换用上表中 ✅ 的平台即可。

---

## 方案一：Koyeb（推荐）

1. 打开 https://app.koyeb.com ，用 **GitHub 账号登录**
2. **Create Service** → **GitHub** → 选 `bili-playlist` 仓库
3. 关键配置：
   - **Builder**：选 `Dockerfile`
   - **Work directory**（或 Dockerfile path）：`server`
   - **Instance**：`Free` / `Nano`
   - **Port**：`8080`，协议 HTTP
   - **Health check path**：`/health`
4. 部署后拿到 `https://xxx.koyeb.app`
5. 打开 `https://xxx.koyeb.app/health`，返回 `{"ok":true}` 即成功

> Koyeb 免费实例在无流量时会缩容到 0，冷启动约几秒，比 Render 快很多。

---

## 方案二：Render

1. 打开 https://render.com ，GitHub 登录
2. **New** → **Web Service** → 选 `bili-playlist` 仓库
3. 配置：
   - **Root Directory**：`server`
   - **Runtime**：`Node`
   - **Build Command**：留空（无依赖）
   - **Start Command**：`node index.mjs`
   - **Instance Type**：`Free`
   - **Health Check Path**：`/health`
4. 部署后得到 `https://xxx.onrender.com`

> 免费实例 15 分钟无请求会休眠，休眠后第一次请求要等 30-60 秒。
> 想避免：用 UptimeRobot（免费）每 10 分钟 ping 一次 `/health`。

---

## 方案三：自建 VPS / 家里的 NAS

```bash
# 任意装 Node 18+ 的机器
cd server
PORT=8080 node index.mjs
```

建议用 pm2 或 systemd 常驻，再用 Nginx 反代并配 HTTPS。云服务器需在安全组放行端口。

---

## 方案四：Cloudflare Worker（需能访问 workers.dev）

见 `worker/bili-audio-worker.js`。适合网络能访问 `workers.dev` 的情况（如有代理）。
想彻底绕开封锁：注册一个免费域名（如 dpdns.org），把 NS 指向 Cloudflare，
给 Worker 绑定自定义域名（如 `bili.你的域名`），这样就不再走 `workers.dev`。

---

## 接口说明（所有版本一致）

| 路由 | 参数 | 返回 |
|---|---|---|
| `GET /health` | - | `{"ok":true}` |
| `GET /audio` | `bvid` 或 `aid`、`p`（分P，默认 1） | B站 DASH 音频流（m4a），支持 Range 拖动 |

- 自动选最高码率音频流
- 主域名 403 时自动切换 B站给的备用 CDN 域名
- 流式转发，不在服务器落盘、不占内存

注意一个 B站接口的坑（已处理）：`view` 接口用参数 `aid`，而 `playurl` 接口必须用 `avid`，写错会返回 `-400 请求错误`。

---

## 常见问题

**`测试连接` 失败**
先确认根路径能打开、`/health` 有返回；再确认手机网络能访问该域名。

**`获取视频信息失败`**
B站接口临时风控，等几分钟；或换个视频试。

**`音频源不可用（403）`**
B站改了 CDN 校验，需要更新代理代码（三个版本 `server/`、`worker/`、`netlify/` 都要同步改）。

**锁屏还是停**
iOS Safari 首次要手动点一次播放；安卓部分浏览器需允许通知权限才显示媒体控制。

**音质一般**
未登录时最高约 132kbps。要更高需带账号 cookie，有封号风险，不建议。

---

## 隐私与合规

- 代理只转发你自己的播放请求，不存储任何音频
- 音频版权归 B站与原作者，仅供个人收听
