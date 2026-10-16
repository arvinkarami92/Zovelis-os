// Creator dashboard and wallet. Creators keep 90%; every fee is shown.

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Coins, Megaphone, Sparkles, Star, Wallet } from 'lucide-react';
import type { CreatorDashboard, WalletView } from '../../../server/src/services/creator.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi } from '../lib/hooks.ts';
import { Link } from '../lib/router.tsx';
import { useMe, useSession } from '../lib/session.tsx';
import { formatMoney, longAgo } from '../lib/format.ts';
import { Avatar, Empty, ErrorNote, Spinner, Toggle, useToast } from '../components/ui.tsx';

export function CreatorPage() {
  const me = useMe();
  const { updateSettings } = useSession();
  const toast = useToast();
  const dash = useApi<CreatorDashboard>('/creator/dashboard');
  const [price, setPrice] = useState(me.settings.creator.supportPriceCents);
  const [perks, setPerks] = useState(me.settings.creator.supportPerks);
  const d = dash.data;

  const save = async (patch: Partial<CreatorDashboard['settings']>) => {
    try {
      await updateSettings({ creator: patch });
      toast('Saved');
      void dash.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Creator</h1>
        <Link to="/wallet" className="btn btn-secondary btn-small">
          <Wallet size={16} /> Wallet
        </Link>
      </div>
      {dash.loading && <Spinner />}
      <ErrorNote error={dash.error} retry={dash.reload} />
      {d && !d.eligible && (
        <Empty icon={<Coins size={26} />} title="Creator payments start at 18">
          Teen accounts can't send or receive money on Zemvii. Everything else about sharing your work is open to you.
        </Empty>
      )}
      {d && d.eligible && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="eyebrow">You earned</span>
              <strong className="stat-num num">{formatMoney(d.earnedCents)}</strong>
              <span className="muted small num">{formatMoney(d.earned30dCents)} in the last 30 days</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Supporters</span>
              <strong className="stat-num num">{d.supporters}</strong>
              <span className="muted small num">{formatMoney(d.monthlySupportCents)} a month to you</span>
            </div>
            <div className="stat">
              <span className="eyebrow">Zemvii's 10%</span>
              <strong className="stat-num num">{formatMoney(d.feesCents)}</strong>
              <span className="muted small">The only fee. You kept the other 90%.</span>
            </div>
          </div>

          <div className="info-note">
            <Megaphone size={18} />
            <span>
              <strong>Reach promise:</strong> every one of your {d.followers} followers sees your posts in their Friends feed. No boosting fees, no
              throttling. {d.newFollowers30d > 0 && `${d.newFollowers30d} new followers in the last 30 days.`}
            </span>
          </div>

          <section className="panel">
            <h2>Earning on Zemvii</h2>
            <Toggle id="cr-tips" label="Accept tips" help="A Tip button appears on your posts and profile." checked={me.settings.creator.tipsEnabled} onChange={(v) => save({ tipsEnabled: v })} />
            <Toggle id="cr-supporters" label="Supporter memberships" help="People pay you monthly and see your supporters-only posts." checked={me.settings.creator.supportersEnabled} onChange={(v) => save({ supportersEnabled: v })} />
            {me.settings.creator.supportersEnabled && (
              <div className="form-grid">
                <label className="field">
                  <span>Monthly price</span>
                  <select id="cr-price" className="select" value={price} onChange={(e) => setPrice(Number(e.target.value))}>
                    {[100, 200, 300, 400, 500, 800, 1000, 1500, 2000].map((c) => (
                      <option key={c} value={c}>
                        {formatMoney(c)} a month · you get {formatMoney(Math.round(c * 0.9))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>What supporters get</span>
                  <textarea id="cr-perks" className="textarea" maxLength={300} value={perks} onChange={(e) => setPerks(e.target.value)} placeholder="Behind-the-scenes posts, early access, a monthly Q&A…" />
                </label>
                <button className="btn btn-primary" onClick={() => save({ supportPriceCents: price, supportPerks: perks })}>
                  Save membership
                </button>
              </div>
            )}
          </section>

          {d.recentSupporters.length > 0 && (
            <section className="panel">
              <h2>
                <Star size={18} /> Your supporters
              </h2>
              <div className="avatar-cloud">
                {d.recentSupporters.map((u) => (
                  <Link key={u.id} to={`/u/${u.handle}`} className="chip">
                    <Avatar user={u} size={22} /> {u.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h2>Posts people valued most</h2>
            <p className="muted small">Ranked by saves, comments and tips, not by views.</p>
            {d.topPosts.length === 0 && <p className="muted">Post something and it will show up here.</p>}
            {d.topPosts.length > 0 && <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Post</th>
                    <th scope="col">Reactions</th>
                    <th scope="col">Comments</th>
                    <th scope="col">Saves</th>
                    <th scope="col">Tips</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topPosts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/p/${p.id}`}>{p.text ? (p.text.length > 50 ? `${p.text.slice(0, 50)}…` : p.text) : 'Photo'}</Link>
                      </td>
                      <td className="num">{p.reactions}</td>
                      <td className="num">{p.comments}</td>
                      <td className="num">{p.saves}</td>
                      <td className="num">{formatMoney(p.tipsCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </section>
        </>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = { tip: 'Tip', support: 'Membership', topup: 'Test credits', payout: 'Payout' };

export function WalletPage() {
  const me = useMe();
  const { meta, refresh } = useSession();
  const toast = useToast();
  const wallet = useApi<WalletView>('/wallet');
  const [busy, setBusy] = useState(false);
  const topUp = async (cents: number) => {
    setBusy(true);
    try {
      await api.post('/wallet/topup', { amountCents: cents });
      toast(`Added ${formatMoney(cents)} in test credits`);
      void wallet.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const plus = async (active: boolean) => {
    setBusy(true);
    try {
      await api.post('/plus', { active });
      toast(active ? 'Welcome to Zemvii+' : 'Zemvii+ cancelled');
      await refresh();
      void wallet.reload();
      invalidate('/feed');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  if (me.teen) {
    return <Empty icon={<Wallet size={26} />} title="Wallets start at 18">Teen accounts can't send or receive money on Zemvii.</Empty>;
  }
  return (
    <>
      <div className="page-head">
        <h1>Wallet</h1>
      </div>
      <div className="wallet-card">
        <span className="eyebrow">Balance</span>
        <strong className="wallet-balance num">{wallet.data ? formatMoney(wallet.data.balanceCents) : '…'}</strong>
        <span className="pill pill-ai">Test mode: no real money moves</span>
        {meta?.simulated && (
          <div className="row">
            {[500, 2000, 5000].map((c) => (
              <button key={c} className="btn btn-secondary btn-small" disabled={busy} onClick={() => topUp(c)}>
                + {formatMoney(c)}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="panel plus-card">
        <div className="row-between">
          <h2>
            <Sparkles size={18} /> Zemvii+
          </h2>
          <span className="num">{formatMoney(meta?.money.plusPrice ?? 499)} / month</span>
        </div>
        <ul className="plus-list">
          <li>No sponsored posts in Mix and Discover</li>
          <li>Longer clips and bigger uploads</li>
          <li>Extra themes and app icons</li>
          <li>Helps keep Zemvii free of tracking ads</li>
        </ul>
        <p className="muted small">Safety, privacy, data export and your reach are never behind a paywall.</p>
        {me.settings.plus ? (
          <button className="btn btn-secondary" disabled={busy} onClick={() => plus(false)}>
            Cancel Zemvii+
          </button>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => plus(true)}>
            Get Zemvii+
          </button>
        )}
      </section>

      <section className="section">
        <h2>History</h2>
        <ErrorNote error={wallet.error} />
        {wallet.data?.transactions.length === 0 && <p className="muted">No payments yet.</p>}
        <div className="panel panel-flush list">
          {wallet.data?.transactions.map((t) => (
            <div key={t.id} className="list-item">
              <span className={`tx-icon ${t.direction}`}>{t.direction === 'in' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
              <span className="grow">
                <strong>{KIND_LABEL[t.kind] ?? t.kind}</strong>
                {t.counterparty && <span className="muted"> {t.direction === 'in' ? 'from' : 'to'} {t.counterparty.name}</span>}
                {t.note && <span className="muted small"> · {t.note}</span>}
                <span className="muted small"> · {longAgo(t.createdAt)}</span>
              </span>
              <span className={`num tx-amount ${t.direction}`}>
                {t.direction === 'in' ? '+' : '−'}
                {formatMoney(t.direction === 'in' ? t.netCents : t.grossCents)}
                {t.direction === 'in' && t.feeCents > 0 && <span className="muted small"> (fee {formatMoney(t.feeCents)})</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
