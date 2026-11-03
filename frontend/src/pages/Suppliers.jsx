import React, { useEffect, useState, useCallback } from 'react';
import { useI18n, useAuth, useToast } from '../context/index.jsx';
import { api } from '../api/client.js';
import { cachedGet } from '../lib/cache.js';
import { LoadingBlock, PageHeader, EmptyState, Modal, ConfirmDialog, CsvImportModal, fmtD, Spinner } from '../components/index.jsx';
import { IcPlus, IcPhone, IcChat, IcSearch, IcEdit, IcTrash, IcUpload, IcDownload } from '../components/Icons.jsx';
import PreorderComposer from '../components/Preorder.jsx';
import { telLink, waLink, openExternal } from '../lib/contact.js';

const EMPTY = { name: '', contact_person: '', phone: '', whatsapp: '', email: '', address: '', products_note: '', payment_terms: '', lead_time_days: '', notes: '' };

function SupplierForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [f, setF] = useState({ ...EMPTY, ...Object.fromEntries(Object.entries(initial || {}).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) });
  const [saving, setSaving] = useState(false);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.phone.trim() && !f.whatsapp.trim()) return push(t('sup_need_phone'), 'error');
    setSaving(true);
    const body = { ...f, lead_time_days: f.lead_time_days === '' ? null : Number(f.lead_time_days) };
    try {
      const d = initial?.id ? await api.patch(`/suppliers/${initial.id}`, body) : await api.post('/suppliers', body);
      onSaved(d.supplier);
    } catch (ex) { push(ex.message, 'error'); } finally { setSaving(false); }
  }
  return (
    <Modal title={initial?.id ? t('sup_edit') : t('sup_add')} onClose={onClose} width="560px">
      <form onSubmit={submit} className="flex-col" style={{ gap: 14 }}>
        <div className="field"><label>{t('sup_name')} *</label><input className="input" required value={f.name} onChange={set('name')} autoFocus/></div>
        <div className="field"><label>{t('sup_contact')}</label><input className="input" value={f.contact_person} onChange={set('contact_person')}/></div>
        <div className="g-grid g2" style={{ gap: 12 }}>
          <div className="field"><label>{t('sup_phone')} *</label><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="08012345678"/></div>
          <div className="field"><label>{t('sup_whatsapp')}</label><input className="input" type="tel" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} placeholder="+2348012345678"/></div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: -8 }}>{t('sup_whatsapp_hint')}</div>
        <div className="field"><label>{t('sup_supplies')}</label><input className="input" value={f.products_note} onChange={set('products_note')}/></div>
        <div className="g-grid g2" style={{ gap: 12 }}>
          <div className="field"><label>{t('sup_terms')}</label><input className="input" value={f.payment_terms} onChange={set('payment_terms')}/></div>
          <div className="field"><label>{t('sup_lead')}</label><input className="input" type="number" min="0" value={f.lead_time_days} onChange={set('lead_time_days')}/></div>
        </div>
        <div className="field"><label>{t('sup_address')}</label><input className="input" value={f.address} onChange={set('address')}/></div>
        <div className="field"><label>{t('sup_email')}</label><input className="input" type="email" value={f.email} onChange={set('email')}/></div>
        <div className="field"><label>{t('sup_notes')}</label><textarea className="input" rows={2} value={f.notes} onChange={set('notes')}/></div>
        <div className="flex gap-3 justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? <Spinner/> : t('sup_save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function SupplierDetail({ id, onClose, onChanged, onEdit, canManage }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [d, setD] = useState(null);
  const [compose, setCompose] = useState(null);
  const load = useCallback(() => api.get(`/suppliers/${id}`).then(setD).catch(e => push(e.message, 'error')), [id, push]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(po, status) { try { await api.patch(`/preorders/${po.id}`, { status }); load(); } catch (e) { push(e.message, 'error'); } }
  async function receive(po) {
    if (!confirm(t('po_receive_confirm'))) return;
    try { await api.post(`/preorders/${po.id}/receive`, {}); push(t('po_received_ok'), 'success'); load(); onChanged(); } catch (e) { push(e.message, 'error'); }
  }

  if (!d) return <Modal title="…" onClose={onClose}><LoadingBlock/></Modal>;
  const s = d.supplier;
  return (
    <Modal title={s.name} onClose={onClose} width="600px">
      <div className="flex-col" style={{ gap: 16 }}>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-wa" style={{ flex: 1, minWidth: 140 }} onClick={() => setCompose({ items: d.shortages.map(i => ({ product_id: i.id, name: i.name, unit: i.unit, qty: i.qty, quantity: i.suggested_qty })) })}>
            <IcChat s={17}/> {t('sup_preorder')}
          </button>
          <a className="btn btn-primary" style={{ flex: 1, minWidth: 120 }} href={telLink(s.phone || s.whatsapp)}><IcPhone s={16}/> {t('sup_call')}</a>
          <a className="btn btn-secondary" href={waLink(s.whatsapp || s.phone)} target="_blank" rel="noopener noreferrer"><IcChat s={16}/> {t('sup_chat')}</a>
        </div>

        <div className="kv-list">
          {[[t('sup_contact'), s.contact_person], [t('sup_phone'), s.phone], [t('sup_whatsapp'), s.whatsapp], [t('sup_email'), s.email], [t('sup_address'), s.address],
            [t('sup_supplies'), s.products_note], [t('sup_terms'), s.payment_terms], [t('sup_lead'), s.lead_time_days != null ? `${s.lead_time_days}` : ''], [t('sup_notes'), s.notes]]
            .filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{k}</span><strong>{v}</strong></div>)}
        </div>

        {d.shortages.length > 0 && (
          <div>
            <div className="sec-title">⚠️ {t('sup_shortage_n', { n: d.shortages.length })}</div>
            {d.shortages.map(i => <div key={i.id} className="mini-row"><span>{i.name}</span><span style={{ color: i.qty <= 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>{t('short_left', { n: i.qty })}</span></div>)}
          </div>
        )}

        <div>
          <div className="sec-title">{t('sup_products')} ({d.products.length})</div>
          {d.products.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('sup_no_products')}</div>
            : d.products.map(p => <div key={p.id} className="mini-row"><span>{p.name}</span><span style={{ color: 'var(--text-3)' }}>{p.qty} {p.unit}</span></div>)}
        </div>

        <div>
          <div className="sec-title">{t('sup_history')}</div>
          {d.preorders.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>—</div> : d.preorders.map(po => (
            <div key={po.id} className="po-hist">
              <div className="flex justify-between items-center" style={{ gap: 8 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{fmtD(po.created_at)} · {po.channel === 'call' ? '📞' : '💬'}</div>
                <span className={`badge ${po.status === 'received' ? 'badge-green' : po.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>{t(`po_${po.status}`)}</span>
              </div>
              <div style={{ fontSize: 13, margin: '4px 0' }}>{(po.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ') || '—'}</div>
              {canManage && po.status !== 'received' && po.status !== 'cancelled' && (
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {po.status === 'sent' && <button className="btn btn-secondary btn-sm" onClick={() => setStatus(po, 'confirmed')}>{t('po_confirmed')}</button>}
                  <button className="btn btn-primary btn-sm" onClick={() => receive(po)}>{t('po_receive')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStatus(po, 'cancelled')}>{t('po_cancelled')}</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {canManage && <div className="flex gap-3 justify-end"><button className="btn btn-secondary" onClick={() => onEdit(s)}><IcEdit s={15}/> {t('edit')}</button></div>}
      </div>
      {compose && <PreorderComposer supplier={s} items={compose.items} candidates={d.products} onClose={() => setCompose(null)} onLogged={load}/>}
    </Modal>
  );
}

export default function Suppliers() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const canManage = ['owner', 'manager'].includes(user?.role);
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [form, setForm] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [del, setDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try { const r = await cachedGet(api, '/suppliers'); setList(r.data.suppliers); setStale(r.stale); }
    catch (e) { push(e.message, 'error'); } finally { setLoading(false); }
  }, [push]);
  useEffect(() => { load(); }, [load]);

  const shown = list.filter(s => !q || [s.name, s.contact_person, s.phone, s.products_note].some(v => (v || '').toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <PageHeader title={t('sup_title')} subtitle={t('sup_sub')}>
        {canManage && <>
          <button className="btn btn-secondary btn-sm" onClick={() => setImportOpen(true)}><IcUpload s={14}/> {t('import_csv')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => api.download('/suppliers/export', 'suppliers.csv')}><IcDownload s={14}/> {t('export_csv')}</button>
          <button className="btn btn-primary" onClick={() => setForm({})}><IcPlus s={16}/> {t('sup_add')}</button>
        </>}
      </PageHeader>
      {stale && <div className="stale-note">📴 Offline — showing last saved data</div>}

      <div className="input-wrap mb-4">
        <span className="input-icon"><IcSearch s={16}/></span>
        <input className="input" placeholder={t('sup_search')} value={q} onChange={e => setQ(e.target.value)}/>
      </div>

      {loading ? <LoadingBlock/> : shown.length === 0 ? (
        <div className="card"><EmptyState icon="🚚" message={t('sup_empty')} action={canManage && <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setForm({})}><IcPlus s={16}/> {t('sup_add')}</button>}/></div>
      ) : (
        <div className="supplier-grid">
          {shown.map(s => (
            <div key={s.id} className="card supplier-card">
              <div className="sc-main" onClick={() => setDetailId(s.id)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setDetailId(s.id)}>
                <div className="sc-avatar">{s.name[0]?.toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="sc-name">{s.name}</div>
                  <div className="sc-sub">{[s.contact_person, s.phone || s.whatsapp].filter(Boolean).join(' · ') || '—'}</div>
                  {s.products_note && <div className="sc-sub" style={{ marginTop: 2 }}>{s.products_note}</div>}
                  <div className="flex gap-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-gray">{s.product_count} {t('nav_inventory').toLowerCase()}</span>
                    {s.shortage_count > 0 && <span className="badge badge-yellow">⚠️ {t('sup_shortage_n', { n: s.shortage_count })}</span>}
                  </div>
                </div>
              </div>
              <div className="sc-actions">
                <a className="btn btn-primary" href={telLink(s.phone || s.whatsapp)}><IcPhone s={16}/> {t('sup_call')}</a>
                <a className="btn btn-wa" href={waLink(s.whatsapp || s.phone)} target="_blank" rel="noopener noreferrer"><IcChat s={16}/> {t('sup_chat')}</a>
                {canManage && <button className="btn btn-ghost btn-icon" aria-label={t('delete')} onClick={() => setDel(s)}><IcTrash s={15}/></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && <SupplierForm initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }}/>}
      {detailId && <SupplierDetail id={detailId} canManage={canManage} onClose={() => setDetailId(null)} onChanged={load} onEdit={s => { setDetailId(null); setForm(s); }}/>}
      {del && <ConfirmDialog title={t('delete')} message={t('sup_delete_confirm')} onCancel={() => setDel(null)}
        onConfirm={async () => { try { await api.delete(`/suppliers/${del.id}`); setDel(null); load(); } catch (e) { push(e.message, 'error'); } }}/>}
      {importOpen && <Modal title={t('import_csv')} onClose={() => setImportOpen(false)} width="560px"><CsvImportModal module="suppliers" t={t} onClose={() => setImportOpen(false)} onDone={load}/></Modal>}
    </div>
  );
}
