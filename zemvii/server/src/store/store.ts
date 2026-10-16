// The storage interface used by every service. It is deliberately small:
// CRUD plus a tiny query language (equality, comparisons, IN, substring,
// $or). Two adapters implement it today (SQLite and in-memory); because it is
// async, a Postgres adapter can be added without touching the services.

import type { TableName, Tables } from './types.ts';

export type Primitive = string | number | boolean | null;

export interface Ops<V> {
  eq?: V;
  ne?: V;
  in?: V[];
  nin?: V[];
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  /** Case-insensitive substring match on a text column. */
  contains?: string;
}

export type Cond<V> = V | Ops<V>;

export type Where<Row> = { [K in keyof Row]?: Cond<Row[K]> } & { $or?: Where<Row>[] };

export type OrderBy<Row> = Array<[keyof Row & string, 'asc' | 'desc']>;

export interface Query<Row> {
  where?: Where<Row>;
  orderBy?: OrderBy<Row>;
  limit?: number;
  offset?: number;
}

type NumericKeys<Row> = { [K in keyof Row]: Row[K] extends number ? K : never }[keyof Row] & string;

export interface StoreOps {
  insert<T extends TableName>(table: T, row: Tables[T]): Promise<Tables[T]>;
  /** Insert, or replace the row with the same id. */
  upsert<T extends TableName>(table: T, row: Tables[T]): Promise<Tables[T]>;
  update<T extends TableName>(table: T, where: Where<Tables[T]>, patch: Partial<Tables[T]>): Promise<number>;
  /** Atomically add `by` to a numeric column of the row with this id. */
  increment<T extends TableName>(table: T, id: string, column: NumericKeys<Tables[T]>, by: number): Promise<void>;
  delete<T extends TableName>(table: T, where: Where<Tables[T]>): Promise<number>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | undefined>;
  find<T extends TableName>(table: T, query?: Query<Tables[T]>): Promise<Tables[T][]>;
  findOne<T extends TableName>(table: T, where: Where<Tables[T]>): Promise<Tables[T] | undefined>;
  count<T extends TableName>(table: T, where?: Where<Tables[T]>): Promise<number>;
}

export interface Store extends StoreOps {
  /**
   * Run `fn` atomically. Operations must go through the `tx` argument; calls
   * on the outer store wait until the transaction has finished.
   */
  transaction<R>(fn: (tx: StoreOps) => Promise<R>): Promise<R>;
  close(): void;
}

/** Synchronous primitives an adapter provides; `LockingStore` turns them into a `Store`. */
export interface SyncBackend {
  insert(table: TableName, row: Record<string, unknown>, replace: boolean): void;
  update(table: TableName, where: Where<any>, patch: Record<string, unknown>): number;
  increment(table: TableName, id: string, column: string, by: number): void;
  delete(table: TableName, where: Where<any>): number;
  find(table: TableName, query: Query<any>): Record<string, unknown>[];
  count(table: TableName, where: Where<any>): number;
  begin(): void;
  commit(): void;
  rollback(): void;
  close(): void;
}

export class LockingStore implements Store {
  #backend: SyncBackend;
  #lock: Promise<void> | null = null;
  #ops: StoreOps;

  constructor(backend: SyncBackend) {
    this.#backend = backend;
    this.#ops = makeOps(backend);
  }

  /**
   * Run an operation once no transaction holds the lock. The lock check and
   * the (synchronous) backend call happen in the same microtask, so nothing
   * can slip in between them.
   */
  async #run<R>(op: () => Promise<R>): Promise<R> {
    while (this.#lock) await this.#lock;
    return op();
  }

  insert<T extends TableName>(table: T, row: Tables[T]) {
    return this.#run(() => this.#ops.insert(table, row));
  }
  upsert<T extends TableName>(table: T, row: Tables[T]) {
    return this.#run(() => this.#ops.upsert(table, row));
  }
  update<T extends TableName>(table: T, where: Where<Tables[T]>, patch: Partial<Tables[T]>) {
    return this.#run(() => this.#ops.update(table, where, patch));
  }
  increment<T extends TableName>(table: T, id: string, column: NumericKeys<Tables[T]>, by: number) {
    return this.#run(() => this.#ops.increment(table, id, column, by));
  }
  delete<T extends TableName>(table: T, where: Where<Tables[T]>) {
    return this.#run(() => this.#ops.delete(table, where));
  }
  get<T extends TableName>(table: T, id: string) {
    return this.#run(() => this.#ops.get(table, id));
  }
  find<T extends TableName>(table: T, query?: Query<Tables[T]>) {
    return this.#run(() => this.#ops.find(table, query));
  }
  findOne<T extends TableName>(table: T, where: Where<Tables[T]>) {
    return this.#run(() => this.#ops.findOne(table, where));
  }
  count<T extends TableName>(table: T, where?: Where<Tables[T]>) {
    return this.#run(() => this.#ops.count(table, where));
  }

  async transaction<R>(fn: (tx: StoreOps) => Promise<R>): Promise<R> {
    // Check and take the lock in the same microtask.
    while (this.#lock) await this.#lock;
    let release!: () => void;
    this.#lock = new Promise<void>((resolve) => (release = resolve));
    this.#backend.begin();
    try {
      const result = await fn(this.#ops);
      this.#backend.commit();
      return result;
    } catch (error) {
      this.#backend.rollback();
      throw error;
    } finally {
      this.#lock = null;
      release();
    }
  }

  close() {
    this.#backend.close();
  }
}

function makeOps(b: SyncBackend): StoreOps {
  return {
    async insert(table, row) {
      b.insert(table, row as any, false);
      return row;
    },
    async upsert(table, row) {
      b.insert(table, row as any, true);
      return row;
    },
    async update(table, where, patch) {
      return b.update(table, where, patch as any);
    },
    async increment(table, id, column, by) {
      b.increment(table, id, column, by);
    },
    async delete(table, where) {
      return b.delete(table, where);
    },
    async get(table, id) {
      return b.find(table, { where: { id }, limit: 1 })[0] as any;
    },
    async find(table, query) {
      return b.find(table, query ?? {}) as any;
    },
    async findOne(table, where) {
      return b.find(table, { where, limit: 1 })[0] as any;
    },
    async count(table, where) {
      return b.count(table, where ?? {});
    },
  };
}

/** True when `value` is an operator object rather than a plain value. */
export function isOps(value: unknown): value is Ops<unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const OP_KEYS = new Set(['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'contains']);

export function assertOps(ops: Record<string, unknown>): void {
  for (const key of Object.keys(ops)) {
    if (!OP_KEYS.has(key)) throw new Error(`Unknown query operator: ${key}`);
  }
}

/** Random, URL-safe identifier (base62, ~83 bits by default). */
export function newId(length = 14): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % 62];
  return out;
}
