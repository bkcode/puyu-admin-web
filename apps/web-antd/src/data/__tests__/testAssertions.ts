export function requireValue<T>(
  value: null | T | undefined,
  message = 'Expected test value',
): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
