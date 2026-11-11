import type {
  FileDownload,
  OrderAction,
  OrderInput,
  OrderStatus,
  StockAdjustment,
  TicketAction,
  TicketCommand,
  TicketInput,
  TicketStatus,
} from '#/data/operationsApi';

import { operationsRepository as repository } from '#/data/operationsApi';
import { realAdminRepository } from '#/data/realAdminApi';

/** One instance per open form. Keep the key on retry, rotate when the submitted payload changes. */
export function createOperationRequest() {
  let previous = '';
  let requestId = '';
  return <T extends object>(payload: T): T & { requestId: string } => {
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== previous || !requestId) {
      previous = fingerprint;
      requestId = crypto.randomUUID();
    }
    return { ...payload, requestId };
  };
}
export function canTransitionOrder(status: OrderStatus, action: OrderAction) {
  if (action === 'CONFIRM') return status === 'PENDING_CONFIRMATION';
  if (action === 'REDEEM') return status === 'CONFIRMED';
  return ['CONFIRMED', 'PENDING_CONFIRMATION'].includes(status);
}
export function canTransitionTicket(
  platform: boolean,
  status: TicketStatus,
  action: TicketAction,
) {
  if (platform) {
    if (action === 'ACCEPT') return status === 'SUBMITTED';
    if (action === 'DELIVER') return status === 'PROCESSING';
    return (
      ['ASSIGN', 'REJECT', 'SET_PRIORITY'].includes(action) &&
      ['PROCESSING', 'SUBMITTED'].includes(status)
    );
  }
  return action === 'CONFIRM'
    ? status === 'READY_CONFIRM'
    : action === 'CANCEL' && status === 'SUBMITTED';
}
export function validateAdjustment(value: StockAdjustment) {
  if (
    !/^-?\d+(\.\d{1,4})?$/.test(value.delta) ||
    !/^\d+(\.\d{1,4})?$/.test(value.lowThreshold)
  )
    throw new Error('库存数量最多4位小数，阈值必须非负');
  if (!value.reason.trim() || value.reason.length > 1000)
    throw new Error('请填写调整原因，最多1000字');
}
export function validateTicket(value: TicketInput) {
  if (
    !value.description.trim() ||
    value.description.length > 5000 ||
    !value.contact.trim() ||
    value.contact.length > 160 ||
    !/^1[3-9]\d{9}$/.test(value.phone)
  )
    throw new Error('请填写有效需求描述、联系人和11位手机号');
  if (value.type === 'MODEL_CREATION' && !value.productId)
    throw new Error('模型制作工单必须关联商品');
  if (value.skuId && !value.productId) throw new Error('请先选择SKU所属商品');
}
export function validateOrder(value: OrderInput) {
  if (
    !value.contact.trim() ||
    value.contact.length > 160 ||
    !/^1[3-9]\d{9}$/.test(value.phone)
  )
    throw new Error('请填写联系人和有效的11位手机号');
  if (value.remark.length > 500) throw new Error('订单备注最多500字');
  validateOrderItems(value.items);
}
export function validateOrderItems(items: OrderInput['items']) {
  if (
    items.length === 0 ||
    items.length > 100 ||
    new Set(items.map((item) => item.skuId)).size !== items.length
  )
    throw new Error('请选择1至100种不同SKU');
  for (const item of items) {
    if (
      !/^[1-9]\d*$/.test(item.skuId) ||
      !/^\d{1,14}(\.\d{1,4})?$/.test(item.quantity) ||
      !/[1-9]/.test(item.quantity)
    )
      throw new Error('SKU或数量无效；数量必须大于0，最多14位整数和4位小数');
  }
}
export const OperationsService = {
  ...repository,
  async orderProducts(keyword: string, page = 1) {
    const result = await realAdminRepository.catalog(
      'PRODUCT',
      {
        keyword,
        enabled: true,
        reviewStatus: 'APPROVED',
        displayStatus: 'PUBLISHED',
      },
      page,
    );
    return {
      ...result,
      items: result.items.filter(
        (item) =>
          item.enabled &&
          item.reviewStatus === 'APPROVED' &&
          item.displayStatus === 'PUBLISHED',
      ),
    };
  },
  async orderSkus(productId: string) {
    const skus = await realAdminRepository.skus(productId);
    return skus.filter((item) => item.enabled);
  },
  createOrder(body: OrderInput & { requestId: string }) {
    validateOrder(body);
    return repository.createOrder(body);
  },
  adjustStock(body: StockAdjustment & { requestId: string }) {
    validateAdjustment(body);
    return repository.adjustStock(body);
  },
  createTicket(body: TicketInput & { requestId: string }) {
    validateTicket(body);
    return repository.createTicket(body);
  },
  transitionTicket(id: string, body: TicketCommand & { requestId: string }) {
    if (
      ['ASSIGN', 'CANCEL', 'DELIVER', 'REJECT', 'SET_PRIORITY'].includes(
        body.action,
      ) &&
      !body.reason.trim()
    )
      throw new Error('请填写处理原因或交付说明');
    if (body.action === 'ASSIGN' && !body.handlerId)
      throw new Error('请选择处理人');
    if (body.action === 'SET_PRIORITY' && !body.priority)
      throw new Error('请选择优先级');
    return repository.transitionTicket(id, body);
  },
  decodeDownload(result: FileDownload) {
    const binary = atob(result.content);
    return {
      name: Array.from(result.file.name, (character) => {
        const point = character.codePointAt(0);
        if (
          character === '\\' ||
          character === '/' ||
          (point !== undefined && point < 32)
        )
          return '_';
        return character;
      }).join(''),
      bytes: Uint8Array.from(binary, (character) => {
        const point = character.codePointAt(0);
        // atob yields nonempty single-byte characters; NaN preserves charCodeAt's empty-input semantics.
        return point === undefined ? Number.NaN : point;
      }),
      consumedCredits: result.consumedCredits,
    };
  },
};
