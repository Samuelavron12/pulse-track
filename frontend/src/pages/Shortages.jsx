import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/index.jsx';
import { api } from '../api/client.js';
import { cachedGet } from '../lib/cache.js';
import { LoadingBlock, PageHeader, EmptyState, StatCard, fmt } from '../components/index.jsx';
import { IcChat, IcPhone, IcWarn, IcBox } from '../components/Icons.jsx';
import PreorderComposer from '../components/Preorder.jsx';
import { telLink, openExternal } from '../lib/contact.js';

export default function Shortages() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(null); // { supplier, items }

  const load = useCallback(async () => {
    try { const r = await cachedGet(api, '/shortages'); setData(r.data); setStale(r.stale); }
    catch { /* keep previous */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingBlock/>;
  if (!data) return <EmptyState icon="📡" message="Could not load shortages."/>;
  const { summary, suppliers, unassigned } = data;

  return (
    <div>
      <PageHeader title={t('short_title')} subtitle={t('short_sub')}/>
      {stale && <div className="stale-note">📴 Offline — showing last saved data</div>}

      <div className="g-grid g3 mb-6">
        <StatCard label={t('short_out')} value={summary.out} color={summary.out ? 'var(--danger)' : undefined} icon={<IcWarn s={18}/>}/>
        <StatCard label={t('short_low')} value={summary.low} color={summary.low ? 'var(--warning)' : undefined} icon={<IcBox s={18}/>}/>
        <StatCard label={t('short_est')} value={fmt(summary.estCost)} sub={t('short_total_items', { n: summary.total })}/>
      </div>

      {summary.total === 0 && <div className="card"><EmptyState icon="✅" message={t('short_all_ok')}/></div>}

      {suppliers.map(g => (
        <div key={g.id} className="card mb-4 shortage-group">
          <div className="sg-head">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 16 }}>{g.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{[g.contact_person, g.phone || g.whatsapp].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-wa" onClick={() => setCompose({ supplier: g, items: g.items.map(i => ({ product_id: i.id, name: i.name, unit: i.unit, qty: i.qty, quantity: i.suggested_qty })) })}>
                <IcChat s={16}/> {t('sup_preorder')}
              </button>
              <button className="btn btn-secondary btn-icon" aria-label={t('sup_call')} onClick={() => openExternal(telLink(g.phone || g.whatsapp))}><IcPhone s={16}/></button>
            </div>
          </div>
          {g.items.map(i => <ShortRow key={i.id} i={i} t={t}/>)}
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="card mb-4 shortage-group">
          <div className="sg-head">
            <div>
              <div style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 16 }}>{t('short_no_supplier')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('short_assign')}</div>
            </div>
            <button className="btn btn-secondary" onClick={() => nav('/inventory')}>{t('nav_inventory')}</button>
          </div>
          {unassigned.map(i => <ShortRow key={i.id} i={i} t={t}/>)}
        </div>
      )}

      {compose && <PreorderComposer supplier={compose.supplier} items={compose.items} onClose={() => setCompose(null)} onLogged={() => {}}/>}
    </div>
  );
}

function ShortRow({ i, t }) {
  const out = i.severity === 'out';
  return (
    <div className="short-row">
      <span className={`sev-dot ${out ? 'out' : 'low'}`}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {out ? t('short_out') : t('short_left', { n: i.qty })} · min {i.reorder_level}{i.days_left != null && !out ? ` · ${t('short_days_left', { n: i.days_left })}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t('short_suggest')} {i.suggested_qty}</div>
        {i.est_cost > 0 && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fmt(i.est_cost)}</div>}
      </div>
    </div>
  );
}
