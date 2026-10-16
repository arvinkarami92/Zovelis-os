// One contract suite, run against both storage adapters, so the in-memory
// store used by the demo behaves exactly like SQLite.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store/memory.ts';
import { SqliteStore } from '../src/store/sqlite.ts';
import type { Store } from '../src/store/store.ts';
import type { FollowRow, SpaceRow } from '../src/store/types.ts';

function follow(id: string, followerId: string, followeeId: string, createdAt: number, status: FollowRow['status'] = 'active'): FollowRow {
  return { id, followerId, followeeId, status, createdAt };
}

function space(id: string, slug: string, extra: Partial<SpaceRow> = {}): SpaceRow {
  return {
    id, slug, name: `Space ${slug}`, description: '', emoji: '🌿', hue: 120, visibility: 'public', ownerId: 'u1',
    rules: ['Be kind'], topics: ['hiking'], location: 'Lisbon', memberCount: 0, createdAt: 1, ...extra,
  };
}

const adapters: Array<[string, () => Store]> = [
  ['memory', () => new MemoryStore()],
  ['sqlite', () => new SqliteStore(':memory:')],
];

for (const [name, make] of adapters) {
  describe(`store contract: ${name}`, () => {
    let store: Store;
    beforeEach(async () => {
      store = make();
      await store.insert('follows', follow('a', 'u1', 'u2', 10));
      await store.insert('follows', follow('b', 'u1', 'u3', 20));
      await store.insert('follows', follow('c', 'u2', 'u1', 30, 'pending'));
    });

    it('gets, finds and counts', async () => {
      assert.equal((await store.get('follows', 'b'))?.followeeId, 'u3');
      assert.equal(await store.get('follows', 'missing'), undefined);
      assert.equal(await store.count('follows'), 3);
      assert.equal(await store.count('follows', { followerId: 'u1' }), 2);
      const rows = await store.find('follows', { where: { followerId: 'u1' }, orderBy: [['createdAt', 'desc']] });
      assert.deepEqual(rows.map((r) => r.id), ['b', 'a']);
    });

    it('supports operators, $or, limit and offset', async () => {
      const ids = async (q: Parameters<Store['find']>[1]) => (await store.find('follows', q as any)).map((r) => r.id).sort();
      assert.deepEqual(await ids({ where: { createdAt: { gt: 10, lte: 30 } } }), ['b', 'c']);
      assert.deepEqual(await ids({ where: { followeeId: { in: ['u2', 'u1'] } } }), ['a', 'c']);
      assert.deepEqual(await ids({ where: { followeeId: { in: [] } } }), []);
      assert.deepEqual(await ids({ where: { followeeId: { nin: ['u2'] } } }), ['b', 'c']);
      assert.deepEqual(await ids({ where: { status: { ne: 'pending' } } }), ['a', 'b']);
      assert.deepEqual(await ids({ where: { $or: [{ followerId: 'u2' }, { followeeId: 'u3' }] } }), ['b', 'c']);
      assert.deepEqual(await ids({ where: { $or: [] } }), []);
      const page = await store.find('follows', { orderBy: [['createdAt', 'asc']], limit: 1, offset: 1 });
      assert.deepEqual(page.map((r) => r.id), ['b']);
    });

    it('stores booleans, JSON and nulls faithfully', async () => {
      await store.insert('spaces', space('s1', 'trail-club', { rules: ['Leave no trace', 'Be kind'] }));
      const row = await store.get('spaces', 's1');
      assert.deepEqual(row?.rules, ['Leave no trace', 'Be kind']);
      await store.insert('conversationMembers', {
        id: 'm1', conversationId: 'c1', userId: 'u1', accepted: true, muted: false, lastReadAt: 0, createdAt: 0,
      });
      const member = await store.findOne('conversationMembers', { accepted: true });
      assert.equal(member?.muted, false);
      assert.equal(member?.accepted, true);
      await store.insert('posts', {
        id: 'p1', authorId: 'u1', kind: 'post', text: 'Hello Zemvii', media: [], audience: 'public', circleId: null,
        spaceId: null, planId: null, origin: 'human', topics: ['hello'], mentions: [], replyControl: 'everyone',
        showCounts: false, sponsored: false, sponsorName: null, heat: 0.25, reactionCount: 0, commentCount: 0,
        saveCount: 0, tipCents: 0, status: 'visible', createdAt: 5, editedAt: null,
      });
      assert.equal((await store.find('posts', { where: { circleId: null } })).length, 1);
      assert.equal((await store.find('posts', { where: { circleId: { ne: null } } })).length, 0);
      assert.equal((await store.find('posts', { where: { text: { contains: 'zemVII' } } })).length, 1);
      assert.equal((await store.get('posts', 'p1'))?.heat, 0.25);
    });

    it('updates, increments, upserts and deletes', async () => {
      assert.equal(await store.update('follows', { id: 'c' }, { status: 'active' }), 1);
      assert.equal((await store.get('follows', 'c'))?.status, 'active');
      await store.insert('spaces', space('s1', 'trail-club'));
      await store.increment('spaces', 's1', 'memberCount', 3);
      await store.increment('spaces', 's1', 'memberCount', -1);
      assert.equal((await store.get('spaces', 's1'))?.memberCount, 2);
      await store.upsert('follows', follow('a', 'u1', 'u9', 11));
      assert.equal((await store.get('follows', 'a'))?.followeeId, 'u9');
      assert.equal(await store.delete('follows', { followerId: 'u1' }), 2);
      assert.equal(await store.count('follows'), 1);
    });

    it('enforces primary keys and unique columns', async () => {
      await assert.rejects(store.insert('follows', follow('a', 'x', 'y', 1)), /UNIQUE/);
      await store.insert('spaces', space('s1', 'trail-club'));
      await assert.rejects(store.insert('spaces', space('s2', 'trail-club')), /UNIQUE/);
      await store.insert('spaces', space('s3', 'book-club'));
      await assert.rejects(store.update('spaces', { id: 's3' }, { slug: 'trail-club' }), /UNIQUE/);
    });

    it('returns copies, not live references', async () => {
      await store.insert('spaces', space('s1', 'trail-club'));
      const first = await store.get('spaces', 's1');
      first!.rules.push('mutated');
      assert.deepEqual((await store.get('spaces', 's1'))?.rules, ['Be kind']);
    });

    it('commits and rolls back transactions', async () => {
      await store.transaction(async (tx) => {
        await tx.insert('follows', follow('d', 'u4', 'u5', 40));
      });
      assert.ok(await store.get('follows', 'd'));
      await assert.rejects(
        store.transaction(async (tx) => {
          await tx.insert('follows', follow('e', 'u4', 'u6', 50));
          await tx.update('follows', { id: 'a' }, { status: 'pending' });
          await tx.delete('follows', { id: 'b' });
          throw new Error('boom');
        }),
        /boom/,
      );
      assert.equal(await store.get('follows', 'e'), undefined);
      assert.equal((await store.get('follows', 'a'))?.status, 'active');
      assert.ok(await store.get('follows', 'b'));
    });

    it('makes outside operations wait for a running transaction', async () => {
      const order: string[] = [];
      let resume!: () => void;
      const gate = new Promise<void>((resolve) => (resume = resolve));
      const tx = store.transaction(async (t) => {
        await t.insert('follows', follow('t1', 'x', 'y', 1));
        order.push('tx-insert');
        await gate;
        order.push('tx-end');
      });
      const outside = store.count('follows').then((n) => {
        order.push(`outside-count-${n}`);
      });
      await new Promise((r) => setTimeout(r, 10));
      resume();
      await Promise.all([tx, outside]);
      assert.deepEqual(order, ['tx-insert', 'tx-end', 'outside-count-4']);
    });

    it('rejects unknown columns and operators', async () => {
      await assert.rejects(store.find('follows', { where: { nope: 1 } as any }), /Unknown column/);
      await assert.rejects(store.find('follows', { where: { createdAt: { between: 1 } } as any }), /Unknown query operator/);
    });
  });
}
