# B歌单（Bili Playlist）

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

## 说明
- 数据仅存于当前浏览器，清除浏览器数据会丢失歌单，请注意备份。
- 播放通过B站官方播放器 iframe 实现，音画质与B站一致。
