# AGENTS.md - puyu-admin-web

这是 `puyu-admin` 的 PC Web - A UI 平台实现，基于 Vben Admin 5.x、Vue 3、Vite、TypeScript 和 Ant Design Vue。

## 分层边界

- `apps/web-antd/src/views/`、`layouts/`、`router/`：UI 页面、布局和 PC Web - A 路由。
- `apps/web-antd/src/application/`：共享业务 Service 和业务用例。
- `apps/web-antd/src/data/`：Repository、Admin API adapter、PermissionDataService 和 local mock。
- `apps/web-antd/src/infrastructure/`：permission middleware、CacherManager、Codec、运行时平台信息。
- `apps/web-antd/src/ui/pc-web-a/`：PC Web - A 的 UI 组件、公共 UI 协议实现和页面策略。

业务 Service 不调用 Vue/Vben/Ant Design 或路由；数据层不直连 Core 或数据库。真实请求只能通过 Gateway/Admin BFF 的 `/admin-api/**`。默认保留local mock；显式`VITE_PUYU_DATA_MODE=real`用于用户已批准的本地商户/目录业务链，入口见README。

## 权限

UI 页面、菜单、路由和按钮只使用 `permission.canXxx()`；不直接读取menuKey/API权限数组。Mock权限不代表后端授权；真实模式由数据层依据已验证actor固定角色映射，未知身份拒绝，不使用通配Mock权限。

OAuth客户端密钥仅进入本地Vite开发服务器环境，不进入VITE变量、浏览器bundle或Git。真实模式不能通过UI角色切换伪造身份；新身份必须真实登录。

## 当前范围

- 只实现 `pc_web_a`。
- `pc_web_b`、移动 APP、PC EXE 和小程序不在本项目实现。
- SKU 只能在商品详情内维护，不创建独立 SKU 路由。
- 平台商品、分类、品牌只处理商家提交数据；驳回/下架原因在商户页面回显。

## 验证

```sh
pnpm -F @vben/web-antd typecheck
pnpm -F @vben/web-antd build
```
