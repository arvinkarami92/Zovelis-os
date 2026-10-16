// In-memory storage adapter. Used by the tests and by the in-browser demo.
// It mirrors the SQLite adapter's semantics (null-safe equality, unique
// constraints, NULLs sorting first) and journals writes so a failed
// transaction rolls back.

import { schema, columnType } from './schema.ts';
import { assertOps, isOps, LockingStore, type Query, type SyncBackend, type Where } from './store.ts';
import type { TableName } from './types.ts';

type Row = Record<string, unknown>;
export type MemoryDump = Partial<Record<TableName, Row[]>>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function matchesWhere(row: Row, where: Where<any>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === '$or') {
      if (!(cond as Where<any>[]).some((w) => matchesWhere(row, w))) return false;
      continue;
    }
    const value = row[key] ?? null;
    if (!isOps(cond)) {
      if (value !== cond) return false;
      continue;
    }
    assertOps(cond as Row);
    const ops = cond as Row;
    if ('eq' in ops && value !== (ops.eq ?? null)) return false;
    if ('ne' in ops && value === (ops.ne ?? null)) return false;
    if (ops.in !== undefined && !(ops.in as unknown[]).includes(value)) return false;
    if (ops.nin !== undefined && (ops.nin as unknown[]).includes(value)) return false;
    if (ops.gt !== undefined && (value === null || !((value as number) > (ops.gt as number)))) return false;
    if (ops.gte !== undefined && (value === null || !((value as number) >= (ops.gte as number)))) return false;
    if (ops.lt !== undefined && (value === null || !((value as number) < (ops.lt as number)))) return false;
    if (ops.lte !== undefined && (value === null || !((value as number) <= (ops.lte as number)))) return false;
    if (ops.contains !== undefined) {
      if (value === null) return false;
      if (!String(value).toLowerCase().includes(String(ops.contains).toLowerCase())) return false;
    }
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  return (a as number) < (b as number) ? -1 : 1;
}

class MemoryBackend implements SyncBackend {
  tables = new Map<TableName, Map<string, Row>>();
  #journal: Array<() => void> | null = null;

  constructor(dump?: MemoryDump) {
    for (const name of Object.keys(schema) as TableName[]) this.tables.set(name, new Map());
    if (dump) {
      for (const [name, rows] of Object.entries(dump) as [TableName, Row[]][]) {
        const table = this.tables.get(name);
        if (!table) continue;
        for (const row of rows) table.set(row.id as string, clone(row));
      }
    }
  }

  #table(name: TableName): Map<string, Row> {
    const table = this.tables.get(name);
    if (!table) throw new Error(`Unknown table ${name}`);
    return table;
  }

  #checkColumns(table: TableName, row: Row) {
    for (const key of Object.keys(row)) columnType(table, key);
  }

  #checkUnique(table: TableName, row: Row, ignoreId: string | null) {
    for (const columns of schema[table].unique ?? []) {
      for (const other of this.#table(table).values()) {
        if (other.id === ignoreId) continue;
        if (columns.every((c) => row[c] !== null && row[c] !== undefined && other[c] === row[c])) {
          throw new Error(`UNIQUE constraint failed: ${table}.${columns.join(', ')}`);
        }
      }
    }
  }

  #checkWhere(table: TableName, where: Where<any> | undefined) {
    if (!where) return;
    for (const [key, cond] of Object.entries(where)) {
      if (key === '$or') {
        for (const alternative of cond as Where<any>[]) this.#checkWhere(table, alternative);
        continue;
      }
      if (columnType(table, key) === 'json') throw new Error(`Cannot filter on JSON column ${table}.${key}`);
      if (isOps(cond)) assertOps(cond as Row);
    }
  }

  #record(undo: () => void) {
    this.#journal?.push(undo);
  }

  insert(name: TableName, row: Row, replace: boolean) {
    this.#checkColumns(name, row);
    const table = this.#table(name);
    const id = row.id as string;
    if (typeof id !== 'string' || !id) throw new Error(`${name}: missing id`);
    const previous = table.get(id);
    if (previous && !replace) throw new Error(`UNIQUE constraint failed: ${name}.id`);
    this.#checkUnique(name, row, previous ? id : null);
    const stored: Row = {};
    for (const column of Object.keys(schema[name].columns)) stored[column] = clone(row[column] ?? null);
    table.set(id, stored);
    this.#record(() => (previous ? table.set(id, previous) : table.delete(id)));
  }

  update(name: TableName, where: Where<any>, patch: Row): number {
    this.#checkColumns(name, patch);
    this.#checkWhere(name, where);
    const table = this.#table(name);
    let changed = 0;
    for (const [id, row] of [...table.entries()]) {
      if (!matchesWhere(row, where)) continue;
      const next = { ...row };
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) next[key] = clone(value);
      }
      this.#checkUnique(name, next, id);
      table.set(id, next);
      this.#record(() => table.set(id, row));
      changed++;
    }
    return changed;
  }

  increment(name: TableName, id: string, column: string, by: number) {
    const table = this.#table(name);
    const row = table.get(id);
    if (!row) return;
    columnType(name, column);
    table.set(id, { ...row, [column]: ((row[column] as number) ?? 0) + by });
    this.#record(() => table.set(id, row));
  }

  delete(name: TableName, where: Where<any>): number {
    this.#checkWhere(name, where);
    const table = this.#table(name);
    let removed = 0;
    for (const [id, row] of [...table.entries()]) {
      if (!matchesWhere(row, where)) continue;
      table.delete(id);
      this.#record(() => table.set(id, row));
      removed++;
    }
    return removed;
  }

  find(name: TableName, query: Query<any>): Row[] {
    this.#checkWhere(name, query.where);
    for (const [column] of query.orderBy ?? []) columnType(name, column);
    let rows = [...this.#table(name).values()];
    if (query.where) rows = rows.filter((row) => matchesWhere(row, query.where!));
    if (query.orderBy?.length) {
      rows.sort((a, b) => {
        for (const [column, direction] of query.orderBy!) {
          const result = compareValues(a[column], b[column]);
          if (result !== 0) return direction === 'desc' ? -result : result;
        }
        return 0;
      });
    }
    const offset = query.offset ?? 0;
    rows = rows.slice(offset, query.limit === undefined ? undefined : offset + query.limit);
    return rows.map(clone);
  }

  count(name: TableName, where: Where<any>): number {
    this.#checkWhere(name, where);
    let total = 0;
    for (const row of this.#table(name).values()) if (matchesWhere(row, where)) total++;
    return total;
  }

  begin() {
    this.#journal = [];
  }
  commit() {
    this.#journal = null;
  }
  rollback() {
    const journal = this.#journal ?? [];
    this.#journal = null;
    for (const undo of journal.reverse()) undo();
  }
  close() {}

  dump(): MemoryDump {
    const out: MemoryDump = {};
    for (const [name, table] of this.tables) out[name] = [...table.values()].map(clone);
    return out;
  }
}

export class MemoryStore extends LockingStore {
  #backend: MemoryBackend;

  constructor(dump?: MemoryDump) {
    const backend = new MemoryBackend(dump);
    super(backend);
    this.#backend = backend;
  }

  /** A snapshot of all data, e.g. for persisting the demo in the browser. */
  dump(): MemoryDump {
    return this.#backend.dump();
  }
}
