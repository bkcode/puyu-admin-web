<script setup lang="ts">
import { ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { AdminBusinessService } from '#/application/adminBusinessService';
import { RealAdminService } from '#/application/realAdminService';
const props = defineProps<{
  disabled?: boolean;
  kind: 'account' | 'merchant';
  modelValue: null | string | undefined;
}>();
const emit = defineEmits<{
  error: [string];
  'update:modelValue': [null | string];
}>();
const options = ref<{ label: string; value: string }[]>([]);
const loading = ref(false);
let revision = 0;
async function search(keyword = '') {
  const token = ++revision;
  loading.value = true;
  try {
    let choices: { label: string; value: string }[];
    if (props.kind === 'merchant') {
      const merchants = await RealAdminService.merchants(keyword, 1, 200);
      choices = merchants.items.map((merchant) => ({
        value: merchant.id,
        label: `${merchant.content.name}（${merchant.code}）`,
      }));
    } else {
      const accounts = await AdminBusinessService.creditAccounts(
        { keyword },
        1,
      );
      choices = accounts.items.map((account) => ({
        value: account.accountId,
        label: `${account.name}（${account.kind === 'MERCHANT' ? '商户' : '设计师'} · ID ${account.accountId}）`,
      }));
    }
    if (token === revision) options.value = choices;
  } catch (error) {
    if (token === revision) {
      options.value = [];
      emit('error', error instanceof Error ? error.message : '候选读取失败');
    }
  } finally {
    if (token === revision) loading.value = false;
  }
}
watch(
  () => props.kind,
  () => search(),
  { immediate: true },
);
</script>
<template>
  <Select
    :value="modelValue ?? undefined"
    :disabled="disabled"
    :loading="loading"
    show-search
    :filter-option="false"
    allow-clear
    :options="
      modelValue && !options.some((o) => o.value === modelValue)
        ? [{ value: modelValue, label: `当前记录 ${modelValue}` }, ...options]
        : options
    "
    :placeholder="
      kind === 'merchant'
        ? '搜索商户名称（最多200条）'
        : '搜索账户名称（最多20条）'
    "
    @search="search"
    @change="(v) => emit('update:modelValue', typeof v === 'string' ? v : null)"
  />
</template>
