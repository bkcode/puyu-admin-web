import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { SliderCaptcha } from '@vben/common-ui';

import { afterEach, describe, expect, it } from 'vitest';

const mounted: Array<ReturnType<typeof createApp>> = [];

function mountCaptcha() {
  const value = ref(false);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(
    defineComponent({
      setup() {
        return () =>
          h(SliderCaptcha, {
            modelValue: value.value,
            'onUpdate:modelValue': (next: boolean) => {
              value.value = next;
            },
          });
      },
    }),
  );
  app.mount(host);
  mounted.push(app);

  const action = host.querySelector<HTMLElement>('[name="captcha-action"]');
  const wrapper = action?.parentElement;
  if (!action || !wrapper) throw new Error('captcha DOM missing');
  Object.defineProperty(wrapper, 'offsetWidth', {
    configurable: true,
    value: 446,
  });
  Object.defineProperty(action, 'offsetWidth', {
    configurable: true,
    value: 44,
  });
  return { action, value, wrapper };
}

function mouse(target: Element, type: string, pageX: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: pageX,
    screenX: pageX,
  });
  // happy-dom does not derive pageX from clientX like a real browser.
  Object.defineProperty(event, 'pageX', { value: pageX });
  target.dispatchEvent(event);
}

function touch(
  target: Element,
  type: string,
  touches: number[],
  changedTouches: number[] = [],
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'touches', {
    value: touches.map((pageX) => ({ pageX })),
  });
  Object.defineProperty(event, 'changedTouches', {
    value: changedTouches.map((pageX) => ({ pageX })),
  });
  target.dispatchEvent(event);
}

afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
  document.body.replaceChildren();
});

describe('sliderCaptcha', () => {
  it('keeps the existing mouse threshold behavior', async () => {
    const { action, value, wrapper } = mountCaptcha();
    mouse(action, 'mousedown', 824);
    mouse(wrapper, 'mousemove', 1220);
    mouse(wrapper, 'mouseup', 1220);
    await nextTick();
    expect(value.value).toBe(true);
  });

  it('uses changedTouches when release occurs exactly at the threshold', async () => {
    const { action, value, wrapper } = mountCaptcha();
    touch(action, 'touchstart', [824]);
    touch(wrapper, 'touchmove', [1220]);
    touch(wrapper, 'touchend', [], [1220]);
    await nextTick();
    expect(value.value).toBe(true);
  });

  it('keeps an under-threshold touch release unverified', async () => {
    const { action, value, wrapper } = mountCaptcha();
    touch(action, 'touchstart', [824]);
    touch(wrapper, 'touchmove', [1219]);
    touch(wrapper, 'touchend', [], [1219]);
    await nextTick();
    expect(value.value).toBe(false);
  });
});
