/** Puyu business calendar zone; never infer it from the operator's PC. */
export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

function parseTime(value: string): Date {
  const text = value.trim();
  if (/^-?\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^-?\d{13}$/.test(text)) return new Date(Number(text));
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return new Date(`${text}T00:00:00+08:00`);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text))
    return new Date(`${text.replace(' ', 'T')}+08:00`);
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(text))
    return new Date(text);
  return new Date(Number.NaN);
}

export function formatShanghaiTime(value: null | string | undefined): string {
  if (!value) return '—';
  const date = parseTime(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** Stable YYYY-MM-DD for native date inputs, independent of locale ordering. */
export function shanghaiDate(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : parseTime(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
