<script setup lang="ts">
import { Button, Modal } from 'ant-design-vue';

const props = defineProps<{ code?: string; message: string; open: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Modal
    :open="props.open"
    title="请求失败"
    :footer="null"
    @cancel="emit('close')"
  >
    <p>{{ props.message }}</p>
    <p v-if="props.code" class="error-code">错误编号：{{ props.code }}</p>
    <div class="dialog-footer">
      <Button type="primary" @click="emit('close')">关闭</Button>
    </div>
  </Modal>
</template>

<style scoped>
.error-code {
  font-size: 12px;
  color: #64748b;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
