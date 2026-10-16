// Post text with #topics, @mentions and web links made clickable.

import { Fragment, type ReactNode } from 'react';
import { Link } from '../lib/router.tsx';

const TOKEN = /(#[\p{L}\p{N}_]{2,30})|(@[a-zA-Z0-9_]{3,20})|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gu;

export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    const before = index > 0 ? text[index - 1] : ' ';
    if (/[\p{L}\p{N}_&]/u.test(before) && !match[3]) continue;
    if (index > last) parts.push(text.slice(last, index));
    const [token] = match;
    if (match[1]) parts.push(<Link key={index} to={`/t/${encodeURIComponent(token.slice(1).toLowerCase())}`}>{token}</Link>);
    else if (match[2]) parts.push(<Link key={index} to={`/u/${token.slice(1).toLowerCase()}`}>{token}</Link>);
    else {
      parts.push(
        <a key={index} href={token} target="_blank" rel="noopener noreferrer nofollow ugc">
          {token.replace(/^https?:\/\//, '').slice(0, 40)}
          {token.replace(/^https?:\/\//, '').length > 40 ? '…' : ''}
        </a>,
      );
    }
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? <Fragment key={`t${i}`}>{p}</Fragment> : p))}</>;
}
