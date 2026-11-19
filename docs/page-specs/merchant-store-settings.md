# 商户门店设置

## 页面元信息

页面ID：merchant-store-settings；项目puyu-admin-web；PC商家后台；源码候选，尚未迁移或上线。用户2026-11-13明确要求Banner开关按商户独立并放在PC后台。

## 1. 页面目标

商户控制本人门店首页Banner总显示状态，默认开启。关闭只隐藏，不删除条目或更改商品。

## 2. 角色和数据范围

仅已验证的持久MERCHANT及本人有效门店。平台和设计师无入口和管理权限，调用方不能传merchantId选择别店。

## 3. 导航与入口

真实模式：商家后台 -> 门店设置；路径`/admin/merchant/settings/merchant-store-settings`。Mock菜单不注册此候选；原商户首页仍是首入口。页面重入读取权威状态。

## 4. 元素

门店设置卡片、首页Banner说明、显示Switch、保存/重试原保存/核对保存结果按钮、重新读取、读取及保存反馈。不在此维护单条Banner，Mobile现有条目管理继续使用。

## 5. 字段

| 字段 | 类型 | 来源/规则 |
| --- | --- | --- |
| merchantId | 正ID字符串 | 响应只读，不随请求提交 |
| version | 非负整数 | 和原Banner条目共享版本，最大Int |
| bannerDisplayEnabled | boolean | 本店持久总开关，默认true |
| requestId | 1–100字母数字下划线横线 | 保存冻结命令，不作为用户字段 |

## 6. 操作

修改Switch后明确保存；未修改或恢复为当前值时禁用保存，也不发起新保存请求。提交前冻结version/boolean/requestId。结果未知时锁定草稿，只能重试原命令或明确放弃并重读。ACK后GET核对，相同owner/version/boolean才显示已保存。

## 7. 页面跳转

不新增业务跳转；继续使用后台侧栏。重新读取若有草稿或原提交，确认放弃本页状态；已发请求不会因此撤回。

## 8. 状态

读取中、读取失败、已加载、保存中、未知结果、已ACK待核对、版本已更新、保存成功。失败不把默认true当服务器真实状态，读取成功前不展示可保存的Switch。

## 9. 业务规则

每商户独立；默认true，未配置Banner自然空数组。关闭公开及设计师投影items为空，但管理配置/单条enabled保留。Mobile条目编辑不改变总开关。总开关与条目共用CAS防止旧版本覆盖；重新开启后仅显示当前有效且单条enabled=true的项。

## 10. 权限与价格

permission.canManageStoreSettings -> Gateway puyu-admin JWT -> Admin BFF持久MERCHANT -> Core admin_actor/本人profile/有效期 -> 聚合CAS。新固定Key为store:settings:manage。设置不授予合作价、模型或文件权限。

## 11. API

GET/PUT `/admin-api/v1/business/merchant-store-settings`，唯一归属puyu-bff-admin。PUT只含requestId/version/bannerDisplayEnabled；响应稳定requestId/appliedVersion。Core内部由CoreMerchantStoreSettingsFeignClient声明，无前端直连Core。

## 12. 数据与版本

V26向core_merchant_home_banner追加display_enabled默认true。无行读取v0/true，首次显式保存才创建空items行；不seed/回填Banner条目。保存用MERCHANT_BANNER_DISPLAY_SAVE收据，重试原key返回原ACK，不重复更新。

## 13. 验收

两店互不影响；平台/错受众/伪造归属拒绝；关闭保留配置/原Mobile保存不重新启用；冲突/稳定ACK/数据库失败事务回滚；PC未知结果和ACK后重读不重复PUT。当前隔离证据见根同名Harness；真实保存及迁移部署另行批准。

## 14. 相关页面

Mobile商户Banner管理仍负责原0–3条配置，门店首页读取受本店总开关影响。平台系统设置不承担该数据。图片加载问题按用户要求暂缓。
