# PC公开图片业务接入（本地候选）

商品/分类/品牌公开图片通过Admin新multipart接口上传到URL，保留旧ID和外链、原顺序与重复项，按合计20限制。新图先加入草稿，上传成功不等于业务已保存；上传期间禁止保存，旧scope/session或卸载回调丢弃。平台商户Logo使用独立logoUrl，URL优先、旧ID回退；空串显式清URL，不自动清ID。其它私有资料保留旧上传协议，GIF按原后端限制早拒。

计划、任务清单、16项标准与当前测试证据唯一入口为根`docs/harness/puyu-public-image-integration-20261113.*`。本地PC313项/type/real build通过，候选后端已完成Core/API/双BFF重建部署，PC商品44真实保存/GET/刷新与Logo替换恢复已验证；前端仍仅本地未提交。旧JSON图片代理问题没有在此任务修复。
