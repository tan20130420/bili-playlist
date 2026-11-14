# 部署到线上

本项目是纯前端静态站点，`npm run build` 后 `dist/` 目录即可直接托管，不需要服务器和数据库。
`vite.config.ts` 中 `base: './'` 已配置为相对路径，所以部署到根目录或子路径（如 GitHub Pages 的 `/仓库名/`）都能正常加载。

---

## 方案对比

| 平台 | 免费额度 | 上手难度 | 自带域名 | 适合 |
|------|---------|---------|---------|------|
| **Netlify**（推荐） | 100GB/月流量 | 最低，可拖拽上传 | xxx.netlify.app | 想最快上线 |
| **Cloudflare Pages** | 无限请求 | 低 | xxx.pages.dev | 国内访问相对稳 |
| **Vercel** | 100GB/月 | 低 | xxx.vercel.app | 后续可能加后端 |
| **GitHub Pages** | 1GB/月 | 中（要建仓库） | 用户名.github.io/仓库名 | 有 GitHub 账号 |

> 提示：以上境外平台的免费默认域名在国内偶尔访问慢。如果要给国内朋友用，可考虑腾讯云 CloudBase 静态托管、阿里云 OSS + CDN（需备案域名）。

---

## 方式一：Netlify 拖拽上线（最快，1 分钟）

无需命令行、无需 Git：

1. 本地执行 `npm install && npm run build`，得到 `dist/` 目录
2. 打开 https://app.netlify.com/drop
3. 把 `dist` **文件夹**直接拖进页面
4. 生成随机域名即完成，站点设置里可改成 `xx.netlify.app`、绑定自定义域名、开启 HTTPS

后续更新：重新拖一次新的 `dist` 目录即可。

### 用 Git 自动部署（推荐长期用）
1. 把项目推到 GitHub / Gitee 仓库
2. Netlify → Add new site → Import an existing project → 选仓库
3. 构建命令 `npm run build`，发布目录 `dist`（仓库内的 `netlify.toml` 已写好，会自动识别）
4. 之后每次 push 到 main 自动重新部署

---

## 方式二：Cloudflare Pages

1. 登录 https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. 选仓库，构建配置：
   - Framework preset：`Vite`
   - Build command：`npm run build`
   - Build output directory：`dist`
3. 保存部署，得到 `项目名.pages.dev`

也可以用命令行（无需 Git 仓库）：
```bash
npm i -g wrangler
npm run build
npx wrangler pages deploy dist --project-name bili-playlist
```

---

## 方式三：Vercel

网页方式：https://vercel.com/new 导入仓库即可，`vercel.json` 已配置好构建命令与输出目录。

命令行方式：
```bash
npm i -g vercel
npm run build
vercel --prod
```

---

## 方式四：GitHub Pages

1. 在 GitHub 新建仓库，把项目推上去（分支 `main`）
2. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**
3. 仓库内 `.github/workflows/deploy.yml` 会在每次 push 时自动构建并发布
4. 地址为 `https://用户名.github.io/仓库名/`

`base: './'` 保证了子路径下资源能正确加载，无需额外改配置。

---

## 部署后自查清单

- [ ] 页面能打开，样式正常（无白屏 / 无 404 资源）
- [ ] 新建歌单、添加歌曲、播放 iframe 正常
- [ ] 手机浏览器打开布局正常
- [ ] 刷新页面后歌单仍在（localStorage 生效）
- [ ] 用 https 访问（B站 iframe 与部分浏览器 API 要求 https）

## 常见问题

**播放器提示「该视频禁止嵌入」**
该 UP 主关闭了外链播放权限，不是部署问题；换一个视频即可。

**刷新 404**
本项目是单页且无前端路由，一般不会出现。若加了路由，需要在平台配置所有路径回退到 `index.html`（`vercel.json` 已内置该规则）。

**换设备歌单不见**
数据存在浏览器 localStorage，不随账号同步。换设备或清缓存会丢失，需要跨设备请加后端存储或导出/导入功能。
