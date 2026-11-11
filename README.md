## Puyu Admin Web（PC Web - A）

本目录保留 Vben Admin 5.x 的上游模板能力，并在 `apps/web-antd` 中实现琢玉壹方 PC Web - A。页面来源为 [`projects/puyu-admin/docs/page-specs`](../puyu-admin/docs/page-specs)。默认保留local mock；32个业务页均有真实模式入口（平台17/商户15），不等于全部操作实机通过。当前功能、运行版本与待验项目以[现役验收总表](../../docs/harness/puyu-p0-acceptance-status.md)为准，下文日期段落是分批历史证据。

分层约定：

- `src/ui/pc-web-a`、`src/views`、`src/router`：PC Web - A UI、公共 UI 协议和路由。
- `src/application`：不依赖 Vue/Vben 的业务 Service。
- `src/data`：Admin API adapter、Repository、权限数据和 mock。
- `src/infrastructure`：权限中间件、`CacherManager` 和运行时基础设施。

SKU 只能从商品详情维护；平台商品、分类、品牌的驳回/下架必须填写原因；真实权限和数据范围仍需由 Gateway、`puyu-bff-admin` 和 Core 服务完成。

当前菜单采用两级业务结构：`琢玉壹方后台 → 业务分组 → 页面`。平台后台和商家后台
通过业务分组直接区分，不再增加“平台后台/商家后台”的中间菜单层。
顶部提供“平台后台 / 商户后台”角色切换按钮；切换后只显示对应角色的业务分组菜单，
并跳转到该角色的默认首页。该切换仅用于 local mock 原型展示，不代表真实后端权限。
Vben 的 Dashboard、Demos、Vben 文档/GitHub、手机号登录、扫码登录和注册页面不进入本项目菜单。

本项目的最小验证命令：

```bash
mise exec node@24.18.0 -- corepack pnpm -F @vben/web-antd typecheck
mise exec node@24.18.0 -- corepack pnpm -F @vben/web-antd build
mise exec node@24.18.0 -- corepack pnpm permissions:check
```

### 本地真实模式

后端Gateway9988及Auth/BFF/Core必须已运行，工作区`.local/puyu-admin/secrets.json`为此前批准初始化的私有凭据。
使用`mise exec node@24.18.0 -- node tools/dev-real.mjs`启动，访问`http://127.0.0.1:5666/`。
普通`dev:antd`仍为Mock入口；切换模式需重新启动开发服务，两个模式的会话命名空间隔离。

真实模式的菜单和操作由`/admin-api/v1/catalog/actor`实际身份决定，不能用顶部切换按钮变更权限。
首次平台账号使用本地初始化生成的验收管理员；商户账号通过平台入驻产生，初始密码沿用后端手机号后8位规则。
真实表单带记录ID和version；保存失败保留输入，SKU仅在当前商品详情维护，不能通过SKU编辑直接改已有库存。

开发代理仅将OAuth客户端密钥注入固定Gateway token路径，**不得将密钥放入VITE变量或客户端源码**；不是生产认证方案。
本机5666代理仅接受精确loopback Host/Origin并拒绝cross-site请求；校验后移除上游Origin，将浏览器同源请求转换为开发服务器到Gateway请求，避免后端精确CORS误拒。规则在`tools/local-proxy-origin.ts`，不改变Gateway/Auth的CORS配置。
`tools/check-real-bundle-secrets.mjs`检查构建产物没有本地服务器凭据，`tools/vitest-real.config.ts`包含接口与身份边界的隔离测试。
测试命令：`mise exec node@24.18.0 -- corepack pnpm exec vitest run --config tools/vitest-real.config.ts`。
实际页面验收进度见工作区`docs/harness/puyu-p0-acceptance-status.md`；`puyu-admin-web-real-flow.acceptance.md`保留最初商户/目录批次历史，未完成的业务步骤不得标为通过。

### 库存、订单与工单对接

- `data/operationsApi.ts`：对应现有Admin BFF业务DTO和请求封装，ID/金额/库存保持字符串；不直连Core。
- `application/operationsService.ts`：输入与状态校验、幂等请求号、文件解码；不依赖Vue和DOM。
- `views/puyu-admin/real/Inventory.vue`：分页筛选、SKU库存、版本化调整、调整流水。
- `Orders.vue` / `CreateOrder.vue`：无支付订单列表与详情、本商户发布商品/SKU创建表单、确认/核销/取消、后端打单数据与隔离打印预览。创建表单只提交SKU/数量与联系资料，后台核价；按钮在左下方。

2026-10-22本机Chrome已通过PC Web创建ORD-9（数量2.5、金额250）、确认/核销按钮及Mobile同账号状态同步，打单预览通过；实际打印/取消/多页数据未纳入此次真实验收。完整证据见工作区`docs/harness/puyu-admin-web-order-create.impact.md`。
- `Tickets.vue`：商户提交、商品与SKU联动、双端列表详情、接单/指派/优先级/交付/驳回/取消/确认完成、处理记录。
- `BusinessFiles.vue`：附件与模型上传、归属商户、文件下载；模型先读取下载报价和记录，确认后调用额度校验下载接口，不走普通附件下载接口。

新增`permission.canManageInventory()`、`canManageOrders()`、`canSubmitWorkorder()`仅授予真实MERCHANT；`canProcessWorkorder()`仍仅授予PLATFORM。BFF与Core保留最终角色、商户范围和状态校验。

同一打开表单、相同提交内容在失败重试时复用requestId；变更内容或重新打开操作使用新的requestId。版本冲突不会自动强制覆盖或重试库存写入。

本轮自动化测试和真实写入联调是两类证据。库存/订单/工单历史对接状态见工作区`docs/harness/puyu-admin-web-operations.acceptance.md`，当前设计师等补齐状态以下节为准，不能用Mock操作作为实际业务结果。

### 设计师、合作关系、额度、账单与设置（2026-10-23）

原31项业务页全部接入真实模式，加上新增商户首页共32项；不含登录页与预留装修后台。当前32项页面入口已可用，不等同于所有业务副作用已验收。

- `data/adminBusinessApi.ts`：按既有AdminBusinessController/DTO封装，不调用Core；ID、额度、金额保持字符串。
- `application/adminBusinessService.ts`：校验、显式请求投影、草稿/账单终态约束，不依赖Vue或DOM。
- `Designers.vue`：列表筛选/额度摘要、统一详情与编辑字段、入驻、主合作商户、图片与认证附件、只读授权和作品数量未接入标记。
- `Cooperation.vue`：本人关系列表、授权编辑、手机号查找与绑定、创建合作商、两类二维码及状态/扫码/历史、主动加载PNG。
- `Credits.vue`：额度账户/流水/CSV、草稿保存/编辑/取消/独立确认提交；规则Nacos只读，额度不是支付。
- `Billing.vue`：月统计、按商户/状态查询、待入账保存、独立确认/作废及历史；确认记录不可作废抹账。
- `Dashboard.vue` / `Settings.vue`：平台/商户各自一级首页，真实模型使用统计和待办；基础设置三个可写字段和版本，菜单/费用规则不编辑。

新增五个canXxx仍从后端actor固定角色映射；平台有设计师/额度/账单/设置，商户有本人合作关系；不建复杂角色系统。19项最小权限目录仍只输出name/menuKey/labelKey。商户真实登录默认到商户首页，固定角色切换仍需重新登录。

2026-10-23已获单独批准并完成限定Chrome真实写入：新商户27、设计师28、合作商及新关系8/9，二维码7/8，额度草稿1/2（+10后-10恢复0），两张0元OTHER账单分别确认/作废，命名说明临时保存后恢复为空（version3、提醒30、审核true）。关系和二维码最终停用，价格/模型授权关闭；原有业务记录未修改。此轮发现并修复设计师编辑保存后旧版本/模式、额度汇总未刷新、二维码操作列空白/预览历史未刷新。Admin BFF PATCH传输另获批准修复并只重启20107，无API签名或数据库变更。

当前自动验证为7文件78项、typecheck、real构建、19项权限目录和262份bundle密钥扫描通过。扫码绑定端到端、额度CSV实际下载、赠送/取消草稿、非零入账和服务期联动未在此次Chrome写入范围验证，不等于完整P0完成。详见工作区`docs/harness/puyu-admin-web-business-completion.acceptance.md`。

## 商品与SKU Excel（2026-10-24）

- 商户商品列表：商品资料`PRODUCT`、商品价格`PRODUCT_PRICE`；商品详情SKU区：`SKU`、`SKU_PRICE`，后两种始终携带当前商品ID，无独立SKU/Excel路由。
- 复用现有`/admin-api/v1/business/workbooks/template`、`export`和multipart `import`，不改后端契约；下载返回字段是`rowCount`而非`rows`，金额/ID保留文本。
- 下载模板、按列表当前关键词/审核状态导出（不局限当前页）；仅商户`canEditProduct()`入口，平台无Workbook工具。Core仍独立校验角色/归属，前端不传merchantId授权。
- 导入仅`.xlsx`、1字节至5MiB/200行；选择不上传，弹窗左下方确认后才写入。原文件/模式/商品形成一个命令，网络失败或关闭重开保留requestId；换文件/模式才新建，成功刷新列表或当前商品/SKU。更新可能撤下展示并要求重审，已有SKU库存不能借导入绕过调整流水。
- 新增37项隔离验证，总9文件115项；真实导入未批准，不冒充数据库写入通过。Chrome使用既有零商品商户检查工具、商品两模式模板/空导出响应与非xlsx本地拦截；有数据SKU及浏览器文件落盘仍待核验。
- 本Excel批不含目录批量操作与商户独立上下架，后续进展见下一节。详情见工作区`docs/harness/puyu-admin-web-workbooks.acceptance.md`。

## 商品、分类、品牌批量操作（2026-10-26）

- 仅六个真实目录列表增加本页多选/全选、已选数量、清空及批量确认；不跨页选择，查询/翻页/刷新清空。列表新增启用状态列，与审核/平台展示分开。
- 商户SUBMIT/ENABLE/DISABLE，平台PUBLISH/REJECT/OFFLINE；只用既有canXxx，对应BFF canBatch的固定角色、Core归属/版本/状态/事务不变。无新增菜单/路由/权限Key、后端依赖或API。
- 确认显示名称、编码、ID、version及三状态，驳回/下架原因必填≤1000；任何不合格项阻止整批，不默默过滤。每批1–100不同记录，Core失败整批回滚。
- 独立Service封装校验与不可变命令，数据层只调用POST `/admin-api/v1/business/catalog/batch`。同载荷失败/关闭重开重试保留requestId，改原因或对象生成新命令，并发确认去重；API失败沿公共错误弹框并保留本地错误。
- 批量写入成功和列表刷新分离，清空旧选择并重读；读取失败不触发二次写入。启用不等于平台发布，分类品牌更改可能影响关联商品；品牌关联在售商品时不能直接停用。
- 本批新增46项隔离回归，总12文件161项。获批后Chrome既有商户22有数据只读检查通过：全选/单选、确认快照后取消、清空/刷新/查询/切页归零；未提交批量动作。列表不足一页，实机跨页、平台治理弹窗与真实写入未验收，不沿用旧fixture许可。单条启停进展见下节，批量改分类/标签未接入。
- 唯一Markdown页面说明书更新六页及index，记录见工作区`docs/harness/puyu-admin-web-catalog-batch.acceptance.md`。

## 商户行内单条启用 / 停用（2026-10-26）

- 商品、分类、品牌三列表按当前enabled显示“停用/启用”，仅对应商户canEditXxx。平台、表单、详情和SKU页面不增加此入口，也没有自动发布按钮。
- 复用CatalogBatch确认组件的单条入口，传独立目标快照，不修改复选或携带其他所选记录。名称/编码/ID/version/三状态、风险说明与左下方确认/取消统一；成功按实际1条显示，清空旧选择刷新，失败保留原操作号。
- 沿既有Service/Repository发送POST `/admin-api/v1/business/catalog/batch`，items仅1个id/version、action ENABLE或DISABLE；不回传完整商品字段。启用不是平台发布，不恢复平台治理下架，也不绕过品牌关联在售商品规则。
- 新增13项SFC回归，总12文件174项通过，typecheck、real构建、19项权限目录与格式通过。Chrome沿既有已登录会话核对商品33、分类31、品牌32单条停用确认后取消；商品复选另一记录27时单条仍只有33，取消后原复选保留。没有点击确认提交。
- 当前真实记录均启用，停用记录的启用显示及成功写入仅隔离测试覆盖；未做真实状态写入。验收见工作区`docs/harness/puyu-admin-web-catalog-single-state.acceptance.md`。

商品Excel、目录批量和行内单条启停的PC代码已接入，实际写入仍按各验收记录批准与覆盖范围执行；Mobile未确认能力仍另批。本批不改后端/Nacos/数据库、不需要provider发布或缓存删除。页面说明书继续唯一维护在`projects/puyu-admin/docs/page-specs`，没有复制第二套或YAML规格。

## 商品闭环限定真实验收（2026-10-29）

上面2026-10-24/26的“未真实写入”是当时状态；本轮获明确批准后，已在M-27仅用新分类34/35、品牌36/37、商品38/39、SKU12/13及图片19/20完成真实闭环：分类驳回/理由回显/整改再发布，商品平台发布/下架与理由回显，单条及批量启停、双UI版本冲突整批回滚、品牌关联在售保护、四模式Excel真实导入、旧版本价格表整批回滚及库存保护。最终六目录均停用未展示，SKU库存0，M-27订单/工单/模型/余额仍0；保留记录和历史，不删除旧资料。

真实验收发现导入成功反馈被父刷新清掉，另获仅前端最小修复许可：CatalogWorkbook只监听上下文kind/productId标量，不因等价对象重渲染清理；新增两条回归先失败后通过，成功批次4/5/6回读正常。当前12文件176项、typecheck、real构建、权限目录19、2文件格式与266份bundle精确凭据扫描通过；无后端/API/权限/数据库结构变化，不需发布或缓存刷新。

四模式模板与有数据导出响应的文件名/rowCount和下载发起已检查，浏览器实际落盘/下载文件内部内容未核对；真实断网同键重传、超限/大数据和实机跨页未覆盖，不能标完整P0完成。详情见工作区`docs/harness/puyu-admin-catalog-live-acceptance.acceptance.md`。

## 额度草稿验收与CSV结果反馈（2026-10-29）

获批的账户28草稿限定验收已完成：仅新草稿3保存GIFT10、编辑20后取消，刷新后终态只读；从未提交额度，商户余额仍0，旧流水13/14及旧草稿不改。批准日期CSV只点击一次，未捕获浏览器download事件，不能宣称文件保存或内容验证通过。实机记录见工作区`docs/harness/puyu-admin-credit-draft-live.acceptance.md`。

后续仅前端补齐CSV反馈：Service沿既有credits/export校验CSV文件名/MIME/Base64及rowCount整数0–10000，页面显示服务返回文件名/实际条数和请求时的账户、类型、上海日期快照，明确下载发起不等于文件落盘。请求期间锁定筛选并防重复；失败保留条件、清除旧成功提示并复用公共错误弹框；条件改变清除过时结果。仅用canManageCredits，无新权限Key或API。

新增15项Service与6项真实SFC隔离测试，全量14文件197项、类型检查、生产构建、19项权限目录与5文件格式检查通过。本轮未再次导出真实数据、未改余额或启动重启服务；未读取私有凭据，因此未重跑依赖私有凭据的精确bundle扫描。唯一页面说明书仍在`projects/puyu-admin/docs/page-specs`；当前批次证据见工作区`docs/harness/puyu-admin-credit-csv-feedback.acceptance.md`。实际CSV落盘/内部内容仍是后续人工或限定实机验收项。

---

<div align="center">
  <a href="https://github.com/anncwb/vue-vben-admin">
    <img alt="VbenAdmin Logo" width="215" src="https://unpkg.com/@vbenjs/static-source@0.1.7/source/logo-v1.webp">
  </a>
  <br>
  <br>

[![license](https://img.shields.io/github/license/anncwb/vue-vben-admin.svg)](LICENSE)

  <h1>Vue Vben Admin</h1>
</div>

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=vbenjs_vue-vben-admin&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=vbenjs_vue-vben-admin) [![codeql](https://github.com/vbenjs/vue-vben-admin/actions/workflows/codeql.yml/badge.svg)](https://github.com/vbenjs/vue-vben-admin/actions/workflows/codeql.yml) [![build](https://github.com/vbenjs/vue-vben-admin/actions/workflows/build.yml/badge.svg)](https://github.com/vbenjs/vue-vben-admin/actions/workflows/build.yml) [![ci](https://github.com/vbenjs/vue-vben-admin/actions/workflows/ci.yml/badge.svg)](https://github.com/vbenjs/vue-vben-admin/actions/workflows/ci.yml) [![deploy](https://github.com/vbenjs/vue-vben-admin/actions/workflows/deploy.yml/badge.svg)](https://github.com/vbenjs/vue-vben-admin/actions/workflows/deploy.yml)

**English** | [中文](./README.zh-CN.md) | [日本語](./README.ja-JP.md)

## Introduction

Vue Vben Admin is a free and open source middle and back-end template. Using the latest `vue3`, `vite`, `TypeScript` and other mainstream technology development, the out-of-the-box middle and back-end front-end solutions can also be used for learning reference.

## Upgrade Notice

This is the latest version, 5.0, and it is not compatible with previous versions. If you are starting a new project, it is recommended to use the latest version. If you wish to view the old version, please use the [v2 branch](https://github.com/vbenjs/vue-vben-admin/tree/v2).

## Features

- **Latest Technology Stack**: Developed with cutting-edge front-end technologies like Vue 3 and Vite
- **TypeScript**: A language for application-scale JavaScript
- **Themes**: Multiple theme colors available with customizable options
- **Internationalization**: Comprehensive built-in internationalization support
- **Permissions**: Built-in solution for dynamic route-based permission generation

## Preview

- [Vben Admin](https://vben.pro/) - Full version Chinese site

Test Account: vben/123456

<div align="center">
  <img alt="VbenAdmin Logo" width="100%" src="https://anncwb.github.io/anncwb/images/preview1.png">
  <img alt="VbenAdmin Logo" width="100%" src="https://anncwb.github.io/anncwb/images/preview2.png">
  <img alt="VbenAdmin Logo" width="100%" src="https://anncwb.github.io/anncwb/images/preview3.png">
</div>

### Use Gitpod

Open the project in Gitpod (free online dev environment for GitHub) and start coding immediately.

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/vbenjs/vue-vben-admin)

## Documentation

[Document](https://doc.vben.pro/)

## Install and Use

1. Get the project code

```bash
git clone https://github.com/vbenjs/vue-vben-admin.git
```

2. Install dependencies

```bash
cd vue-vben-admin
npm i -g corepack
pnpm install
```

3. Run

```bash
pnpm dev
```

4. Build

```bash
pnpm build
```

## Change Log

[CHANGELOG](https://github.com/vbenjs/vue-vben-admin/releases)

## How to Contribute

You are very welcome to join! [Raise an issue](https://github.com/anncwb/vue-vben-admin/issues/new/choose) or submit a Pull Request.

**Pull Request Process:**

1. Fork the code
2. Create your branch: `git checkout -b feat/xxxx`
3. Submit your changes: `git commit -am 'feat(function): add xxxxx'`
4. Push your branch: `git push origin feat/xxxx`
5. Submit `pull request`

## Git Contribution Submission Specification

Reference [vue](https://github.com/vuejs/vue/blob/dev/.github/COMMIT_CONVENTION.md) specification ([Angular](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular))

- `feat` Add new features
- `fix` Fix the problem/BUG
- `style` The code style is related and does not affect the running result
- `perf` Optimization/performance improvement
- `refactor` Refactor
- `revert` Undo edit
- `test` Test related
- `docs` Documentation/notes
- `chore` Dependency update/scaffolding configuration modification etc.
- `ci` Continuous integration
- `types` Type definition file changes

## Browser Support

Tailwind CSS v4.0 is designed for Safari 16.4+, Chrome 111+, and Firefox 128+

Support modern browsers, not IE

| [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/edge/edge_48x48.png" alt="Edge" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)</br>Edge | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_48x48.png" alt="Firefox" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)</br>Firefox | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png" alt="Chrome" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)</br>Chrome | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari/safari_48x48.png" alt="Safari" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)</br>Safari |
| :-: | :-: | :-: | :-: |
| last 2 versions | last 2 versions | last 2 versions | last 2 versions |

## Maintainer

[@Vben](https://github.com/anncwb)

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=vbenjs/vue-vben-admin&type=Date)](https://star-history.dera.page/#vbenjs/vue-vben-admin&Date)

## Donate

If you think this project is helpful to you, you can help the author buy a cup of coffee to show your support!

![donate](https://unpkg.com/@vbenjs/static-source@0.1.7/source/sponsor.png)

<a style="display: block;width: 100px;height: 50px;line-height: 50px; color: #fff;text-align: center; background: #408aee;border-radius: 4px;" href="https://www.paypal.com/paypalme/cvvben">Paypal Me</a>

## Contributors

<a href="https://openomy.app/github/vbenjs/vue-vben-admin" target="_blank" style="display: block; width: 100%;" align="center">
  <img src="https://openomy.app/svg?repo=vbenjs/vue-vben-admin&chart=bubble&latestMonth=3" target="_blank" alt="Contribution Leaderboard" style="display: block; width: 100%;" />
 </a>

<a href="https://github.com/vbenjs/vue-vben-admin/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=vbenjs/vue-vben-admin" />
</a>

## Discord

- [Github Discussions](https://github.com/anncwb/vue-vben-admin/discussions)

## License

[MIT © Vben-2020](./LICENSE)
