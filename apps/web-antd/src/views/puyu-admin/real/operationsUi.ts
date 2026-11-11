import { formatShanghaiTime } from '#/infrastructure/time/shanghaiTime';

export const labels: Record<string, string> = {
  AVAILABLE: '正常',
  LOW: '低库存',
  OUT_OF_STOCK: '缺货',
  PENDING_CONFIRMATION: '待确认',
  CONFIRMED: '已确认',
  REDEEMED: '已核销',
  CANCELLED: '已取消',
  SUBMITTED: '待接单',
  PROCESSING: '处理中',
  READY_CONFIRM: '待商户确认',
  COMPLETED: '已完成',
  REJECTED: '已驳回',
  IMAGE_OPTIMIZATION: '图片优化',
  PRODUCT_ASSISTANCE: '商品上架协助',
  MODEL_CREATION: '模型制作',
  NORMAL: '普通',
  HIGH: '高',
  URGENT: '紧急',
  ACCEPT: '接单',
  ASSIGN: '指派',
  SET_PRIORITY: '调整优先级',
  DELIVER: '交付',
  CONFIRM: '确认完成',
  REJECT: '驳回',
  CANCEL: '取消',
  CREATE: '提交',
  SUBMIT: '提交工单',
  AWAITING_CONFIRMATION: '等待商户确认完成',
  FREE: '本次免费下载',
  CREDITS_REQUIRED: '本次消耗服务额度',
  RULE_UNCONFIGURED: '额度规则未配置',
  INSUFFICIENT_CREDITS: '额度不足',
  ACCOUNT_UNAVAILABLE: '账号不可用',
};
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: labels[value] ?? value }));
export function displayTime(value: null | string | undefined) {
  return formatShanghaiTime(value);
}
export function saveFile(file: {
  bytes: Uint8Array;
  contentType?: string;
  name: string;
}) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(
    new Blob([file.bytes as BlobPart], {
      type: file.contentType ?? 'application/octet-stream',
    }),
  );
  try {
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Print an isolated copy of the visible order, never interpolate server strings into HTML. */
export function printOrderElement(element: HTMLElement) {
  const frame = document.createElement('iframe');
  frame.title = '订单打印';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  const target = frame.contentWindow;
  if (!doc || !target) {
    frame.remove();
    throw new Error('无法打开打印窗口');
  }
  const style = doc.createElement('style');
  style.textContent =
    'body{font:14px sans-serif;color:#111;padding:20px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.no-print{display:none}@page{margin:15mm}';
  doc.head.append(style);
  doc.body.append(element.cloneNode(true));
  target.addEventListener('afterprint', () => frame.remove(), { once: true });
  // Cleanup also when a browser closes print preview without firing afterprint.
  setTimeout(() => frame.remove(), 300_000);
  target.focus();
  target.print();
}
