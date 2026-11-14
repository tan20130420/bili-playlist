# B歌单（Bili Playlist）

**线上地址：https://tan20130420.github.io/bili-playlist/**

把B站视频链接变成自己的在线音乐歌单：粘贴 BV/av 链接（支持分P）即可添加歌曲，用B站官方播放器播放。歌单和歌曲均支持增删改与排序，数据保存在浏览器本地（localStorage），无需登录、无需后端。

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

## 目录结构
```
src/
├── components/
│   ├── Sidebar.tsx     # 歌单列表：新建/重命名/删除/切换
│   ├── SongList.tsx    # 歌曲列表：添加/编辑/删除/上下移/预览播放
│   └── PlayerBar.tsx   # 底部播放条：当前歌曲/上一首/下一首/弹出播放器
├── stores/library.ts   # Zustand + persist，歌单数据与播放状态
│   └── SyncPanel.tsx   # 云端同步设置面板（Token / 上传 / 恢复 / 自动同步）
├── services/gist.ts    # GitHub Gist 读写（拉取/上传/校验 Token）
├── utils/bili.ts       # B站链接解析与 iframe 播放地址生成
├── types/index.ts      # 类型定义
├── App.tsx
├── main.tsx
└── index.css           # Tailwind + 全局样式
```

## 技术栈
- React 18 + Vite
- Tailwind CSS
- Zustand（persist 中间件，localStorage 持久化）
- B站官方 iframe 播放器（player.bilibili.com）

## 云端同步（换设备继续听）

歌单可备份到你自己的 GitHub 私有 Gist，换设备或清缓存后能恢复。

1. 打开应用右上角「云同步」→ 按提示生成 GitHub Token（只需 `gist` 权限）
2. 粘贴 Token → 「连接 GitHub」→「上传到云端」（首次会自动创建一个私有 Gist）
3. 新设备上用同一个 Token 连接，会自动找到云端备份，点「从云端恢复」歌单即回来（无需手填 Gist ID）

- 默认开启自动同步：歌单变更约 2.5 秒后自动上传，打开页面时自动拉取较新的版本
- Token 仅保存在浏览器 localStorage，不经过任何第三方服务器；建议使用 Fine-grained Token 并只勾选 `Gists: Read and write`
- 多设备同时修改以最后同步的一方为准，建议同一时间只在一台设备上编辑

## 说明
- 未连接 GitHub 时，数据仅保存在当前浏览器，清缓存会丢失。
- 播放通过B站官方播放器 iframe 实现，音画质与B站一致。
