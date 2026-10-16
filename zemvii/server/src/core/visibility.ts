// Who may see a post. One function, used by every read path (feeds, profiles,
// search, post pages, notifications), so audience rules are enforced once.

import type { PostRow, UserRow } from '../store/types.ts';

export interface ViewerContext {
  viewerId: string | null;
  isAdmin: boolean;
  /** Authors the viewer follows (active follows only). */
  following: Set<string>;
  /** People who follow the viewer (active). Friends = following ∩ followers. */
  followers: Set<string>;
  /** Ids of circles (owned by anyone) that include the viewer. */
  inCircles: Set<string>;
  /** Creators the viewer actively supports. */
  supporting: Set<string>;
  /** Spaces the viewer is a member of. */
  spaces: Set<string>;
  /** Public spaces (posts there are visible to everyone). */
  publicSpaces: Set<string>;
  /** Users the viewer blocked or who blocked the viewer. */
  blocked: Set<string>;
}

export function emptyViewer(): ViewerContext {
  return {
    viewerId: null, isAdmin: false, following: new Set(), followers: new Set(), inCircles: new Set(),
    supporting: new Set(), spaces: new Set(), publicSpaces: new Set(), blocked: new Set(),
  };
}

export function isFriend(ctx: ViewerContext, userId: string): boolean {
  return ctx.following.has(userId) && ctx.followers.has(userId);
}

type PostAccess = Pick<PostRow, 'authorId' | 'audience' | 'circleId' | 'spaceId' | 'status'>;
type AuthorAccess = Pick<UserRow, 'id' | 'status' | 'settings'>;

export function canViewPost(post: PostAccess, author: AuthorAccess, ctx: ViewerContext): boolean {
  const own = ctx.viewerId !== null && ctx.viewerId === post.authorId;
  if (post.status === 'deleted') return false;
  if (post.status === 'removed') return own || ctx.isAdmin;
  if (own) return true;
  if (author.status !== 'active') return ctx.isAdmin;
  if (ctx.blocked.has(post.authorId)) return false;

  // Posts in a space follow the space's rules, even from private accounts.
  if (post.audience === 'space') {
    return post.spaceId !== null && (ctx.spaces.has(post.spaceId) || ctx.publicSpaces.has(post.spaceId));
  }
  // Private accounts are visible only to approved followers.
  if (author.settings.privacy.privateAccount && !ctx.following.has(post.authorId)) return false;

  switch (post.audience) {
    case 'public':
      return true;
    case 'followers':
      return ctx.following.has(post.authorId);
    case 'friends':
      return isFriend(ctx, post.authorId);
    case 'circle':
      return post.circleId !== null && ctx.inCircles.has(post.circleId);
    case 'supporters':
      return ctx.supporting.has(post.authorId);
    default:
      return false;
  }
}

/** May the viewer comment, given the post's reply control? */
export function canReply(post: Pick<PostRow, 'authorId' | 'replyControl'>, ctx: ViewerContext): boolean {
  if (ctx.viewerId === post.authorId) return true;
  switch (post.replyControl) {
    case 'everyone':
      return true;
    case 'followers':
      // "Followers" means people who follow the author.
      return ctx.following.has(post.authorId);
    case 'friends':
      return isFriend(ctx, post.authorId);
    default:
      return false;
  }
}
