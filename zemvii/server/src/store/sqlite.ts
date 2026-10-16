// SQLite storage adapter built on Node's built-in `node:sqlite` (no native
// npm dependencies). Tables are created from `schema.ts`; columns added to the
// schema later are added to existing databases on startup.
//
// Identifiers in generated SQL always come from the schema (validated by
// `columnType`), and every value is a bound parameter.

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { columnType, schema, tableNames, type ColumnType } from './schema.ts';
import { assertOps, isOps, LockingStore, type Query, type SyncBackend, type Where } from './store.ts';
import type { TableName } from './types.ts';

type Row = Record<string, unknown>;
type SqlValue = string | number | null;

const SQL_TYPES: Record<ColumnType, string> = {
  text: 'TEXT',
  int: 'INTEGER',
  real: 'REAL',
  bool: 'INTEGER',
  json: 'TEXT',
};

const q = (identifier: string) => `"${identifier}"`;

function toDb(type: ColumnType, value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'bool':
      return value ? 1 : 0;
    case 'json':
      return JSON.stringify(value);
    case 'int':
    case 'real':
      return Number(value);
    default:
      return String(value);
  }
}

function fromDb(table: TableName, raw: Row): Row {
  const row: Row = {};
  const columns = schema[table].columns as Record<string, ColumnType>;
  for (const [column, type] of Object.entries(columns)) {
    const value = raw[column];
    if (value === null || value === undefined) row[column] = null;
    else if (type === 'bool') row[column] = value === 1 || value === 1n;
    else if (type === 'json') row[column] = JSON.parse(value as string);
    else if (typeof value === 'bigint') row[column] = Number(value);
    else row[column] = value;
  }
  return row;
}

class SqliteBackend implements SyncBackend {
  #db: DatabaseSync;
  #statements = new Map<string, StatementSync>();

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
    this.#migrate();
  }

  #migrate() {
    for (const table of tableNames) {
      const columns = schema[table].columns as Record<string, ColumnType>;
      const definitions = Object.entries(columns).map(
        ([name, type]) => `${q(name)} ${SQL_TYPES[type]}${name === 'id' ? ' PRIMARY KEY NOT NULL' : ''}`,
      );
      this.#db.exec(`CREATE TABLE IF NOT EXISTS ${q(table)} (${definitions.join(', ')})`);
      const existing = new Set(
        (this.#db.prepare(`PRAGMA table_info(${q(table)})`).all() as Row[]).map((c) => c.name as string),
      );
      for (const [name, type] of Object.entries(columns)) {
        if (!existing.has(name)) this.#db.exec(`ALTER TABLE ${q(table)} ADD COLUMN ${q(name)} ${SQL_TYPES[type]}`);
      }
      for (const index of schema[table].indexes ?? []) {
        const indexName = `idx_${table}_${index.join('_')}`;
        this.#db.exec(`CREATE INDEX IF NOT EXISTS ${q(indexName)} ON ${q(table)} (${index.map(q).join(', ')})`);
      }
      for (const index of schema[table].unique ?? []) {
        const indexName = `uniq_${table}_${index.join('_')}`;
        this.#db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${q(indexName)} ON ${q(table)} (${index.map(q).join(', ')})`);
      }
    }
  }

  #prepare(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (!statement) {
      // IN lists of different lengths produce distinct SQL; keep the cache bounded.
      if (this.#statements.size >= 500) this.#statements.clear();
      statement = this.#db.prepare(sql);
      this.#statements.set(sql, statement);
    }
    return statement;
  }

  #where(table: TableName, where: Where<any> | undefined, params: SqlValue[]): string {
    if (!where) return '1';
    const parts: string[] = [];
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === '$or') {
        const alternatives = (cond as Where<any>[]).map((w) => `(${this.#where(table, w, params)})`);
        parts.push(alternatives.length ? `(${alternatives.join(' OR ')})` : '0');
        continue;
      }
      const type = columnType(table, key);
      if (type === 'json') throw new Error(`Cannot filter on JSON column ${table}.${key}`);
      const column = q(key);
      if (!isOps(cond)) {
        params.push(toDb(type, cond));
        parts.push(`${column} IS ?`);
        continue;
      }
      assertOps(cond as Row);
      const ops = cond as Row;
      if ('eq' in ops) {
        params.push(toDb(type, ops.eq));
        parts.push(`${column} IS ?`);
      }
      if ('ne' in ops) {
        params.push(toDb(type, ops.ne));
        parts.push(`${column} IS NOT ?`);
      }
      if (ops.in !== undefined) {
        const list = ops.in as unknown[];
        if (list.length === 0) parts.push('0');
        else {
          params.push(...list.map((v) => toDb(type, v)));
          parts.push(`${column} IN (${list.map(() => '?').join(', ')})`);
        }
      }
      if (ops.nin !== undefined) {
        const list = ops.nin as unknown[];
        if (list.length > 0) {
          params.push(...list.map((v) => toDb(type, v)));
          parts.push(`(${column} IS NULL OR ${column} NOT IN (${list.map(() => '?').join(', ')}))`);
        }
      }
      for (const [op, sql] of [['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<=']] as const) {
        if (ops[op] !== undefined) {
          params.push(toDb(type, ops[op]));
          parts.push(`${column} ${sql} ?`);
        }
      }
      if (ops.contains !== undefined) {
        params.push(String(ops.contains));
        parts.push(`instr(lower(${column}), lower(?)) > 0`);
      }
    }
    return parts.length ? parts.join(' AND ') : '1';
  }

  insert(table: TableName, row: Row, replace: boolean) {
    const columns = Object.keys(schema[table].columns);
    for (const key of Object.keys(row)) columnType(table, key);
    const values = columns.map((c) => toDb(columnType(table, c), row[c]));
    const sql = `INSERT ${replace ? 'OR REPLACE ' : ''}INTO ${q(table)} (${columns.map(q).join(', ')}) VALUES (${columns
      .map(() => '?')
      .join(', ')})`;
    this.#prepare(sql).run(...values);
  }

  update(table: TableName, where: Where<any>, patch: Row): number {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return 0;
    const params: SqlValue[] = entries.map(([key, value]) => toDb(columnType(table, key), value));
    const assignments = entries.map(([key]) => `${q(key)} = ?`).join(', ');
    const sql = `UPDATE ${q(table)} SET ${assignments} WHERE ${this.#where(table, where, params)}`;
    return Number(this.#prepare(sql).run(...params).changes);
  }

  increment(table: TableName, id: string, column: string, by: number) {
    columnType(table, column);
    const sql = `UPDATE ${q(table)} SET ${q(column)} = COALESCE(${q(column)}, 0) + ? WHERE "id" = ?`;
    this.#prepare(sql).run(by, id);
  }

  delete(table: TableName, where: Where<any>): number {
    const params: SqlValue[] = [];
    const sql = `DELETE FROM ${q(table)} WHERE ${this.#where(table, where, params)}`;
    return Number(this.#prepare(sql).run(...params).changes);
  }

  find(table: TableName, query: Query<any>): Row[] {
    const params: SqlValue[] = [];
    let sql = `SELECT * FROM ${q(table)} WHERE ${this.#where(table, query.where, params)}`;
    if (query.orderBy?.length) {
      const order = query.orderBy.map(([column, direction]) => {
        columnType(table, column);
        return `${q(column)} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
      });
      sql += ` ORDER BY ${order.join(', ')}`;
    }
    if (query.limit !== undefined || query.offset !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(query.limit ?? -1, query.offset ?? 0);
    }
    return (this.#prepare(sql).all(...params) as Row[]).map((raw) => fromDb(table, raw));
  }

  count(table: TableName, where: Where<any>): number {
    const params: SqlValue[] = [];
    const sql = `SELECT COUNT(*) AS n FROM ${q(table)} WHERE ${this.#where(table, where, params)}`;
    return Number((this.#prepare(sql).get(...params) as Row).n);
  }

  begin() {
    this.#db.exec('BEGIN IMMEDIATE');
  }
  commit() {
    this.#db.exec('COMMIT');
  }
  rollback() {
    this.#db.exec('ROLLBACK');
  }
  close() {
    this.#db.close();
  }
}

export class SqliteStore extends LockingStore {
  constructor(path: string) {
    super(new SqliteBackend(path));
  }
}
