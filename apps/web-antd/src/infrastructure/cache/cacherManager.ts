export type CacheLevel = 'cookie' | 'instant' | 'local' | 'strong';

export type Cacher<T> = {
  get: () => T | undefined;
  set: (data: T) => void;
};

export type CacheCodec<T> = {
  decode: (raw: string) => T | undefined;
  encode: (data: T) => string;
};

type CacheRegistration = {
  clearInternal: () => void;
  clearOnLogout: boolean;
  getStorage: () => Storage | undefined;
  level: CacheLevel;
  storageKey: string;
};

const registrations = new Set<CacheRegistration>();
const memoryValues = new Map<string, unknown>();

function getCookie(name: string) {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${encodeURIComponent(name)}=`;
  // Cookie Store API is not available in all supported browsers yet.
  // oxlint-disable-next-line unicorn/no-document-cookie
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function setCookie(name: string, value: string) {
  if (typeof document !== 'undefined') {
    // oxlint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  }
}

function removeCookie(name: string) {
  if (typeof document !== 'undefined') {
    // oxlint-disable-next-line unicorn/no-document-cookie
    document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}

export function createCacher<T>(
  name: string,
  options: {
    clearOnLogout?: boolean;
    codec?: CacheCodec<T>;
    level: CacheLevel;
  },
): Cacher<T> {
  const storageKey = `puyu-admin:${name}`;
  const registration: CacheRegistration = {
    level: options.level,
    clearOnLogout: options.clearOnLogout ?? options.level !== 'strong',
    getStorage: () =>
      typeof window === 'undefined' ? undefined : window.localStorage,
    storageKey,
    clearInternal: () => {
      memoryValues.delete(storageKey);
      if (options.level === 'local' || options.level === 'strong') {
        try {
          registration.getStorage()?.removeItem(storageKey);
        } catch {
          /* ignore storage failures */
        }
      }
      if (options.level === 'cookie') removeCookie(storageKey);
    },
  };
  registrations.add(registration);

  return {
    get() {
      if (options.level === 'instant')
        return memoryValues.get(storageKey) as T | undefined;
      const memory = memoryValues.get(storageKey) as T | undefined;
      if (memory !== undefined) return memory;
      try {
        const raw =
          options.level === 'cookie'
            ? getCookie(storageKey)
            : registration.getStorage()?.getItem(storageKey);
        if (!raw) return undefined;
        const value = options.codec
          ? options.codec.decode(raw)
          : (JSON.parse(raw) as T);
        if (value === undefined) return undefined;
        memoryValues.set(storageKey, value);
        return value;
      } catch {
        registration.clearInternal();
        return undefined;
      }
    },
    set(data: T) {
      memoryValues.set(storageKey, data);
      if (options.level === 'instant') return;
      try {
        const raw = options.codec
          ? options.codec.encode(data)
          : JSON.stringify(data);
        if (options.level === 'cookie') setCookie(storageKey, raw);
        else registration.getStorage()?.setItem(storageKey, raw);
      } catch {
        // Persistent storage is best effort; memory value remains available.
      }
    },
  };
}

export const CacherManager = {
  logoutClear() {
    registrations.forEach((registration) => {
      if (registration.clearOnLogout) registration.clearInternal();
    });
  },
  forceClear() {
    registrations.forEach((registration) => registration.clearInternal());
  },
};
