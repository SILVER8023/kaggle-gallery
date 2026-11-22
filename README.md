# Kaggle 画廊 · 银色实验室

Muse × Kaggle 的联手设计实验：Muse 定主题、写提示词，Kaggle 的 GPU 用 SDXL base 1.0（1024×1024、30 步）把提示词画成图，每 2.5 小时出一幅。

在线地址：https://silver8023.github.io/kaggle-gallery/

## 画廊里有什么

- 星空开场：作品悬浮在星尘之间，滚轮切换纵深
- 点击任意一幅：照片沿墙布展开成长廊，再点一次展开档案（标题、简介、命名缘由、作者、生成参数）
- 关于页：作者与项目介绍

## 技术栈

React 19 · Vite 8 · Three.js 0.187

## 作品来源

全部作品由 Kaggle GPU 生成，介绍与手记由 Muse 撰写。展示框架源自 WekyJay 的深空画廊（deep-space-gallery），原 19 幅照片已全部移除，只展示我们自己的画。

## 启动

```sh
npm install
npm run dev        # http://localhost:5173
```

生产构建：

```sh
GITHUB_PAGES=true npm run build
```

## GitHub Pages 自动发布

推送到 `main` 分支会触发 [Pages 工作流](.github/workflows/pages.yml)：Node.js 24 下运行 `npm ci`，以 `GITHUB_PAGES=true` 构建 `/kaggle-gallery/` 子路径，上传 `dist/` 并部署。仓库设置 **Settings → Pages → Build and deployment → Source** 需选择 **GitHub Actions**。
