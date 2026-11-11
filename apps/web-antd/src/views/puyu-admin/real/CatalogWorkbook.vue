<script setup lang="ts">
import type { UploadProps } from 'ant-design-vue';

import type {
  WorkbookContext,
  WorkbookImportCommand,
} from '#/application/catalogWorkbookService';
import type {
  WorkbookFile,
  WorkbookMode,
  WorkbookResult,
} from '#/data/catalogWorkbookApi';

import { computed, ref, shallowRef, watch } from 'vue';

import {
  Alert,
  Button,
  Form,
  Modal,
  Select,
  Space,
  Upload,
} from 'ant-design-vue';

import {
  CatalogWorkbookService as service,
  workbookModes,
} from '#/application/catalogWorkbookService';
import { permission } from '#/infrastructure/permission/permission';
import ApiErrorDialog from '#/ui/pc-web-a/publicUi/api-error-dialog.vue';

import { downloadExport } from './businessUi';

const props = defineProps<{ context: WorkbookContext; disabled?: boolean }>();
const emit = defineEmits<{ imported: [WorkbookResult, null | string] }>();
const allowed = computed(() => permission.canEditProduct() === true);
const modes = computed(() =>
  workbookModes.filter((option) =>
    option.value.startsWith(props.context.kind === 'sku' ? 'SKU' : 'PRODUCT'),
  ),
);
const mode = ref<WorkbookMode>('PRODUCT');
const open = ref(false);
const busy = ref(false);
const errorMessage = ref('');
const inlineError = ref('');
const command = shallowRef<WorkbookImportCommand>();
const outcome = ref<WorkbookResult>();
const downloaded = ref<Pick<WorkbookFile, 'name' | 'rowCount'>>();
const attempted = ref(false);
const modeLabel = computed(
  () => workbookModes.find((option) => option.value === mode.value)?.label,
);
watch(
  [
    () => props.context.kind,
    () => (props.context.kind === 'sku' ? props.context.productId : null),
  ],
  () => {
    mode.value = props.context.kind === 'sku' ? 'SKU' : 'PRODUCT';
    command.value = undefined;
    outcome.value = undefined;
    inlineError.value = '';
    attempted.value = false;
    open.value = false;
  },
  { immediate: true },
);
function resetSelection() {
  command.value = undefined;
  inlineError.value = '';
  attempted.value = false;
  downloaded.value = undefined;
}
function showImport() {
  if (outcome.value) {
    resetSelection();
    outcome.value = undefined;
  }
  open.value = true;
}
const selectFile: UploadProps['beforeUpload'] = (file) => {
  if (busy.value || !allowed.value || props.disabled) return false;
  resetSelection();
  try {
    command.value = service.createImport(
      mode.value,
      props.context,
      file as File,
    );
  } catch (error) {
    inlineError.value = error instanceof Error ? error.message : '文件选择失败';
  }
  return false;
};
async function download(template: boolean) {
  if (busy.value || !allowed.value || props.disabled) return;
  busy.value = true;
  errorMessage.value = '';
  downloaded.value = undefined;
  try {
    const value = await (template ? service.template : service.export)(
      mode.value,
      props.context,
    );
    downloadExport(value);
    downloaded.value = { name: value.name, rowCount: value.rowCount };
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '下载失败，请重试';
  } finally {
    busy.value = false;
  }
}
async function importFile() {
  if (busy.value || !allowed.value || props.disabled || !command.value) return;
  const selected = command.value;
  busy.value = true;
  inlineError.value = '';
  attempted.value = true;
  try {
    const value = await selected.execute();
    outcome.value = value;
    open.value = false;
    emit('imported', value, selected.productId);
  } catch (error) {
    inlineError.value =
      error instanceof Error
        ? error.message
        : '导入结果未确认，请使用原文件重试';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="allowed" class="my-4" aria-label="商品Excel工具">
    <Space wrap>
      <Select
        v-model:value="mode"
        aria-label="Excel类型"
        :options="modes"
        :disabled="busy || disabled || open"
        style="width: 150px"
        @change="resetSelection"
      />
      <Button :disabled="busy || disabled" @click="download(true)">
        下载模板
      </Button>
      <Button
        :disabled="busy || disabled"
        :loading="busy && !open"
        @click="download(false)"
      >
        导出{{ modeLabel }}
      </Button>
      <Button :disabled="busy || disabled" @click="showImport">
        导入{{ modeLabel }}
      </Button>
    </Space>
    <p class="mt-2 text-xs text-muted-foreground">
      <template v-if="context.kind === 'sku'">
        当前商品：{{ context.productName }}（ID
        {{ context.productId }}）。仅导出此商品的全部 SKU。
      </template>
      <template v-else>
        商品导出沿当前关键词和审核状态筛选，不仅限本页。
      </template>
      仅 .xlsx；导入最多 200 行 / 5MiB，导出最多 5000 行。ID
      与金额请保持文本格式。
    </p>
    <Alert
      v-if="downloaded"
      class="mt-3"
      type="success"
      show-icon
      :message="`已生成 ${downloaded.name}（${downloaded.rowCount} 条数据）`"
      description="已发起浏览器下载，请在浏览器中确认保存结果。模板仅含表头，数据条数为0。"
    />
    <Alert
      v-if="outcome"
      class="mt-3"
      type="success"
      show-icon
      :message="`导入完成：批次 ${outcome.batchId}，新增 ${outcome.createdIds.length} 条，更新 ${outcome.updatedIds.length} 条`"
      description="页面正在重新读取商品数据。导入不会自动发布商品，修改后可能需要重新提交平台审核。"
    />
    <Modal
      :open="open"
      title="确认Excel导入"
      :footer="null"
      :closable="!busy"
      :mask-closable="false"
      :keyboard="!busy"
      @cancel="open = false"
    >
      <p class="mb-3">导入类型：{{ modeLabel }}</p>
      <p v-if="context.kind === 'sku'" class="mb-3">
        当前商品：{{ context.productName }}（ID {{ context.productId }}）
      </p>
      <Alert
        type="warning"
        show-icon
        message="确认后将写入真实业务数据"
        description="请使用对应模板，不修改表头、工作表名或已有记录的ID/version。整批校验失败不部分导入；更新可能撤下商品展示并要求重审。已有SKU库存只能通过库存调整修改。"
      />
      <Form layout="vertical" class="mt-4">
        <Form.Item label="Excel文件（仅选择，不会自动上传）">
          <Upload
            accept=".xlsx"
            :multiple="false"
            :show-upload-list="false"
            :before-upload="selectFile"
            :disabled="busy"
          >
            <Button :disabled="busy">选择Excel文件</Button>
          </Upload>
          <p v-if="command" class="mt-2">
            已选择：{{ command.fileName }}（{{
              (command.size / 1024).toFixed(1)
            }}
            KiB）
          </p>
          <p v-else class="mt-2">尚未选择有效文件</p>
        </Form.Item>
      </Form>
      <Alert
        v-if="inlineError"
        class="mb-3"
        type="error"
        show-icon
        :message="inlineError"
        description="请求失败或超时后结果可能尚未确认。同文件重试会复用原操作号；版本冲突请先核对记录、重新导出后再选择新文件，不要盲目重复导入。"
      />
      <Space class="mt-4">
        <Button
          type="primary"
          :disabled="!command || disabled"
          :loading="busy"
          @click="importFile"
        >
          {{ attempted ? '使用原文件重试' : '确认导入' }}
        </Button>
        <Button :disabled="busy" @click="open = false">取消</Button>
      </Space>
    </Modal>
    <ApiErrorDialog
      :open="!!errorMessage"
      :message="errorMessage"
      @close="errorMessage = ''"
    />
  </section>
</template>
