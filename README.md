# B歌单（Bili Playlist）

**线上地址：https://tan20130420.github.io/bili-playlist/**

把B站视频链接变成自己的在线音乐歌单：粘贴 BV/av 链接（支持分P）即可添加歌曲，歌单与歌曲均可增删改、排序。支持三种玩法：B站播放器看画面、纯音频听歌（可锁屏后台播放）、生成分享链接跨设备导入歌单。

## 快速开始

### 环境要求
- Node.js 18+

### 安装与运行
```bash
npm install
npm run dev      # 开发模式，默认 http://localhost:5173
npm run build    # 构建产物输出到 dist/
npm run preview  # 预览构建产物
```

## 功能

### 歌单管理
- 新建 / 重命名 / 删除歌单，顶部显示歌曲数
- 添加歌曲：粘贴完整链接、BV号、av号均可，支持 `?p=N` 分P参数，也可手动指定分P
- 每首歌可改名、改分P、删除、上移下移排序；重复歌曲自动拦截

### 换设备：三种方式，都不强制要 Token
| 方式 | 是否需要 Token | 说明 |
|------|---------------|------|
| **分享链接** | 不需要 | 歌单压缩进 URL 的 `#share=`，发给任何设备打开即导入 |
| **公开备份链接** | 不需要（读取端） | Gist 设为 public 后，凭 `#gist=ID` 链接只读导入 |
| **私有云同步** | 需要 | 自动上传/拉取，适合自己多设备长期使用 |

### 播放模式
| 模式 | 特点 | 需要 Worker |
|------|------|------------|
| 视频模式 | B站官方 iframe，有画面、有弹幕开关 | 不需要 |
| 纯音频 | 只出声、省流量、**手机锁屏可继续播放**、锁屏界面可切歌、自动连播 | 需要 |

## 目录结构
```
src/
├── components/
│   ├── Sidebar.tsx        # 歌单列表：新建/重命名/删除/切换
│   ├── SongList.tsx       # 歌曲列表：添加/编辑/删除/排序/预览
│   ├── PlayerBar.tsx      # 视频模式下的底部播放条
│   ├── AudioPlayer.tsx    # 纯音频播放器（audio + MediaSession）
│   ├── SettingsModal.tsx  # 设置弹窗（三个标签）
│   ├── SyncPanel.tsx      # 云端同步
│   ├── AudioTab.tsx       # 播放方式与 Worker 地址
│   └── ShareTab.tsx       # 分享链接生成 / 导入
├── stores/library.ts      # Zustand + persist，数据与同步状态
├── services/gist.ts       # GitHub Gist 读写（公开 Gist 可匿名读取）
├── utils/bili.ts          # B站链接解析与 iframe 地址
├── utils/share.ts         # 分享码压缩编码/解码
├── types/index.ts
├── App.tsx
├── main.tsx
└── index.css
worker/
├── bili-audio-worker.js   # Cloudflare Worker 音频代理
└── README.md              # 部署步骤
```

## 纯音频 / 锁屏播放（需要一次性部署 Worker）

### 为什么要代理
- B站音频 CDN 校验 `Referer`，浏览器里的 `<audio>` 无法伪造，直接播会 403
- `playurl` 接口需要 `buvid` cookie，否则被风控拦
- iframe 播放器一旦锁屏就暂停，只有顶层 `<audio>` + MediaSession 能后台播放

### 部署（Cloudflare Workers，免费，约 2 分钟）
1. 登录 https://dash.cloudflare.com → Workers & Pages → Create → Hello World → Deploy
2. Edit code → 粘贴 `worker/bili-audio-worker.js` 全文 → Deploy
3. 复制 `https://xxx.workers.dev` 地址
4. 回到 B歌单 → 设置 → 音频 → 填入地址 → 测试连接 → 选「纯音频」

详见 [worker/README.md](worker/README.md)。

## 技术栈
- React 18 + Vite + TypeScript
- Tailwind CSS
- Zustand（persist 中间件，localStorage 持久化）
- GitHub Gist API（云同步 / 公开分享）
- Cloudflare Workers（音频代理）
- CompressionStream / MediaSession Web API

## 数据与隐私
- 歌单默认只存在本机 localStorage，清缓存会丢失
- 云同步写入**你自己的** Gist，Token 仅存本机浏览器，不经过任何第三方服务器
- 勾选「公开备份」时歌单内容（标题、BV号）任何人凭链接可见，私有歌单不要开
- 分享链接把歌单编码在 URL 里，不经服务器，也不可被搜索到（但链接本身谁拿到谁能解）

## 说明
- 版权归B站与原作者所有，仅供个人收听
- 部分 UP 主关闭了外链播放，这类视频 iframe 会提示禁止嵌入
