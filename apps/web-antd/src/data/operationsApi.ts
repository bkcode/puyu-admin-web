import type { PageResult } from './realAdminApi';

import { adminRequest } from './realAdminApi';

export type BusinessQuery = {
  keyword?: string;
  merchantId?: string;
  operatorId?: string;
  priority?: string;
  status?: string;
  type?: string;
};
export type Stock = {
  available: string;
  code: string;
  locked: string;
  lowThreshold: string;
  productId: string;
  productName: string;
  skuId: string;
  spec: string;
  status: string;
  stock: string;
  updatedAt: null | string;
  version: number;
};
export type StockAdjustment = {
  delta: string;
  lowThreshold: string;
  reason: string;
  skuId: string;
  version: number;
};
export type StockHistory = {
  after: string;
  before: string;
  createdAt: string;
  delta: string;
  id: string;
  operatorId: string;
  reason: string;
  skuId: string;
};
export type OrderStatus =
  | 'CANCELLED'
  | 'CONFIRMED'
  | 'PENDING_CONFIRMATION'
  | 'REDEEMED';
export type OrderAction = 'CANCEL' | 'CONFIRM' | 'REDEEM';
export type OrderLine = {
  amount: string;
  productId: string;
  productName: string;
  quantity: string;
  skuCode: string;
  skuId: string;
  spec: string;
  unitPrice: string;
};
export type OrderInput = {
  contact: string;
  items: Array<{ quantity: string; skuId: string }>;
  phone: string;
  remark: string;
};
export type Order = {
  amount: string;
  code: string;
  contact: string;
  createdAt: string;
  id: string;
  items: OrderLine[];
  merchantId: string;
  phone: string;
  remark: string;
  status: OrderStatus;
  updatedAt: string;
  version: number;
};
export type OrderPrint = {
  address: string;
  contactPhone: string;
  merchantName: string;
  order: Order;
  storeName: string;
};
export type TicketType =
  | 'IMAGE_OPTIMIZATION'
  | 'MODEL_CREATION'
  | 'PRODUCT_ASSISTANCE';
export type TicketStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'PROCESSING'
  | 'READY_CONFIRM'
  | 'REJECTED'
  | 'SUBMITTED';
export type TicketPriority = 'HIGH' | 'NORMAL' | 'URGENT';
export type TicketAction =
  | 'ACCEPT'
  | 'ASSIGN'
  | 'CANCEL'
  | 'CONFIRM'
  | 'DELIVER'
  | 'REJECT'
  | 'SET_PRIORITY';
export type TicketInput = {
  attachmentIds: string[];
  contact: string;
  description: string;
  phone: string;
  productId: null | string;
  skuId: null | string;
  type: TicketType;
};
export type Ticket = TicketInput & {
  assignedBy: null | string;
  code: string;
  confirmedAt: null | string;
  createdAt: string;
  deliveryFileIds: string[];
  handlerId: null | string;
  id: string;
  merchantId: string;
  priority: TicketPriority;
  status: TicketStatus;
  submitterId: null | string;
  updatedAt: string;
  version: number;
};
export type TicketCommand = {
  action: TicketAction;
  deliveryFileIds?: string[];
  handlerId?: string;
  priority?: TicketPriority;
  reason: string;
  version: number;
};
export type TicketEvent = {
  action: string;
  createdAt: string;
  id: string;
  operatorId: string;
  reason: string;
};
export type FilePurpose = 'ATTACHMENT' | 'MODEL' | 'VOUCHER';
export type BusinessFile = {
  createdAt: string;
  id: string;
  merchantId: null | string;
  name: string;
  purpose: string;
  size: string;
};
export type FileDownload = {
  consumedCredits: string;
  content: string;
  downloadId: null | string;
  file: BusinessFile;
};
export type ModelQuote = {
  balance: string;
  canDownload: boolean;
  expectedCredits: null | string;
  fileId: string;
  freeRemaining: number;
  freeUntil: null | string;
  merchantId: string;
  platformInspectionFree: boolean;
  ruleSource: string;
  status: string;
};
export type ModelRules = {
  creditsPerDownload: null | string;
  freeDownloads: number;
  freeMonths: number;
  paidDownloadConfigured: boolean;
  source: string;
};
export type ModelDownload = {
  consumedCredits: string;
  createdAt: string;
  fileId: string;
  freeDownload: boolean;
  id: string;
  merchantId: string;
  operatorId: string;
};
const idPath = (id: string) => {
  if (!/^[1-9]\d*$/.test(id)) throw new Error('记录ID无效，请从列表重新进入');
  return encodeURIComponent(id);
};
const page = <T>(
  path: string,
  query: BusinessQuery,
  current: number,
  pageSize = 20,
) =>
  adminRequest<PageResult<T>>(`/business/${path}/page`, {
    page: current,
    pageSize,
    query,
  });

export const operationsRepository = {
  stocks: (query: BusinessQuery, current = 1) =>
    page<Stock>('inventory', query, current),
  adjustStock: (body: StockAdjustment & { requestId: string }) =>
    adminRequest<Stock>('/business/inventory/adjust', body),
  stockHistory: (id: string) =>
    adminRequest<StockHistory[]>(`/business/inventory/${idPath(id)}/history`),
  orders: (query: BusinessQuery, current = 1) =>
    page<Order>('orders', query, current),
  order: (id: string) => adminRequest<Order>(`/business/orders/${idPath(id)}`),
  createOrder: (body: OrderInput & { requestId: string }) =>
    adminRequest<Order>('/business/orders', {
      requestId: body.requestId,
      contact: body.contact,
      phone: body.phone,
      items: body.items.map((item) => ({
        skuId: item.skuId,
        quantity: item.quantity,
      })),
      remark: body.remark,
    }),
  transitionOrder: (
    id: string,
    body: {
      action: OrderAction;
      reason: string;
      requestId: string;
      version: number;
    },
  ) => adminRequest<Order>(`/business/orders/${idPath(id)}/transition`, body),
  printOrder: (id: string) =>
    adminRequest<OrderPrint>(`/business/orders/${idPath(id)}/print`),
  tickets: (query: BusinessQuery, current = 1) =>
    page<Ticket>('tickets', query, current),
  ticket: (id: string) =>
    adminRequest<Ticket>(`/business/tickets/${idPath(id)}`),
  createTicket: (body: TicketInput & { requestId: string }) =>
    adminRequest<Ticket>('/business/tickets', body),
  transitionTicket: (id: string, body: TicketCommand & { requestId: string }) =>
    adminRequest<Ticket>(`/business/tickets/${idPath(id)}/transition`, body),
  ticketHistory: (id: string) =>
    adminRequest<TicketEvent[]>(`/business/tickets/${idPath(id)}/history`),
  handlers: () =>
    adminRequest<{ accountId: string; name: string }[]>(
      '/business/tickets/handlers',
    ),
  modelRules: () => adminRequest<ModelRules>('/business/model-rules'),
  modelQuote: (id: string) =>
    adminRequest<ModelQuote>(`/business/models/${idPath(id)}/download-quote`),
  modelHistory: (id: string) =>
    adminRequest<ModelDownload[]>(`/business/models/${idPath(id)}/history`),
  downloadModel: (id: string, requestId: string) =>
    adminRequest<FileDownload>(`/business/models/${idPath(id)}/download`, {
      requestId,
    }),
  file: (id: string) =>
    adminRequest<BusinessFile>(`/business/files/${idPath(id)}`),
  downloadFile: (id: string) =>
    adminRequest<FileDownload>(`/business/files/${idPath(id)}/content`),
  upload: (file: File, purpose: FilePurpose, merchantId?: string) => {
    const body = new FormData();
    body.set('file', file);
    body.set('purpose', purpose);
    if (merchantId) body.set('merchantId', idPath(merchantId));
    return adminRequest<BusinessFile>('/business/files', body);
  },
};
