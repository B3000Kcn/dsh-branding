# 兼容性与验证范围

本文保留维护过程中的验证记录。相关测试与检查脚本仅保留在维护者本地，不随源码仓库分发，也不是插件运行或源码构建的依赖。

独立包 **dsh-branding 0.1.2**。包名、`cordis.patch.yml` 条目 id/name、客户端 ModuleLoader id、`configForms.get('dsh-branding')` 与设置页标识一致；应用名称字段为 `appName`，与同名 0.1.0 版本的配置键保持一致。

主界面横幅功能已纳入 0.1.2 安装包。旧配置缺少 `lightHeroScale`／`darkHeroScale` 时默认 100%，缺少 `lightHeroOffset`／`darkHeroOffset` 时默认 0px。图片继续复用 `lightBanner`／`darkBanner`，不新增图片副本，不修改 dsh 或 Agent 插件。

## 接口

- Host `settings.configure({ auto: false }, ctx.fiber)` 暴露 volatile 配置；客户端通过 `form.mutate(ops, expectedRevision)` 保存。图片、缩放、位移、应用名称均校验格式或范围。
- `theme.getTheme().active.colorScheme` 与 `theme/change` 选择日夜图片、缩放和位移。默认值为图片空、缩放 100%、位移 0px、应用名称空。
- `sidebar.brand.name` 插槽以 priority -1 接管原生品牌名称。仅当横幅实际渲染时通过 `data-slot` 与 `data-window-drag` 定位原生容器；右侧同排按钮预留右侧空间，Windows 左侧固定按钮预留左侧空间，macOS 独立上方开关条不占品牌行。
- 源码新增 `conversation.hero.brand.mark` root 单值插槽，以 priority -1 替换原图；同一位置有横幅且没有 VCP Agent 门户时才调整原图父容器并隐藏相邻标题。Agent 门户出现后由其既有样式隐藏整个品牌插槽，branding 的父容器尺寸规则同时退出。没有复制或移除原生标题／鱼节点；注销注册即可恢复。该插槽不携带预设信息，因此 VCP 未显示 Agent 时的原生占位区域也会显示横幅；不实现对预设数据的另一套判断。
- 配置 favicon 时以 priority -1 填充 `sidebar.brand.mark`，该原生插槽在展开品牌行及收起栏顶部共用，图片遵循 owner 的 `size`，以 `object-fit: contain` 显示。完整横幅显示时展开标记仍由横幅样式隐藏；原生 rail hover 和展开点击处理保持在宿主按钮上。图像加载失败、清空、配置不可用或卸载会撤销标记注册，交还原生图样；旧图片的迟到错误不撤销新注册。
- 浏览器 favicon 可逆接管原生 `rel="icon"` 节点，保留原位置和属性；不修改 PWA manifest 与 apple-touch-icon。
- 标签页标题使用 `sessions.list`、`layout.panelInfo` 与 title 观察器，保留话题名称并替换应用名称部分。清空或停用后恢复当前完整原生标题。
- Host 可选注入 `webServer`，通过 `tapIndex` 改写服务端 Web 首帧 title，按 HTML 规则转义应用名称；仅公开自定义名称及原生标题两个 meta。客户端首次配置 ready 前可使用启动快照，之后不复用旧快照。实验性 LiveShare 无设置读取权限时需刷新接收新的名称快照。

## 固定版本与边界

本次主界面横幅源码检查：四个测试文件的 65 项行为用例通过，语法／内存打包及两版静态接口检查通过；原有 `check:browser` 与新增 `node scripts/check-hero-browser.mjs` 均通过。新增 Chromium 156 检查覆盖普通横幅和 Agent 区域同时存在、Agent 门户出现／移除、换图／清空／日夜切换、主界面与侧栏独立缩放位移、缩放后平移距离仍为像素值、窄容器、真实坏图加载回退及卸载恢复。Agent 按钮的几何和点击在启用前后保持一致，包括 180px 极窄容器；该宽度下 Agent 自身的裁切未由本次改变。使用固定测试图片，全程 HTTP 请求为 0。

新增浏览器检查采用实际源码 bundle、两版 HeroShell／Sidebar CSS 和现有 Agent CSS，插槽及门户使用轻量 DOM 夹具；没有运行完整 React／DSH 或实际 Agent 服务，也不代表目标实例验收。本次经用户批准更新客户端构建并生成 0.1.2 安装包及 SHA256 校验文件；旧版四份归档／校验文件保持原值。

`0.1.1`（2026-10-31）已通过 `npm test`（四个测试文件，56 个行为用例）、`npm run check`、`npm run check:compatibility` 和 `npm run check:browser`。两个固定版本的离线浏览器回归均通过，HTTP 请求为 0；新增检查覆盖 favicon 在展开／收起原生标记槽的来源及 24px 尺寸、换图、清空、卸载时恢复原始节点、图像加载错误与迟到错误隔离，以及展开按钮点击。悬停检查遵循各版本的原生媒体条件；alpha.2 的 hover swap 仅在 `(hover: hover)` 生效。不等同于目标实例验证。

核对本地 Git 对象 DSH `0.2.1-rc.2`（`687f282e8625c6b8d11ff58211a90524be2e4317`）与 `0.2.2-alpha.2`（`f3803c96974ad4a94195fb97e5c637e9c2a3afe3`）；不宣称其他版本兼容。

行为检查使用 jsdom、轻量 React hooks 与宿主接口替身。浏览器检查使用本地 Chromium、真实 Sidebar CSS、实际内存 bundle 与离线 DOM 夹具，覆盖按钮占位后的居中、缩放、位移、日夜切换、favicon、首帧 HTML、话题／面板标题和卸载恢复；没有启动完整 React 或 DSH 实例。Host HTML 测试检查转义、公开数据、实时配置读取和 hook 清理。

独立登录插件不修改。桌面欢迎／更新独立窗口不属于 Web 标签页；静态 Electron／WebWorker 文档不经过服务端 index hook，在客户端插件启动后按运行时规则生效。没有部署到目标实例，也未验证实际鉴权、设置落盘／重启、多浏览器同步或真实 LiveShare。
