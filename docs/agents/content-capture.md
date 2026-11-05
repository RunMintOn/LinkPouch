# 正文采集、X 收图与画廊

适用：修改正文/选区采集、X 站内入口、图片目录读写，或验证这些流程。

## 决策入口

先读 [ADR-0001](../adr/0001-local-content-collection.md)。`.scratch/reading-queue/spec.md` 是历史 V1 规格，其“临时队列、无正文存储”等旧限制不再适用。术语以根目录 `CONTEXT.md` 为准；用户操作见 `README.md`，此处不重复功能说明。

实现以本次需要的功能为界，复用现成能力。遇到实际失败再处理对应边界，避免为推测中的场景增加检查、回退链或额外配置。

## 可复用来源与抽取边界

本次对照过 Web Clipper 1.7.1 与 Defuddle 0.19.6 的关键源码：

- [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)：`src/content.ts` 的页面内抽取入口。无需连同模板、变量及 Obsidian 写入链路搬入本项目。
- [Defuddle](https://github.com/kepano/defuddle)：`src/extractors/twitter.ts`、`src/extractors/x-oembed.ts`、`src/types.ts`。实际依赖版本以本项目 lockfile 为准。

已确认的区别：

- `includeReplies: false` 排除评论，**不等于只保留一条帖子**；该版本 X extractor 仍可能保留作者连续自回复及引用帖。是否适配按 ADR 的“真实缺口”原则判断。
- DOM 抽取受已加载内容限制；`parseAsync()` 还有可能访问 FxTwitter/oEmbed 的网络路径。复用引擎不代表已证明长帖、串文一定完整。
- 引擎输出图片 URL 不代表文件已下载，也不代表原图分辨率；原图请求和文件写入由收图流程完成。

研究时的 `/tmp/obsidian-clipper`、`/tmp/defuddle` 是临时克隆，不能作为后续会话的依赖。

## 修改 X 入口时的注意点

实现入口是 `src/content.ts` 的 `mountImageButton()`。它依赖 X DOM，修改时用真实问题对应的 DOM 验证，而不是把通用抽取规则也一起重写。

该入口使用 `MutationObserver`。修改按钮的 `textContent`、插入按钮本身也会产生 `childList` 变化；保持“帖子/图片数或容器改变时才更新”的条件，避免观察器自己反复触发自己。

本地更新后需要重新加载扩展，**再刷新已有 X 页面**，旧页面里的 content script 不会因构建完成而自动换新。

## 可重跑的无头验证

从仓库根目录运行：

```bash
npm run build
node scripts/smoke-extension.mjs
```

脚本复用 PATH 上 `playwright-cli` 的 Playwright 库，以及 macOS `~/Library/Caches/ms-playwright/chromium-*` 中已有的 Chrome for Testing。它不安装浏览器、不连接用户浏览器；环境不同则只调整启动段，测试场景可直接复用。

脚本输出独立临时 profile 和截图位置。运行环境及测试数据的两个关键条件：

- 通过 `context.route()` 在 X 域名下提供文章/帖子 fixture，以复用 manifest 中已有站点权限。Capture 由扩展消息触发，**不验证系统快捷键或 activeTab 授权动作**。
- HTML fixture 的响应须声明 `text/html; charset=utf-8`。本次曾因缺少 charset 使中文乱码；那是 fixture 编码问题，不是 Defuddle 丢失或改写正文。

### 已覆盖与未覆盖

| 范围 | 证据与限制 |
| --- | --- |
| 正文、选段、搜索、内容查看 | 真实扩展与 Defuddle 运行在模拟网页；同 URL 两段文字分别保存，正文独有关键词可搜索 |
| Popup | 使用已保存的 capture session 打开扩展页面，检查实际保存内容的预览；不是工具栏弹窗生命周期测试 |
| X 收图按钮 | 模拟 DOM 验证整组图片右上角定位、悬停显示、整帖收图；点击不传播到图片容器 |
| 图片写入、画廊、放大、刷新后读取 | 使用 OPFS 原生目录句柄写入 IndexedDB，绕过系统目录选择器；实际读写文件，无插件内 Blob 副本 |
| 原图与评论 | 检查 `name=orig` 请求、文件字节和不含评论的结果；图片响应是 fixture，不证明真实 X 原图始终可用 |

尚未完整验证：真实 X 页面新版入口的 DOM 兼容性及实际下载、系统目录授权弹窗、外部目录权限跨浏览器重启保持。OPFS 测试通过不能当作这些项目也已通过。需要操作用户桌面时先获得授权。

无需每次修改重跑所有检查；按改动选择已有单元测试、构建或这条跨组件流程即可。原有手动备份的范围与当前数据丢失风险见 ADR，不把图片目录误认为完整备份。
