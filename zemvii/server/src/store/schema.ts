// Column types and indexes for every table. The `Schema` type forces every
// column of every row type to be declared here, so the SQL tables and the
// TypeScript types cannot drift apart.

import type { TableName, Tables } from './types.ts';

export type ColumnType = 'text' | 'int' | 'real' | 'bool' | 'json';

export interface TableSchema<Row> {
  columns: { [K in keyof Row]-?: ColumnType };
  /** Each entry is a list of columns for one (non-unique) index. */
  indexes?: string[][];
  unique?: string[][];
}

export type Schema = { [K in TableName]: TableSchema<Tables[K]> };

export const schema: Schema = {
  users: {
    columns: {
      id: 'text', handle: 'text', name: 'text', email: 'text', passwordHash: 'text', bio: 'text',
      pronouns: 'text', location: 'text', website: 'text', avatarUrl: 'text', hue: 'int',
      birthDate: 'text', verifiedHuman: 'bool', role: 'text', status: 'text', suspendedUntil: 'int',
      settings: 'json', topics: 'json', walletCents: 'int', feedSeenAt: 'int', bot: 'bool',
      createdAt: 'int', lastActiveAt: 'int',
    },
    unique: [['handle'], ['email']],
  },
  sessions: {
    columns: { id: 'text', userId: 'text', userAgent: 'text', createdAt: 'int', expiresAt: 'int', lastSeenAt: 'int' },
    indexes: [['userId']],
  },
  follows: {
    columns: { id: 'text', followerId: 'text', followeeId: 'text', status: 'text', createdAt: 'int' },
    indexes: [['followerId'], ['followeeId']],
  },
  circles: {
    columns: { id: 'text', ownerId: 'text', name: 'text', emoji: 'text', hue: 'int', createdAt: 'int' },
    indexes: [['ownerId']],
  },
  circleMembers: {
    columns: { id: 'text', circleId: 'text', ownerId: 'text', userId: 'text', createdAt: 'int' },
    indexes: [['circleId'], ['userId'], ['ownerId']],
  },
  posts: {
    columns: {
      id: 'text', authorId: 'text', kind: 'text', text: 'text', media: 'json', audience: 'text',
      circleId: 'text', spaceId: 'text', planId: 'text', origin: 'text', topics: 'json', mentions: 'json',
      replyControl: 'text', showCounts: 'bool', sponsored: 'bool', sponsorName: 'text', heat: 'real',
      reactionCount: 'int', commentCount: 'int', saveCount: 'int', tipCents: 'int', status: 'text',
      createdAt: 'int', editedAt: 'int',
    },
    indexes: [['authorId', 'createdAt'], ['createdAt'], ['spaceId', 'createdAt'], ['planId'], ['kind', 'createdAt']],
  },
  reactions: {
    columns: { id: 'text', postId: 'text', userId: 'text', type: 'text', createdAt: 'int' },
    indexes: [['postId'], ['userId', 'createdAt']],
  },
  comments: {
    columns: {
      id: 'text', postId: 'text', authorId: 'text', parentId: 'text', text: 'text', heat: 'real',
      nudged: 'bool', status: 'text', createdAt: 'int',
    },
    indexes: [['postId', 'createdAt'], ['authorId']],
  },
  saves: {
    columns: { id: 'text', userId: 'text', postId: 'text', createdAt: 'int' },
    indexes: [['userId', 'createdAt'], ['postId']],
  },
  notifications: {
    columns: {
      id: 'text', userId: 'text', actorId: 'text', type: 'text', postId: 'text', commentId: 'text',
      planId: 'text', spaceId: 'text', text: 'text', createdAt: 'int', deliverAt: 'int', readAt: 'int',
    },
    indexes: [['userId', 'deliverAt']],
  },
  conversations: {
    columns: {
      id: 'text', kind: 'text', title: 'text', directKey: 'text', createdBy: 'text', createdAt: 'int',
      lastMessageAt: 'int',
    },
    indexes: [['directKey']],
  },
  conversationMembers: {
    columns: {
      id: 'text', conversationId: 'text', userId: 'text', accepted: 'bool', muted: 'bool',
      lastReadAt: 'int', createdAt: 'int',
    },
    indexes: [['userId'], ['conversationId']],
  },
  messages: {
    columns: {
      id: 'text', conversationId: 'text', senderId: 'text', text: 'text', media: 'json', planId: 'text',
      status: 'text', createdAt: 'int',
    },
    indexes: [['conversationId', 'createdAt']],
  },
  blocks: {
    columns: { id: 'text', blockerId: 'text', blockedId: 'text', createdAt: 'int' },
    indexes: [['blockerId'], ['blockedId']],
  },
  mutes: {
    columns: { id: 'text', muterId: 'text', mutedId: 'text', createdAt: 'int' },
    indexes: [['muterId']],
  },
  reports: {
    columns: {
      id: 'text', reporterId: 'text', targetType: 'text', targetId: 'text', targetUserId: 'text',
      reason: 'text', details: 'text', status: 'text', createdAt: 'int', resolvedAt: 'int', resolvedBy: 'text',
    },
    indexes: [['status', 'createdAt'], ['targetId']],
  },
  moderationActions: {
    columns: {
      id: 'text', userId: 'text', reportId: 'text', targetType: 'text', targetId: 'text', action: 'text',
      reason: 'text', explanation: 'text', createdBy: 'text', createdAt: 'int', appealStatus: 'text',
      appealText: 'text', appealAt: 'int', appealResolvedAt: 'int',
    },
    indexes: [['userId'], ['appealStatus']],
  },
  notes: {
    columns: {
      id: 'text', postId: 'text', authorId: 'text', text: 'text', helpful: 'int', notHelpful: 'int',
      status: 'text', createdAt: 'int',
    },
    indexes: [['postId']],
  },
  noteRatings: {
    columns: { id: 'text', noteId: 'text', userId: 'text', helpful: 'bool', createdAt: 'int' },
    indexes: [['noteId']],
  },
  spaces: {
    columns: {
      id: 'text', slug: 'text', name: 'text', description: 'text', emoji: 'text', hue: 'int',
      visibility: 'text', ownerId: 'text', rules: 'json', topics: 'json', location: 'text',
      memberCount: 'int', createdAt: 'int',
    },
    unique: [['slug']],
  },
  spaceMembers: {
    columns: { id: 'text', spaceId: 'text', userId: 'text', role: 'text', createdAt: 'int' },
    indexes: [['spaceId'], ['userId']],
  },
  plans: {
    columns: {
      id: 'text', hostId: 'text', title: 'text', description: 'text', startsAt: 'int', endsAt: 'int',
      location: 'text', audience: 'text', circleId: 'text', spaceId: 'text', capacity: 'int', hue: 'int',
      emoji: 'text', goingCount: 'int', status: 'text', createdAt: 'int',
    },
    indexes: [['startsAt'], ['hostId'], ['spaceId']],
  },
  rsvps: {
    columns: { id: 'text', planId: 'text', userId: 'text', status: 'text', createdAt: 'int' },
    indexes: [['planId'], ['userId']],
  },
  transactions: {
    columns: {
      id: 'text', kind: 'text', fromUserId: 'text', toUserId: 'text', grossCents: 'int', feeCents: 'int',
      netCents: 'int', postId: 'text', note: 'text', createdAt: 'int',
    },
    indexes: [['toUserId', 'createdAt'], ['fromUserId', 'createdAt']],
  },
  supports: {
    columns: {
      id: 'text', creatorId: 'text', supporterId: 'text', priceCents: 'int', status: 'text',
      startedAt: 'int', renewsAt: 'int', cancelledAt: 'int',
    },
    indexes: [['creatorId'], ['supporterId']],
  },
  usage: {
    columns: {
      id: 'text', userId: 'text', day: 'text', seconds: 'int', sessions: 'int', intents: 'json',
      updatedAt: 'int',
    },
    indexes: [['userId', 'day']],
  },
  recoveries: {
    columns: {
      id: 'text', userId: 'text', secretHash: 'text', approvals: 'json', status: 'text', createdAt: 'int',
      expiresAt: 'int',
    },
    indexes: [['userId']],
  },
  media: {
    columns: { id: 'text', ownerId: 'text', mime: 'text', size: 'int', url: 'text', createdAt: 'int' },
    indexes: [['ownerId']],
  },
};

export const tableNames = Object.keys(schema) as TableName[];

export function columnType(table: TableName, column: string): ColumnType {
  const type = (schema[table].columns as Record<string, ColumnType>)[column];
  if (!type) throw new Error(`Unknown column ${table}.${column}`);
  return type;
}
