<script setup lang="ts">
import type {
  MerchantStoreSettings,
  MerchantStoreSettingsSave,
  StoreSettingsAck,
} from '#/data/merchantStoreSettingsApi';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { Alert, Button, Card, Modal, Space, Switch } from 'ant-design-vue';

import { merchantStoreSettingsService as service } from '#/application/merchantStoreSettingsService';
import { permission } from '#/infrastructure/permission/permission';

const current = ref<MerchantStoreSettings>();
const enabled = ref(true);
const busy = ref(false);
const errorMessage = ref('');
const notice = ref('');
const original = ref<Readonly<MerchantStoreSettingsSave>>();
const ack = ref<StoreSettingsAck>();
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});
async function load() {
  if (busy.value || original.value) return;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  try {
    const value = await service.get();
    if (!alive) return;
    current.value = value;
    enabled.value = value.bannerDisplayEnabled;
  } catch (error) {
    if (alive)
      errorMessage.value =
        error instanceof Error ? error.message : '门店设置读取失败';
  } finally {
    if (alive) busy.value = false;
  }
}
async function save() {
  if (
    busy.value ||
    !current.value ||
    !permission.canManageStoreSettings() ||
    (!original.value && enabled.value === current.value.bannerDisplayEnabled)
  )
    return;
  busy.value = true;
  errorMessage.value = '';
  notice.value = '';
  if (!original.value)
    original.value = Object.freeze({
      requestId: crypto.randomUUID(),
      version: current.value.version,
      bannerDisplayEnabled: enabled.value,
    });
  const body = original.value;
  try {
    const result = ack.value ?? (await service.save(body));
    if (!alive) return;
    ack.value = result;
    const latest = await service.get();
    if (!alive) return;
    if (latest.merchantId !== current.value.merchantId)
      throw new Error('当前配置与本人门店不一致');
    if (
      latest.version === result.appliedVersion &&
      latest.bannerDisplayEnabled === body.bannerDisplayEnabled
    ) {
      current.value = latest;
      enabled.value = latest.bannerDisplayEnabled;
      original.value = undefined;
      ack.value = undefined;
      notice.value = '门店设置已保存';
    } else
      notice.value = '原保存已完成，但当前版本已更新。请明确重新读取核对。';
  } catch (error) {
    if (alive)
      errorMessage.value =
        error instanceof Error ? error.message : '保存结果未确认，请核对原提交';
  } finally {
    if (alive) busy.value = false;
  }
}
function reload() {
  if (busy.value) return;
  if (
    original.value ||
    (current.value && enabled.value !== current.value.bannerDisplayEnabled)
  ) {
    Modal.confirm({
      title: '放弃当前修改并重新读取？',
      content: '已发送的保存不会撤回。重新读取将放弃本页草稿和原提交核对状态。',
      onOk: async () => {
        original.value = undefined;
        ack.value = undefined;
        await load();
      },
    });
  } else void load();
}
onMounted(load);
</script>
<template>
  <Card title="门店设置" :loading="busy && !current">
    <Alert
      v-if="errorMessage"
      class="mb-4"
      type="error"
      :message="errorMessage"
      show-icon
    />
    <Alert
      v-if="notice"
      class="mb-4"
      type="success"
      :message="notice"
      show-icon
    />
    <template v-if="current">
      <div class="banner-setting">
        <div>
          <h2>首页 Banner</h2>
          <p>
            开启后展示本店已启用且有效的
            Banner。关闭只隐藏展示，已配置内容会保留。
          </p>
        </div>
        <Switch
          v-model:checked="enabled"
          aria-label="首页Banner显示"
          :disabled="busy || !!original || !permission.canManageStoreSettings()"
        />
      </div>
      <p v-if="original" role="status">
        {{
          ack
            ? '原保存已完成，正在核对当前配置；不会重复保存。'
            : '保存结果未确认。重试将使用原内容和版本，不会覆盖其他商户的设置。'
        }}
      </p>
      <Space class="mt-4">
        <Button
          v-if="permission.canManageStoreSettings()"
          type="primary"
          :loading="busy"
          :disabled="
            busy || (!original && enabled === current.bannerDisplayEnabled)
          "
          @click="save"
        >
          {{
            original ? (ack ? '核对保存结果' : '重试原保存') : '保存门店设置'
          }}
        </Button>
        <Button :disabled="busy" @click="reload">重新读取</Button>
      </Space>
    </template>
    <Button v-else-if="!busy" @click="load">重新读取</Button>
  </Card>
</template>
<style scoped>
.banner-setting {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
}

.banner-setting h2 {
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
}

.banner-setting p {
  margin: 0;
  color: #64748b;
}
</style>
