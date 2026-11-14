# 音频代理 Worker（可选部署）

部署后可以：
- **只播放音频**（不看视频画面）
- **手机息屏/切后台继续播放**，锁屏界面有播放控制
- 拖动进度条、自动连播下一首

不部署也能正常用，只是播放时仍然是B站 iframe（有画面，但锁屏会停）。

---

## 部署（Cloudflare Workers，免费，约 2 分钟）

### 方式一：网页控制台（最简单，不用装任何东西）

1. 注册/登录 https://dash.cloudflare.com （免费，不用绑卡）
2. 左侧菜单 **Workers & Pages** → **Create** → **Start with Hello World!**
3. 名称随便填，例如 `bili-audio` → **Deploy**
4. 点 **Edit code**，把本目录 `bili-audio-worker.js` 的**全部内容**粘贴进去，覆盖原内容
5. 右上角 **Deploy**，等待生效
6. 复制你的 Worker 地址，形如
   `https://bili-audio.你的子域.workers.dev`
7. 打开 B歌单 → 右上角「云同步」旁的设置（或播放器里的「音频设置」）→ 填入这个地址 → 保存

### 方式二：命令行

```bash
npm i -g wrangler
wrangler login
wrangler deploy bili-audio-worker.js --name bili-audio
```

---

## 验证部署是否成功

浏览器直接访问：

```
https://你的Worker地址/health
```

返回 `{"ok":true}` 即成功。再试：

```
https://你的Worker地址/audio?bvid=BV1GJ411x7h7&p=1
```

能开始下载音频、或用播放器打开能出声，就是正常。

---

## 接口说明

| 路由 | 参数 | 说明 |
|------|------|------|
| `/health` | - | 健康检查，返回 `{"ok":true}` |
| `/audio` | `bvid` 或 `aid`、`p`（分P，默认1） | 返回音频流，支持 Range 拖动 |

返回的音频是 B站 DASH 音频流（m4a），已选最高码率。

---

## 免费额度与限制

- 免费版每天 **10 万次请求**，个人听歌完全够用
- 每次播放按 Range 分段请求，一首歌通常几十次请求
- 不支持登录才能看的高清音频（未登录最高 132kbps 左右，够听）
- 若B站改接口导致失效，只需更新 Worker 代码里的接口路径即可

## 注意事项

- 该 Worker 只代理你自己的播放请求，不存储任何音频内容
- 公开部署意味着别人知道地址也能用，如担心可只自己用、不分享地址
- 版权归B站与原作者所有，仅供个人收听
