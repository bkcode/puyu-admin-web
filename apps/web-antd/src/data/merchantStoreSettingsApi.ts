import { adminRequest } from './realAdminApi';

export type MerchantStoreSettings = {
  bannerDisplayEnabled: boolean;
  merchantId: string;
  version: number;
};
export type MerchantStoreSettingsSave = {
  bannerDisplayEnabled: boolean;
  requestId: string;
  version: number;
};
export type StoreSettingsAck = { appliedVersion: number; requestId: string };
const path = '/business/merchant-store-settings';
export const merchantStoreSettingsApi = {
  get: () => adminRequest<MerchantStoreSettings>(path),
  save: (input: MerchantStoreSettingsSave) =>
    adminRequest<StoreSettingsAck>(path, input, 'PUT'),
};
