import React, { useState, useMemo } from 'react';
import { useI18n, useAuth, useToast } from '../context/index.jsx';
import { api } from '../api/client.js';
import { Modal } from './index.jsx';
import { IcChat, IcPhone, IcX, IcPlus } from './Icons.jsx';
import { waLink, telLink, openExternal, buildPreorderMessage } from '../lib/contact.js';

/**
 * Pre-order composer: pick items & quantities, edit the message, then send it on
 * WhatsApp (wa.me deep link) or call the supplier. Each send is logged to the
 * supplier's pre-order history so you can mark it received later (which adds stock).
 */
export default function PreorderComposer({ supplier, items: initial, candidates = [], onClose, onLogged }) {
  const { t } = useI18n();
  const { business } = useAuth();
  const { push } = useToast();
  const [items, setItems] = useState(() => initial.map(i => ({ ...i, quantity: i.quantity ?? i.suggested_qty ?? 1 })));
  const [edited, setEdited] = useState(false);
  const [custom, setCustom] = useState('');
  const [addId, setAddId] = useState('');

  const auto = useMemo(() => buildPreorderMessage({ t, business: business?.name || '', supplier, items }), [t, business, supplier, items]);
  const text = edited ? custom : auto;

  const setQty = (idx, v) => setItems(list => list.map((x, i) => i === idx ? { ...x, quantity: Math.max(0, Number(v) || 0) } : x));
  const remove = idx => setItems(list => list.filter((_, i) => i !== idx));
  const available = candidates.filter(c => !items.some(i => i.product_id === c.id));
  const addProduct = () => {
    const p = candidates.find(c => c.id === addId); if (!p) return;
    setItems(list => [...list, { product_id: p.id, name: p.name, unit: p.unit, quantity: p.reorder_level ? p.reorder_level * 2 : 1 }]);
    setAddId('');
  };

  async function log(channel) {
    try {
      await api.post(`/suppliers/${supplier.id}/preorders`, {
        channel, message: channel === 'whatsapp' ? text : undefined,
        items: items.filter(i => i.quantity > 0).map(i => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      push(t('short_logged'), 'success'); onLogged && onLogged();
    } catch { /* offline: the message was still sent; history is best-effort */ }
  }
  const sendWhatsApp = () => {
    const link = waLink(supplier.whatsapp || supplier.phone, text);
    if (!link) return push(t('sup_need_phone'), 'error');
    openExternal(link); log('whatsapp');
  };
  const call = () => { const l = telLink(supplier.phone || supplier.whatsapp); if (l) { openExternal(l); log('call'); } };

  return (
    <Modal title={`${t('sup_preorder')} — ${supplier.name}`} onClose={onClose} width="560px">
      <div className="flex-col" style={{ gap: 14 }}>
        <div className="po-items">
          {items.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13, padding: 8 }}>—</div>}
          {items.map((it, idx) => (
            <div key={it.product_id || idx} className="po-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                {it.qty != null && <div style={{ fontSize: 11.5, color: it.qty <= 0 ? 'var(--danger)' : 'var(--warning)' }}>{t('short_left', { n: it.qty })}</div>}
              </div>
              <input className="input po-qty" type="number" min="0" inputMode="numeric" value={it.quantity} onChange={e => setQty(idx, e.target.value)} aria-label="Quantity"/>
              <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 34 }}>{it.unit || ''}</span>
              <button className="btn btn-icon btn-ghost" onClick={() => remove(idx)} aria-label="Remove"><IcX s={14}/></button>
            </div>
          ))}
        </div>
        {available.length > 0 && (
          <div className="flex gap-2">
            <select className="select" value={addId} onChange={e => setAddId(e.target.value)}>
              <option value="">+ {t('inv_name')}…</option>
              {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={addProduct} disabled={!addId}><IcPlus s={15}/></button>
          </div>
        )}
        <div className="field">
          <label>{t('short_msg_title')}</label>
          <textarea className="input" rows={7} value={text} onChange={e => { setEdited(true); setCustom(e.target.value); }} style={{ fontSize: 13.5, lineHeight: 1.5 }}/>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{t('short_msg_hint')}</div>
        </div>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-wa" style={{ flex: 2, minWidth: 180 }} onClick={sendWhatsApp} disabled={!items.some(i => i.quantity > 0)}><IcChat s={17}/> {t('short_send_wa')}</button>
          <button className="btn btn-secondary" style={{ flex: 1, minWidth: 110 }} onClick={call}><IcPhone s={16}/> {t('sup_call')}</button>
        </div>
      </div>
    </Modal>
  );
}
