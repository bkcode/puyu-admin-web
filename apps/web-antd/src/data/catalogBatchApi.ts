import type { Catalog, Kind } from './realAdminApi';

import { adminRequest } from './realAdminApi';

export type CatalogBatchAction =
  | 'DISABLE'
  | 'ENABLE'
  | 'OFFLINE'
  | 'PUBLISH'
  | 'REJECT'
  | 'SUBMIT';
export type CatalogBatchRequest = {
  action: CatalogBatchAction;
  items: { id: string; version: number }[];
  kind: Kind;
  reason: string;
  requestId: string;
};
export const catalogBatchRepository = {
  execute: (request: CatalogBatchRequest) =>
    adminRequest<Catalog[]>('/business/catalog/batch', request),
};
