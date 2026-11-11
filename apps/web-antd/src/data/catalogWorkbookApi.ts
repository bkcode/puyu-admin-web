import { adminRequest } from './realAdminApi';

export type WorkbookMode = 'PRODUCT' | 'PRODUCT_PRICE' | 'SKU' | 'SKU_PRICE';
export type WorkbookFilter = { keyword?: string; reviewStatus?: string };
export type WorkbookRequest = {
  mode: WorkbookMode;
  productId: null | string;
  query: WorkbookFilter;
};
export type WorkbookFile = {
  content: string;
  contentType: string;
  name: string;
  rowCount: number;
};
export type WorkbookResult = {
  batchId: string;
  createdIds: string[];
  mode: WorkbookMode;
  updatedIds: string[];
};

export const catalogWorkbookRepository = {
  template: (request: WorkbookRequest) =>
    adminRequest<WorkbookFile>('/business/workbooks/template', request),
  export: (request: WorkbookRequest) =>
    adminRequest<WorkbookFile>('/business/workbooks/export', request),
  import(request: WorkbookRequest, file: File, requestId: string) {
    const body = new FormData();
    body.set('file', file);
    body.set('requestId', requestId);
    body.set('mode', request.mode);
    if (request.productId !== null) body.set('productId', request.productId);
    return adminRequest<WorkbookResult>('/business/workbooks/import', body);
  },
};
