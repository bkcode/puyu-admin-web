<script setup lang="ts">
import type { Settings } from '#/data/adminBusinessApi';

import { onMounted, ref } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Switch,
} from 'ant-design-vue';

import { AdminBusinessService as service } from '#/application/adminBusinessService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import { useBusinessUi } from './businessUi';
const { error, busy, run } = useBusinessUi();
const current = ref<Settings>();
const form = ref<Settings>();
const confirm = ref(false);
async function load() {
  current.value = await service.settings();
  form.value = { ...current.value };
}
async function save() {
  if (!form.value) return;
  await run(async () => {
    const value = form.value;
    if (!value) throw new Error('基础设置未加载');
    current.value = await service.saveSettings(value);
    form.value = { ...current.value };
    confirm.value = false;
    message.success('基础设置已保存');
  });
}
onMounted(() => run(load));
</script>
<template>
  <Alert
    class="mb-4"
    type="info"
    message="仅维护基础业务设置；固定菜单不在本页配置，不提供员工或复杂角色权限系统。额度消耗规则由Nacos管理，页面只读。"
  /><Card title="基础设置" :loading="busy">
    <Form v-if="form" layout="vertical">
      <Form.Item label="商户到期提醒天数（0–3650）">
        <InputNumber
          v-model:value="form.expiryReminderDays"
          :min="0"
          :max="3650"
          :precision="0"
        />
</Form.Item><Form.Item label="商品发布需要平台审核">
        <Switch v-model:checked="form.productReviewRequired" />
</Form.Item><Form.Item label="模型文件命名说明">
        <Input.TextArea
          v-model:value="form.modelNamingInstructions"
          :maxlength="1000"
          :rows="4"
        />
      </Form.Item>
</Form><Descriptions v-if="current" bordered :column="1">
      <Descriptions.Item label="额度规则来源">
        {{ current.creditRulesSource }}
</Descriptions.Item><Descriptions.Item label="菜单模式">
        {{ current.menuMode }}
</Descriptions.Item><Descriptions.Item label="当前版本">
        {{ current.version }}
      </Descriptions.Item>
    </Descriptions>
</Card><Space class="mt-5">
    <Button
      v-if="permission.canManageSettings()"
      type="primary"
      :disabled="busy || !form"
      @click="confirm = true"
    >
      保存基础设置
</Button><Button :loading="busy" @click="run(load)">重新读取</Button><Button
      :disabled="busy || !current"
      @click="form = current ? { ...current } : undefined"
    >
      取消修改
    </Button>
</Space><Modal
    :open="confirm"
    title="确认修改基础设置"
    :confirm-loading="busy"
    @ok="save"
    @cancel="confirm = false"
  >
    <p>
      将更新真实业务设置。审核开关会影响后续商品发布；已治理下架记录不会因此自动恢复。是否继续？
    </p>
</Modal><ApiErrorDialog :open="!!error" :message="error" @close="error = ''" />
</template>
