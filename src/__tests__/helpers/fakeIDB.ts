/**
 * Minimal in-memory IndexedDB fake for unit tests (jsdom has none).
 * Supports exactly the surface MQ's IDB modules use:
 * open/onupgradeneeded, transaction(store, mode).objectStore →
 * get / put / getAll / getAllKeys / delete / clear, IDBRequest events.
 */

export interface FakeDBOptions {
  /** Stores that should exist after open (created via onupgradeneeded). */
  stores: string[];
}

interface FakeRequest<T = unknown> {
  result: T;
  error: unknown | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  readyState: "pending" | "done";
}

function makeRequest<T>(result: T): FakeRequest<T> {
  const req: FakeRequest<T> = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
    readyState: "pending",
  };
  // Fire asynchronously-ish (microtask) — matches IDB event semantics closely
  // enough for promise-based consumers.
  queueMicrotask(() => {
    req.readyState = "done";
    req.onsuccess?.();
  });
  return req as unknown as FakeRequest<T>;
}

class FakeObjectStore {
  constructor(
    private stores: Map<string, Map<string, Record<string, unknown>>>,
    public name: string,
  ) {}
  private store() {
    if (!this.stores.has(this.name)) this.stores.set(this.name, new Map());
    return this.stores.get(this.name)!;
  }
  get(key: unknown) {
    return makeRequest(this.store().get(String(key)) ?? undefined);
  }
  put(value: Record<string, unknown>) {
    const key = String(
      (value as { key?: unknown; id?: unknown }).key ?? (value as { id?: unknown }).id,
    );
    this.store().set(key, value);
    return makeRequest(value);
  }
  getAll() {
    return makeRequest([...this.store().values()]);
  }
  getAllKeys() {
    return makeRequest([...this.store().keys()]);
  }
  delete(key: unknown) {
    this.store().delete(String(key));
    return makeRequest(undefined);
  }
  clear() {
    this.store().clear();
    return makeRequest(undefined);
  }
}

class FakeTransaction {
  constructor(
    private stores: Map<string, Map<string, Record<string, unknown>>>,
    private storeNames: string[],
  ) {}
  objectStore(name: string) {
    return new FakeObjectStore(this.stores, name);
  }
}

class FakeDB {
  objectStoreNames = {
    contains: (n: string) => this.stores.has(n) || this.initialStores.includes(n),
  };
  constructor(
    private stores: Map<string, Map<string, Record<string, unknown>>>,
    private initialStores: string[],
  ) {}
  createObjectStore(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return { name };
  }
  transaction(name: string) {
    return new FakeTransaction(this.stores, [name]);
  }
  close() {}
}

export function installFakeIndexedDB(options: FakeDBOptions) {
  const databases = new Map<string, FakeDB>();
  const storeData = new Map<string, Map<string, Record<string, unknown>>>();
  const created = new Set<string>();

  const idb = {
    open(name: string, _version?: number) {
      const db = new FakeDB(storeData, options.stores);
      const req = {
        result: null as unknown,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
      };
      queueMicrotask(() => {
        (req as { result: unknown }).result = db;
        if (!created.has(name)) {
          created.add(name);
          req.onupgradeneeded?.();
        }
        databases.set(name, db);
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name: string) {
      databases.delete(name);
      // Real IDB semantics: a deleted database that is opened again is NEW —
      // version upgrades (onupgradeneeded) must run again, and all data is
      // gone. Without the `created` reset, a re-created DB would never run
      // its store-creation upgrade (breaks self-heal recovery paths).
      created.delete(name);
      storeData.clear();
      return makeRequest(undefined);
    },
    _storeData: storeData,
  };

  const prev = (globalThis as { indexedDB?: unknown }).indexedDB;
  (globalThis as { indexedDB?: unknown }).indexedDB = idb;
  return {
    uninstall: () => {
      (globalThis as { indexedDB?: unknown }).indexedDB = prev;
    },
    stores: storeData,
  };
}
