import type { ExportFile } from '#/data/adminBusinessApi';

import { ref } from 'vue';

import { saveFile } from './operationsUi';

export function useBusinessUi() {
  const errorMessage = ref('');
  const busy = ref(false);
  async function run(action: () => Promise<unknown>) {
    if (busy.value) return false;
    busy.value = true;
    errorMessage.value = '';
    try {
      await action();
      return true;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : '请求失败，请重试';
      return false;
    } finally {
      busy.value = false;
    }
  }
  return { error: errorMessage, busy, run };
}
export function downloadExport(value: ExportFile) {
  const name = Array.from(value.name, (character) => {
    const codePoint = character.codePointAt(0) ?? Number.NaN;
    return character === '/' ||
      character === '\\' ||
      (codePoint >= 0 && codePoint <= 31)
      ? '_'
      : character;
  }).join('');
  saveFile({
    name,
    contentType: value.contentType,
    bytes: Uint8Array.from(
      atob(value.content),
      (character) => character.codePointAt(0) ?? Number.NaN,
    ),
  });
}
export const accountKinds = [
  { value: 'MERCHANT', label: '商户' },
  { value: 'DESIGNER', label: '设计师' },
];
export const creditTypes = [
  { value: 'RECHARGE', label: '商户充值' },
  { value: 'GIFT', label: '赠送额度' },
  { value: 'ADJUSTMENT', label: '人工调整' },
  { value: 'MODEL_DOWNLOAD', label: '模型下载消耗' },
];
export const relationTypes = [
  { value: 'PARTNER', label: '合作商' },
  { value: 'DESIGNER', label: '设计师' },
];
export const draftStatuses = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'SUBMITTED', label: '已入账额度' },
  { value: 'CANCELLED', label: '已取消' },
];
export const billTypes = [
  { value: 'SERVICE', label: '服务期限' },
  { value: 'CREDIT', label: '服务额度' },
  { value: 'OTHER', label: '其他' },
];
export const billStatuses = [
  { value: 'PENDING', label: '待入账' },
  { value: 'CONFIRMED', label: '已入账' },
  { value: 'VOID', label: '已作废' },
];
export const entryMethods = [
  { value: 'BANK_TRANSFER', label: '银行转账记录' },
  { value: 'OFFLINE_OTHER', label: '其他线下记录' },
  { value: 'FREE_ADJUSTMENT', label: '零元调整' },
];
export const labelOf = (
  options: { label: string; value: string }[],
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;
export const businessEvents: Record<string, string> = {
  CREATE: '创建',
  UPDATE: '更新',
  CONFIRM: '确认入账',
  VOID: '作废',
  ENABLE: '启用',
  DISABLE: '停用',
  DOWNLOAD: '预览/下载二维码',
  MERCHANT_VIEW: '查看门店',
  PRODUCT_VIEW: '查看商品',
  ADMIN_ASSISTED: '后台辅助绑定',
  CONSUMER: '前端账号绑定',
  MERCHANT_SERVICE_EXPIRING: '商户服务到期',
  TICKET_PROCESSING: '待处理工单',
  TICKET_CONFIRMATION: '待确认工单',
  ACTIVE: '服务中',
  EXPIRED: '已到期',
};
export const maskPhone = (value: string) =>
  value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
