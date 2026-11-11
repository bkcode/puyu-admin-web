<script setup lang="ts">
import type {
  CatalogBatchCommand,
  CatalogBatchRow,
} from '#/application/catalogBatchService';
import type { CatalogBatchAction } from '#/data/catalogBatchApi';
import type { Kind } from '#/data/realAdminApi';

import { computed, ref, shallowRef, watch } from 'vue';

import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
} from 'ant-design-vue';

import {
  catalogBatchLabels,
  CatalogBatchService as service,
} from '#/application/catalogBatchService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

const props = defineProps<{
  disabled?: boolean;
  kind: Kind;
  platform: boolean;
  rows: CatalogBatchRow[];
}>();
const emit = defineEmits<{
  busy: [boolean];
  clear: [];
  completed: [count: number];
}>();
const open = ref(false);
const single = ref(false);
const busy = ref(false);
const errorMessage = ref('');
const apiError = ref('');
const reason = ref('');
const snapshot = shallowRef<readonly CatalogBatchRow[]>([]);
const action = ref<CatalogBatchAction>('SUBMIT');
const command = shallowRef<CatalogBatchCommand>();
const commandReason = ref('');
const noun = computed(
  () => ({ PRODUCT: '商品', CATEGORY: '分类', BRAND: '品牌' })[props.kind],
);
const canEdit = computed(() => {
  if (props.platform) return false;
  if (props.kind === 'CATEGORY') return permission.canEditCategory() === true;
  if (props.kind === 'BRAND') return permission.canEditBrand() === true;
  return permission.canEditProduct() === true;
});
const canSubmit = computed(
  () => canEdit.value && permission.canSubmitCatalog() === true,
);
const canPublish = computed(
  () =>
    props.platform &&
    (props.kind === 'CATEGORY'
      ? permission.canReviewCategory()
      : permission.canPublishProduct()) === true,
);
const canOffline = computed(
  () =>
    props.platform &&
    (props.kind === 'CATEGORY'
      ? permission.canReviewCategory()
      : permission.canOfflineProduct()) === true,
);
const visible = computed(
  () =>
    canEdit.value || canSubmit.value || canPublish.value || canOffline.value,
);
function permitted(value: CatalogBatchAction) {
  if (value === 'SUBMIT') return canSubmit.value;
  if (value === 'ENABLE' || value === 'DISABLE') return canEdit.value;
  return value === 'OFFLINE' ? canOffline.value : canPublish.value;
}
function reset() {
  open.value = false;
  command.value = undefined;
  errorMessage.value = '';
  reason.value = '';
  snapshot.value = [];
  single.value = false;
}
watch(
  () => [props.kind, props.platform],
  () => {
    if (!busy.value) reset();
  },
);
watch(
  () => props.rows,
  () => {
    if (!busy.value && !single.value) reset();
  },
);
function begin(
  value: CatalogBatchAction,
  targets = props.rows,
  isSingle = false,
) {
  if (props.disabled || busy.value || !permitted(value) || targets.length === 0)
    return;
  const same =
    single.value === isSingle &&
    value === action.value &&
    snapshot.value.length === targets.length &&
    snapshot.value.every(
      (row, index) =>
        row.id === targets[index]?.id &&
        row.version === targets[index]?.version,
    );
  if (!same) {
    reason.value = '';
    errorMessage.value = '';
    command.value = undefined;
  }
  snapshot.value = Object.freeze(
    targets.map((row) => Object.freeze({ ...row })),
  );
  single.value = isSingle;
  action.value = value;
  open.value = true;
}
function openSingle(row: CatalogBatchRow) {
  if (props.platform || !canEdit.value || row.kind !== props.kind) return;
  begin(row.enabled ? 'DISABLE' : 'ENABLE', [row], true);
}
defineExpose({ openSingle });
async function submit() {
  if (busy.value || props.disabled || !permitted(action.value)) return;
  errorMessage.value = '';
  let completed = false;
  let transmitted = false;
  try {
    const text = reason.value.trim();
    service.validate(props.kind, action.value, snapshot.value, text);
    if (!command.value || commandReason.value !== text) {
      command.value = service.create(
        props.kind,
        action.value,
        snapshot.value,
        text,
      );
      commandReason.value = text;
    }
    busy.value = true;
    emit('busy', true);
    transmitted = true;
    await command.value.execute();
    open.value = false;
    command.value = undefined;
    completed = true;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : '批量结果未确认，请使用原批次重试';
    if (transmitted) apiError.value = errorMessage.value;
  } finally {
    busy.value = false;
    emit('busy', false);
  }
  if (completed) emit('completed', snapshot.value.length);
}
const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '编码', dataIndex: 'code' },
  { title: 'ID', dataIndex: 'id' },
  { title: '版本', dataIndex: 'version' },
  { title: '状态', key: 'state' },
];
const labels: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  HIDDEN: '未展示',
  PUBLISHED: '已发布',
  OFFLINE: '已下架',
};
</script>
<template>
  <section v-if="visible" class="my-4" aria-label="目录批量操作">
    <Space wrap>
      <span>本页已选 {{ rows.length }} 条{{ noun }}</span>
      <Button
        v-if="canSubmit"
        :disabled="disabled || busy || !rows.length"
        @click="begin('SUBMIT')"
      >
        批量提交审核
      </Button>
      <Button
        v-if="canEdit"
        :disabled="disabled || busy || !rows.length"
        @click="begin('ENABLE')"
      >
        批量启用
      </Button>
      <Button
        v-if="canEdit"
        danger
        :disabled="disabled || busy || !rows.length"
        @click="begin('DISABLE')"
      >
        批量停用
      </Button>
      <Button
        v-if="canPublish"
        :disabled="disabled || busy || !rows.length"
        @click="begin('PUBLISH')"
      >
        批量通过并发布
      </Button>
      <Button
        v-if="canPublish"
        danger
        :disabled="disabled || busy || !rows.length"
        @click="begin('REJECT')"
      >
        批量驳回
      </Button>
      <Button
        v-if="canOffline"
        danger
        :disabled="disabled || busy || !rows.length"
        @click="begin('OFFLINE')"
      >
        批量下架
      </Button>
      <Button
        :disabled="disabled || busy || !rows.length"
        @click="emit('clear')"
      >
        清空选择
      </Button>
    </Space>
    <p class="mt-2 text-xs text-muted-foreground">
      仅选择当前页，查询、翻页或刷新后清空。每批最多100条；本批任一记录失败，整批回滚，不会自动跳过。
    </p>
    <Modal
      :open="open"
      :title="`确认${single ? '' : '批量'}${catalogBatchLabels[action]}`"
      :footer="null"
      width="min(880px, 95vw)"
      :closable="!busy"
      :keyboard="!busy"
      :mask-closable="false"
      @cancel="open = false"
    >
      <p class="mb-3">
        本次将{{ single ? '' : '批量' }}{{ catalogBatchLabels[action] }}
        {{ snapshot.length }} 条{{ noun }}，请核对下列对象与版本。
      </p>
      <Alert
        class="mb-3"
        type="warning"
        show-icon
        message="确认后将修改真实业务数据"
        description="商户启用不等于平台发布，不能恢复平台下架资料。启停/分类品牌修改可能重置审核并影响关联商品；品牌关联在售商品时可能拒绝停用。服务端逐条校验版本和状态，任一失败整批回滚。"
      />
      <Table
        row-key="id"
        :data-source="[...snapshot]"
        :columns="columns"
        :pagination="false"
        :scroll="{ x: 620, y: 260 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'state'">
            {{ record.enabled ? '启用' : '停用' }} /
            {{ labels[record.reviewStatus] ?? record.reviewStatus }} /
            {{ labels[record.displayStatus] ?? record.displayStatus }}
          </template>
        </template>
      </Table>
      <Form class="mt-4" layout="vertical">
        <Form.Item
          :label="
            action === 'REJECT' || action === 'OFFLINE'
              ? '处理原因（必填）'
              : '处理说明（选填）'
          "
        >
          <Input.TextArea
            v-model:value="reason"
            :aria-label="`${single ? '' : '批量'}处理原因`"
            :maxlength="1000"
            :rows="3"
            :disabled="busy"
          />
        </Form.Item>
      </Form>
      <Alert
        v-if="errorMessage"
        type="error"
        class="mb-3"
        show-icon
        :message="errorMessage"
        description="状态或版本错误请先刷新并重新选择。网络超时结果可能尚未确认；不修改对象/原因时，关闭重开或重试会复用同一操作号，请勿盲目创建新批次。"
      />
      <Space class="mt-3">
        <Button
          type="primary"
          :danger="['REJECT', 'OFFLINE', 'DISABLE'].includes(action)"
          :loading="busy"
          :disabled="disabled || !snapshot.length"
          @click="submit"
        >
          {{
            command
              ? `使用原${single ? '操作' : '批次'}重试`
              : `确认${catalogBatchLabels[action]}`
          }}
</Button><Button :disabled="busy" @click="open = false">取消</Button>
      </Space>
    </Modal>
    <ApiErrorDialog
      :open="!!apiError"
      :message="apiError"
      @close="apiError = ''"
    />
  </section>
</template>
