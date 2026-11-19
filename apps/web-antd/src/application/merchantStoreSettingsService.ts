import type {
  MerchantStoreSettings,
  MerchantStoreSettingsSave,
} from '#/data/merchantStoreSettingsApi';

import { merchantStoreSettingsApi as api } from '#/data/merchantStoreSettingsApi';

function validVersion(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
}
export const merchantStoreSettingsService = {
  async get(): Promise<MerchantStoreSettings> {
    const value = await api.get();
    if (
      typeof value.merchantId !== 'string' ||
      !/^[1-9][0-9]{0,18}$/.test(value.merchantId) ||
      !validVersion(value.version) ||
      typeof value.bannerDisplayEnabled !== 'boolean'
    )
      throw new Error('门店设置返回格式无效，请重新读取');
    return value;
  },
  async save(input: MerchantStoreSettingsSave) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId) ||
      !validVersion(input.version) ||
      input.version === 2_147_483_647 ||
      typeof input.bannerDisplayEnabled !== 'boolean'
    )
      throw new Error('门店设置参数无效，请重新读取');
    const ack = await api.save({
      requestId: input.requestId,
      version: input.version,
      bannerDisplayEnabled: input.bannerDisplayEnabled,
    });
    if (
      ack.requestId !== input.requestId ||
      ack.appliedVersion !== input.version + 1
    )
      throw new Error('门店设置保存回执不一致，请核对原提交');
    return ack;
  },
};
