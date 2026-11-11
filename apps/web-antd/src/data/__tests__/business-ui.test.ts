import { expect, it } from 'vitest';

import { useBusinessUi } from '#/views/puyu-admin/real/businessUi';

it('keeps the composable error ref as the rejected action message', async () => {
  const { busy, error, run } = useBusinessUi();

  await expect(
    run(async () => {
      throw new Error('受控业务失败');
    }),
  ).resolves.toBe(false);

  expect(error.value).toBe('受控业务失败');
  expect(busy.value).toBe(false);
});
