import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, useToast } from '../context/index.jsx';
import { api } from '../api/client.js';
import {
  PageHeader, LoadingBlock, EmptyState, Modal, ConfirmDialog,
  CsvImportModal, StatCard,
  fmt, fmtD, fmtDT,
} from '../components/index.jsx';
import { IcPlus, IcEdit, IcTrash, IcSearch, IcDownload, IcUpload, IcCheck } from '../components/Icons.jsx';

// ── Shared field helpers ──────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div className="field">{label && <label>{label}</label>}{children}</div>
);
const Row2 = ({ children }) => <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>{children}</div>;
const PAY_OPTS = ['cash','transfer','pos','ussd','opay','moniepoint','credit','other'];
const PAY_BADGE = { cash:'badge-green', transfer:'badge-blue', pos:'badge-blue', ussd:'badge-gray', opay:'badge-purple', moniepoint:'badge-purple', credit:'badge-yellow', other:'badge-gray' };
const daysAgo = s => s ? Math.floor((Date.now()-new Date(s))/86400000) : null;

// ══════════════════════════════════════════════════════════════════════════
// SALES
// ══════════════════════════════════════════════════════════════════════════
export function Sales() {
  const { t } = useI18n(); const { push } = useToast();
  const [sales, setSales] = useState([]); const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(new Date(Date.now()-30*864e5).toISOString().slice(0,10));
  const [to,   setTo]   = useState(new Date().toISOString().slice(0,10));
  const [importModal, setImportModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/sales?from=${from}T00:00:00Z&to=${to}T23:59:59Z&limit=300`).then(d=>setSales(d.sales)).catch(()=>{}).finally(()=>setLoading(false));
  }, [from, to]);

  useEffect(()=>load(),[load]);

  const totalRev    = sales.reduce((s,x)=>s+Number(x.total_amount),0);
  const totalProfit = sales.reduce((s,x)=>s+Number(x.profit),0);

  return (
    <div>
      <PageHeader title={t('nav_sales')}>
        <button className="btn btn-secondary btn-sm" onClick={()=>api.download(`/sales/export?from=${from}&to=${to}`,`sales-${from}-to-${to}.csv`)}><IcDownload s={14}/> {t('export_csv')}</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setImportModal(true)}><IcUpload s={14}/> {t('import_csv')}</button>
      </PageHeader>

      {/* Date range */}
      <div className="card card-p mb-6 flex gap-3 items-center" style={{flexWrap:'wrap'}}>
        <div className="field" style={{margin:0}}><label>{t('reports_from')}</label><input className="input" type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{width:'auto'}}/></div>
        <div className="field" style={{margin:0}}><label>{t('reports_to')}</label><input className="input" type="date" value={to}   onChange={e=>setTo(e.target.value)}   style={{width:'auto'}}/></div>
        <button className="btn btn-primary btn-sm" style={{marginTop:20}} onClick={load}>Apply</button>
      </div>

      {/* Totals */}
      <div className="g-grid g2 mb-6" style={{gap:14}}>
        <div className="card stat-card"><div className="stat-label">Total Revenue</div><div className="stat-value" style={{color:'var(--brand)'}}>{fmt(totalRev)}</div><div className="stat-sub">{sales.length} transactions</div></div>
        <div className="card stat-card"><div className="stat-label">Gross Profit</div><div className="stat-value" style={{color:totalProfit>=0?'var(--brand)':'var(--danger)'}}>{fmt(totalProfit)}</div><div className="stat-sub">Margin {totalRev>0?Math.round(totalProfit/totalRev*100):0}%</div></div>
      </div>

      <div className="card">
        {loading ? <LoadingBlock/> : sales.length===0 ? <EmptyState icon="🛒" message={t('sales_empty')}/> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('sales_date')}</th><th>{t('sales_customer')}</th><th>Branch</th><th>{t('sales_payment')}</th><th style={{textAlign:'right'}}>{t('sales_amount')}</th><th style={{textAlign:'right'}}>Profit</th></tr></thead>
              <tbody>
                {sales.map(s=>(
                  <tr key={s.id}>
                    <td style={{color:'var(--text-2)',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtDT(s.created_at)}</td>
                    <td>{s.cname||<span style={{color:'var(--text-3)'}}>Walk-in</span>}</td>
                    <td style={{color:'var(--text-2)',fontSize:12.5}}>{s.bname||'—'}</td>
                    <td><span className={`badge ${PAY_BADGE[s.payment_method]||'badge-gray'}`}>{s.payment_method}</span></td>
                    <td style={{textAlign:'right',fontWeight:700}}>{fmt(s.total_amount)}</td>
                    <td style={{textAlign:'right',fontWeight:600,color:Number(s.profit)>=0?'var(--brand)':'var(--danger)'}}>{fmt(s.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importModal && <Modal title={t('import_csv')} onClose={()=>setImportModal(false)} width="560px"><CsvImportModal module="sales" onClose={()=>setImportModal(false)} onDone={()=>{load();push('Import done!');}} t={t}/></Modal>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════════════════════════════════════
function ProductForm({ initial, categories, suppliers=[], onSave, onClose, t }) {
  const blank = { name:'', sku:'', barcode:'', category_id:'', supplier_id:'', cost_price:'', selling_price:'', quantity:'', reorder_level:5, reorder_qty:'', unit:'unit', is_service:false };
  const [form, setForm] = useState(initial ? { ...blank, ...Object.fromEntries(Object.entries(initial).filter(([k])=>k in blank).map(([k,v])=>[k, v ?? ''])) } : blank);
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  const set = k => e => setForm(f=>({...f, [k]: e.target.type==='checkbox'?e.target.checked:e.target.value}));

  async function submit(e) {
    e.preventDefault(); setErr(''); setSaving(true);
    const payload = {
      name: form.name, sku: form.sku || null, barcode: form.barcode || null,
      category_id: form.category_id || null, supplier_id: form.supplier_id || null,
      cost_price: Number(form.cost_price) || 0, selling_price: Number(form.selling_price) || 0,
      reorder_level: Math.round(Number(form.reorder_level) || 0),
      reorder_qty: form.reorder_qty === '' ? null : Math.round(Number(form.reorder_qty)),
      unit: form.unit, is_service: !!form.is_service,
    };
    if (!initial && form.quantity !== '') payload.quantity = Number(form.quantity);   // opening stock only when adding
    try { await onSave(payload); onClose(); }
    catch(ex) { setErr(ex.message); } finally { setSaving(false); }
  }
  const margin = form.selling_price>0 ? Math.round((form.selling_price-form.cost_price)/form.selling_price*100) : 0;

  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      <Field label={t('inv_name')}><input className="input" required value={form.name} onChange={set('name')}/></Field>
      <Row2>
        <Field label={t('inv_sku')}><input className="input" value={form.sku} onChange={set('sku')}/></Field>
        <Field label={t('inv_barcode')}><input className="input" value={form.barcode} onChange={set('barcode')}/></Field>
      </Row2>
      <Field label={t('inv_category')}>
        <select className="select" value={form.category_id} onChange={set('category_id')}>
          <option value="">— No category —</option>
          {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Row2>
        <Field label={t('inv_cost')}><input className="input" type="number" min="0" required value={form.cost_price} onChange={set('cost_price')}/></Field>
        <Field label={t('inv_price')}><input className="input" type="number" min="0" required value={form.selling_price} onChange={set('selling_price')}/></Field>
      </Row2>
      {form.selling_price>0 && <div style={{fontSize:12.5,color:margin>=30?'var(--brand)':margin>=15?'var(--warning)':'var(--danger)',fontWeight:600}}>Margin: {margin}%</div>}
      <Field label={t('nav_suppliers')}>
        <select className="select" value={form.supplier_id} onChange={set('supplier_id')}>
          <option value="">— {t('short_no_supplier')} —</option>
          {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Row2>
        {!initial && <Field label={t('inv_qty')}><input className="input" type="number" min="0" inputMode="decimal" value={form.quantity} onChange={set('quantity')}/></Field>}
        <Field label={t('inv_reorder')}><input className="input" type="number" min="0" value={form.reorder_level} onChange={set('reorder_level')}/></Field>
        <Field label="Usual order qty"><input className="input" type="number" min="0" value={form.reorder_qty} onChange={set('reorder_qty')} placeholder="auto"/></Field>
      </Row2>
      <Row2>
        <Field label={t('inv_unit')}>
          <select className="select" value={form.unit} onChange={set('unit')}>
            {['unit','kg','litre','pack','carton','bag','pair','set','box','dozen','metre','yard'].map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <label style={{display:'flex',alignItems:'center',gap:8,marginTop:8,cursor:'pointer'}}>
            <input type="checkbox" checked={form.is_service} onChange={set('is_service')}/> {t('inv_service')}
          </label>
        </Field>
      </Row2>
      {err && <div style={{color:'var(--danger)',fontSize:13,background:'var(--danger-pale)',padding:'8px 12px',borderRadius:'var(--r-sm)'}}>{err}</div>}
      <div className="flex gap-3 justify-end mt-3">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':t('inv_save')}</button>
      </div>
    </form>
  );
}

function AdjustModal({ product, branches, onClose, onDone, t }) {
  const [branchId, setBranchId] = useState(branches[0]?.id||'');
  const [qty, setQty] = useState('');
  const [type, setType] = useState('adjustment');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(e) {
    e.preventDefault(); setSaving(true);
    try { await api.post(`/products/${product.id}/adjust`,{quantity:Number(qty),branch_id:branchId,type,reason}); onDone(); onClose(); }
    catch(ex) { alert(ex.message); setSaving(false); }
  }
  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:'var(--bg-alt)',borderRadius:'var(--r-sm)',padding:'10px 14px',fontSize:13.5}}>Adjusting stock for: <strong>{product.name}</strong></div>
      <Field label="Branch"><select className="select" value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label="Adjustment type">
        <select className="select" value={type} onChange={e=>setType(e.target.value)}>
          {['adjustment','opening','purchase','return','damage','transfer_in','transfer_out'].map(tp=><option key={tp} value={tp}>{tp.replace('_',' ')}</option>)}
        </select>
      </Field>
      <Field label="Quantity (use negative to reduce e.g. -5)"><input className="input" type="number" required value={qty} onChange={e=>setQty(e.target.value)} placeholder="e.g. 20 or -5"/></Field>
      <Field label="Reason / notes"><input className="input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Optional"/></Field>
      <div className="flex gap-3 justify-end">
        <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'Adjust Stock'}</button>
      </div>
    </form>
  );
}

export function Inventory() {
  const { t } = useI18n(); const { push } = useToast(); const nav = useNavigate();
  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [branches,   setBranches]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [modal,    setModal]        = useState(null); // null | 'add' | product
  const [adjusting, setAdjusting]  = useState(null);
  const [deleting,  setDeleting]   = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  const load = useCallback(()=>{
    setLoading(true);
    const q = new URLSearchParams();
    if (search) q.set('q', search);
    if (catFilter) q.set('category_id', catFilter);
    Promise.all([api.get(`/products?${q}`), api.get('/categories'), api.get('/branches'), api.get('/suppliers')])
      .then(([p,c,b,sp])=>{ setProducts(p.products); setCategories(c.categories); setBranches(b.branches); setSuppliers(sp.suppliers); })
      .catch(()=>{}).finally(()=>setLoading(false));
  }, [search, catFilter]);

  useEffect(()=>load(),[load]);

  async function handleSave(payload) {
    if (modal==='add') { await api.post('/products',payload); push('Product added.'); }
    else { await api.patch(`/products/${modal.id}`,payload); push('Updated.'); }
    load();
  }

  const margin = p => p.selling_price>0 ? Math.round((p.selling_price-p.cost_price)/p.selling_price*100) : 0;
  const lowCount = products.filter(p=>!p.is_service && p.total_qty<=p.reorder_level).length;

  return (
    <div>
      <PageHeader title={t('inv_title')}>
        <button className="btn btn-secondary btn-sm" onClick={()=>api.download('/products/export',`products.csv`)}><IcDownload s={14}/> {t('export_csv')}</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setImportModal(true)}><IcUpload s={14}/> {t('import_csv')}</button>
        <button className="btn btn-primary" onClick={()=>setModal('add')}><IcPlus s={16}/> {t('inv_new')}</button>
      </PageHeader>

      {lowCount>0 && (
        <div style={{background:'var(--warning-pale)',border:'1px solid rgba(245,158,11,.3)',borderRadius:'var(--r-md)',padding:'12px 16px',marginBottom:20,fontSize:13.5,color:'var(--warning)',fontWeight:600}}>
          ⚠ {lowCount} product{lowCount!==1?'s are':' is'} at or below reorder level.
          <a href="/shortages" onClick={e=>{e.preventDefault(); nav('/shortages');}} style={{marginLeft:10,textDecoration:'underline'}}>{t('nav_shortages')} →</a>
        </div>
      )}

      <div className="card">
        {/* Filters */}
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap'}}>
          <div className="input-wrap" style={{flex:1,minWidth:200}}>
            <span className="input-icon"><IcSearch s={16}/></span>
            <input className="input" placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select className="select" value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{maxWidth:180}}>
            <option value="">All categories</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {loading ? <LoadingBlock/> : products.length===0 ? (
          <EmptyState icon="📦" title="No products yet" message={t('inv_empty')} action={<button className="btn btn-primary" onClick={()=>setModal('add')}><IcPlus s={15}/> {t('inv_new')}</button>}/>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Category</th><th style={{textAlign:'right'}}>Cost</th><th style={{textAlign:'right'}}>Price</th><th style={{textAlign:'right'}}>Margin</th><th style={{textAlign:'right'}}>In Stock</th><th></th></tr></thead>
              <tbody>
                {products.map(p=>{
                  const low = !p.is_service && p.total_qty<=p.reorder_level;
                  return (
                    <tr key={p.id} style={low?{background:'rgba(245,158,11,.04)'}:undefined}>
                      <td>
                        <div style={{fontWeight:600}}>{p.name}</div>
                        {(p.sku||p.barcode)&&<div style={{fontSize:11.5,color:'var(--text-3)'}}>{p.sku}{p.barcode?` · ${p.barcode}`:''}</div>}
                        {p.is_service && <span style={{fontSize:11,background:'var(--accent-pale)',color:'var(--accent)',padding:'1px 6px',borderRadius:'var(--r-full)',fontWeight:600}}>SERVICE</span>}
                      </td>
                      <td><span style={{fontSize:12.5,color:'var(--text-2)'}}>{p.cat_name||'—'}</span></td>
                      <td style={{textAlign:'right'}}>{fmt(p.cost_price)}</td>
                      <td style={{textAlign:'right',fontWeight:600}}>{fmt(p.selling_price)}</td>
                      <td style={{textAlign:'right'}}><span className={`badge ${margin(p)>=30?'badge-green':margin(p)>=15?'badge-blue':'badge-yellow'}`}>{margin(p)}%</span></td>
                      <td style={{textAlign:'right'}}>
                        <div className="flex gap-2 items-center justify-end">
                          {p.is_service ? <span style={{color:'var(--text-3)'}}>—</span> : <span style={{fontWeight:700}}>{p.total_qty} {p.unit}</span>}
                          {low && <span className="badge badge-yellow">{t('inv_low_badge')}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          {!p.is_service && <button className="btn btn-icon btn-ghost" title="Adjust stock" onClick={()=>setAdjusting(p)}>⚖️</button>}
                          <button className="btn btn-icon btn-ghost" onClick={()=>setModal(p)}><IcEdit/></button>
                          <button className="btn btn-icon btn-ghost" style={{color:'var(--danger)'}} onClick={()=>setDeleting(p)}><IcTrash/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <Modal title={modal==='add'?t('inv_new'):t('edit')} onClose={()=>setModal(null)} width="540px"><ProductForm initial={modal!=='add'?modal:null} categories={categories} suppliers={suppliers} onSave={handleSave} onClose={()=>setModal(null)} t={t}/></Modal>}
      {adjusting && <Modal title={t('inv_adjust')} onClose={()=>setAdjusting(null)} width="440px"><AdjustModal product={adjusting} branches={branches} onClose={()=>setAdjusting(null)} onDone={load} t={t}/></Modal>}
      {importModal && <Modal title={t('import_csv')} onClose={()=>setImportModal(false)} width="560px"><CsvImportModal module="products" onClose={()=>setImportModal(false)} onDone={()=>{load();push('Import done!');}} t={t}/></Modal>}
      {deleting && <ConfirmDialog message={`Delete "${deleting.name}"? This cannot be undone.`} onConfirm={async()=>{ await api.delete(`/products/${deleting.id}`); setProducts(p=>p.filter(x=>x.id!==deleting.id)); setDeleting(null); push('Deleted.'); }} onCancel={()=>setDeleting(null)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ══════════════════════════════════════════════════════════════════════════
function CustomerForm({ initial, onSave, onClose, t }) {
  const [form, setForm] = useState(initial||{name:'',phone:'',email:'',address:'',customer_type:'retail',notes:''});
  const [saving,setSaving]=useState(false); const [err,setErr]=useState('');
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  async function submit(e){ e.preventDefault();setErr('');setSaving(true);try{await onSave(form);onClose();}catch(ex){setErr(ex.message);}finally{setSaving(false);} }
  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      <Field label={t('cust_name')}><input className="input" required value={form.name} onChange={set('name')}/></Field>
      <Row2>
        <Field label={t('cust_phone')}><input className="input" type="tel" value={form.phone} onChange={set('phone')}/></Field>
        <Field label={t('cust_email')}><input className="input" type="email" value={form.email} onChange={set('email')}/></Field>
      </Row2>
      <Field label={t('cust_address')}><input className="input" value={form.address} onChange={set('address')}/></Field>
      <Field label={t('cust_type')}>
        <select className="select" value={form.customer_type} onChange={set('customer_type')}>
          {['retail','wholesale','vip'].map(tp=><option key={tp} value={tp} style={{textTransform:'capitalize'}}>{tp.charAt(0).toUpperCase()+tp.slice(1)}</option>)}
        </select>
      </Field>
      <Field label={t('cust_notes')}><textarea className="input" rows={2} value={form.notes} onChange={set('notes')}/></Field>
      {err && <div style={{color:'var(--danger)',fontSize:13}}>{err}</div>}
      <div className="flex gap-3 justify-end"><button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':t('cust_save')}</button></div>
    </form>
  );
}

function CustomerDetailModal({ customer, onClose, t }) {
  const [detail, setDetail] = useState(null);
  useEffect(()=>{ api.get(`/customers/${customer.id}`).then(setDetail).catch(()=>{}); },[customer.id]);
  const days = daysAgo(customer.last_purchase_at);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:'var(--bg-alt)',borderRadius:'var(--r-md)',padding:'14px 16px'}}>
        <div style={{fontWeight:700,fontSize:18,marginBottom:10}}>{customer.name}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:13.5,color:'var(--text-2)'}}>
          {customer.phone && <div>📞 {customer.phone}</div>}
          {customer.email && <div>✉ {customer.email}</div>}
          {customer.address && <div style={{gridColumn:'1/-1'}}>📍 {customer.address}</div>}
          <div>💰 Total spent: <strong style={{color:'var(--brand)'}}>{fmt(customer.total_spent)}</strong></div>
          <div>🛒 Purchases: <strong>{customer.purchase_count}</strong></div>
          {customer.outstanding_credit>0 && <div style={{color:'var(--danger)',gridColumn:'1/-1'}}>💳 Credit owed: <strong>{fmt(customer.outstanding_credit)}</strong></div>}
          <div>🕐 Last purchase: <strong style={{color:days>30?'var(--warning)':'var(--text)'}}>{days!==null?`${days} days ago`:'Never'}</strong></div>
        </div>
      </div>
      <div>
        <div style={{fontWeight:700,fontSize:13.5,marginBottom:10,color:'var(--text-2)'}}>Purchase History</div>
        {!detail ? <LoadingBlock/> : detail.purchaseHistory.length===0 ? <p style={{color:'var(--text-3)',fontSize:13}}>No purchases yet.</p> : (
          <div style={{maxHeight:240,overflowY:'auto'}}>
            {detail.purchaseHistory.map(s=>(
              <div key={s.id} className="flex justify-between items-center" style={{padding:'9px 0',borderBottom:'1px solid var(--border)',fontSize:13.5}}>
                <div><span style={{color:'var(--text-2)'}}>{fmtD(s.created_at)}</span><span className={`badge ${PAY_BADGE[s.payment_method]||'badge-gray'}`} style={{marginLeft:8}}>{s.payment_method}</span></div>
                <span style={{fontWeight:700}}>{fmt(s.total_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-secondary" onClick={onClose}>{t('close')}</button>
    </div>
  );
}

export function Customers() {
  const { t } = useI18n(); const { push } = useToast();
  const [customers,setCustomers]=useState([]); const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState(''); const [modal,setModal]=useState(null);
  const [detail,setDetail]=useState(null); const [deleting,setDeleting]=useState(null);
  const [importModal,setImportModal]=useState(false);

  const load=useCallback(()=>{ setLoading(true); api.get(`/customers${search?`?q=${encodeURIComponent(search)}`:''}`) .then(d=>setCustomers(d.customers)).catch(()=>{}).finally(()=>setLoading(false)); },[search]);
  useEffect(()=>load(),[load]);

  async function handleSave(payload) {
    if(modal==='add'){ const d=await api.post('/customers',payload); setCustomers(c=>[d.customer,...c]); push('Customer added.'); }
    else { const d=await api.patch(`/customers/${modal.id}`,payload); setCustomers(c=>c.map(x=>x.id===d.customer.id?d.customer:x)); push('Updated.'); }
  }

  const TYPE_BADGE = { retail:'badge-gray', wholesale:'badge-blue', vip:'badge-yellow' };

  return (
    <div>
      <PageHeader title={t('cust_title')}>
        <button className="btn btn-secondary btn-sm" onClick={()=>api.download('/customers/export','customers.csv')}><IcDownload s={14}/> {t('export_csv')}</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setImportModal(true)}><IcUpload s={14}/> {t('import_csv')}</button>
        <button className="btn btn-primary" onClick={()=>setModal('add')}><IcPlus s={16}/> {t('cust_new')}</button>
      </PageHeader>
      <div className="card">
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
          <div className="input-wrap"><span className="input-icon"><IcSearch s={16}/></span><input className="input" placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
        {loading ? <LoadingBlock/> : customers.length===0 ? <EmptyState icon="👥" title="No customers yet" message={t('cust_empty')} action={<button className="btn btn-primary" onClick={()=>setModal('add')}><IcPlus s={15}/> {t('cust_new')}</button>}/> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('cust_name')}</th><th>{t('cust_phone')}</th><th>Type</th><th style={{textAlign:'right'}}>{t('cust_spent')}</th><th>{t('cust_last')}</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {customers.map(c=>{
                  const days=daysAgo(c.last_purchase_at); const risk=days!==null&&days>30;
                  return (
                    <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetail(c)}>
                      <td><div className="flex items-center gap-2"><div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,var(--brand-lite),var(--accent))',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0}}>{c.name[0].toUpperCase()}</div><span style={{fontWeight:600}}>{c.name}</span></div></td>
                      <td style={{color:'var(--text-2)'}}>{c.phone||'—'}</td>
                      <td><span className={`badge ${TYPE_BADGE[c.customer_type]||'badge-gray'}`} style={{textTransform:'capitalize'}}>{c.customer_type}</span></td>
                      <td style={{textAlign:'right',fontWeight:700}}>{fmt(c.total_spent)}</td>
                      <td style={{color:risk?'var(--warning)':'var(--text-2)',fontSize:13}}>{days!==null?`${days}d ago`:'—'}</td>
                      <td>{risk?<span className="badge badge-yellow">{t('cust_at_risk')}</span>:<span className="badge badge-green">{t('cust_active')}</span>}</td>
                      <td onClick={e=>e.stopPropagation()}>
                        <div className="table-actions">
                          <button className="btn btn-icon btn-ghost" onClick={()=>setModal(c)}><IcEdit/></button>
                          <button className="btn btn-icon btn-ghost" style={{color:'var(--danger)'}} onClick={()=>setDeleting(c)}><IcTrash/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {(modal==='add'||modal?.id) && <Modal title={modal==='add'?t('cust_new'):t('edit')} onClose={()=>setModal(null)}><CustomerForm initial={modal!=='add'?modal:null} onSave={handleSave} onClose={()=>setModal(null)} t={t}/></Modal>}
      {detail && <Modal title="Customer Details" onClose={()=>setDetail(null)} width="540px"><CustomerDetailModal customer={detail} onClose={()=>setDetail(null)} t={t}/></Modal>}
      {importModal && <Modal title={t('import_csv')} onClose={()=>setImportModal(false)} width="560px"><CsvImportModal module="customers" onClose={()=>setImportModal(false)} onDone={()=>{load();push('Import done!');}} t={t}/></Modal>}
      {deleting && <ConfirmDialog message={`Remove "${deleting.name}" from customers?`} onConfirm={async()=>{ await api.delete(`/customers/${deleting.id}`); setCustomers(c=>c.filter(x=>x.id!==deleting.id)); setDeleting(null); push('Deleted.'); }} onCancel={()=>setDeleting(null)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// EXPENSES
// ══════════════════════════════════════════════════════════════════════════
const EXP_CATS = ['Rent','Utilities','Staff','Transport','Marketing','Supplies','Maintenance','Tax','Loan','Insurance','Equipment','Food & Entertainment','Other'];
const CAT_BADGE = { Rent:'badge-red', Utilities:'badge-yellow', Staff:'badge-blue', Transport:'badge-gray', Marketing:'badge-green', Supplies:'badge-gray', Maintenance:'badge-yellow', Tax:'badge-red', Other:'badge-gray' };

export function Expenses() {
  const { t } = useI18n(); const { push } = useToast();
  const [expenses,setExpenses]=useState([]); const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false); const [deleting,setDeleting]=useState(null);
  const [importModal,setImportModal]=useState(false);
  const [form,setForm]=useState({category:'Rent',description:'',amount:'',payment_method:'cash',incurred_at:new Date().toISOString().slice(0,10)});
  const [saving,setSaving]=useState(false);
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));

  useEffect(()=>{ api.get('/expenses').then(d=>setExpenses(d.expenses)).catch(()=>{}).finally(()=>setLoading(false)); },[]);

  async function handleSave(e) {
    e.preventDefault(); setSaving(true);
    try { const d=await api.post('/expenses',{...form,amount:Number(form.amount)}); setExpenses(p=>[d.expense,...p]); setShowAdd(false); setForm(f=>({...f,description:'',amount:''})); push('Expense added.'); }
    catch(ex){ alert(ex.message); } finally { setSaving(false); }
  }

  const total=expenses.reduce((s,e)=>s+Number(e.amount),0);
  const byCat=expenses.reduce((m,e)=>{ m[e.category]=(m[e.category]||0)+Number(e.amount); return m; },{});
  const topCat=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];

  return (
    <div>
      <PageHeader title={t('exp_title')}>
        <button className="btn btn-secondary btn-sm" onClick={()=>api.download('/expenses/export','expenses.csv')}><IcDownload s={14}/> {t('export_csv')}</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>setImportModal(true)}><IcUpload s={14}/> {t('import_csv')}</button>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><IcPlus s={16}/> {t('exp_new')}</button>
      </PageHeader>
      {expenses.length>0 && (
        <div className="g-grid g2 mb-6" style={{gap:14}}>
          <div className="card stat-card"><div className="stat-label">Total Expenses</div><div className="stat-value" style={{color:'var(--danger)'}}>{fmt(total)}</div><div className="stat-sub">{expenses.length} records</div></div>
          {topCat && <div className="card stat-card"><div className="stat-label">Highest Category</div><div className="stat-value" style={{fontSize:18}}>{topCat[0]}</div><div className="stat-sub">{fmt(topCat[1])}</div></div>}
        </div>
      )}
      <div className="card">
        {loading ? <LoadingBlock/> : expenses.length===0 ? <EmptyState icon="💸" title="No expenses yet" message={t('exp_empty')} action={<button className="btn btn-primary" onClick={()=>setShowAdd(true)}><IcPlus s={15}/> {t('exp_new')}</button>}/> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('exp_date')}</th><th>{t('exp_category')}</th><th>{t('exp_desc')}</th><th>{t('exp_method')}</th><th style={{textAlign:'right'}}>{t('exp_amount')}</th><th></th></tr></thead>
              <tbody>
                {expenses.map(e=>(
                  <tr key={e.id}>
                    <td style={{color:'var(--text-2)',fontSize:12.5,whiteSpace:'nowrap'}}>{fmtD(e.incurred_at)}</td>
                    <td><span className={`badge ${CAT_BADGE[e.category]||'badge-gray'}`}>{e.category}</span></td>
                    <td style={{color:'var(--text-2)',maxWidth:200}}><span className="truncate" style={{display:'block'}}>{e.description||'—'}</span></td>
                    <td><span className={`badge ${PAY_BADGE[e.payment_method]||'badge-gray'}`}>{e.payment_method}</span></td>
                    <td style={{textAlign:'right',fontWeight:700,color:'var(--danger)'}}>{fmt(e.amount)}</td>
                    <td><button className="btn btn-icon btn-ghost" style={{color:'var(--danger)'}} onClick={()=>setDeleting(e)}><IcTrash/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showAdd && (
        <Modal title={t('exp_new')} onClose={()=>setShowAdd(false)}>
          <form onSubmit={handleSave} style={{display:'flex',flexDirection:'column',gap:14}}>
            <Field label={t('exp_category')}><select className="select" value={form.category} onChange={set('category')}>{EXP_CATS.map(c=><option key={c}>{c}</option>)}</select></Field>
            <Field label={t('exp_desc')}><input className="input" value={form.description} onChange={set('description')}/></Field>
            <Row2>
              <Field label={t('exp_amount')}><input className="input" type="number" min="0" required value={form.amount} onChange={set('amount')}/></Field>
              <Field label={t('exp_date')}><input className="input" type="date" value={form.incurred_at} onChange={set('incurred_at')}/></Field>
            </Row2>
            <Field label={t('exp_method')}><select className="select" value={form.payment_method} onChange={set('payment_method')}>{PAY_OPTS.map(m=><option key={m} value={m}>{m}</option>)}</select></Field>
            <div className="flex gap-3 justify-end"><button type="button" className="btn btn-secondary" onClick={()=>setShowAdd(false)}>{t('cancel')}</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':t('exp_save')}</button></div>
          </form>
        </Modal>
      )}
      {importModal && <Modal title={t('import_csv')} onClose={()=>setImportModal(false)} width="560px"><CsvImportModal module="expenses" onClose={()=>setImportModal(false)} onDone={()=>{api.get('/expenses').then(d=>setExpenses(d.expenses));push('Import done!');}} t={t}/></Modal>}
      {deleting && <ConfirmDialog message={`Delete expense: ${deleting.description||deleting.category} (${fmt(deleting.amount)})?`} onConfirm={async()=>{ await api.delete(`/expenses/${deleting.id}`); setExpenses(p=>p.filter(x=>x.id!==deleting.id)); setDeleting(null); push('Deleted.'); }} onCancel={()=>setDeleting(null)}/>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════════════════════════════════════
const INV_BADGE = { paid:'badge-green', unpaid:'badge-yellow', partial:'badge-blue', overdue:'badge-red' };

function InvoiceForm({ customers, onSave, onClose, t }) {
  const [form,setForm]=useState({customer_id:'',invoice_number:`INV-${Date.now().toString().slice(-5)}`,amount_due:'',amount_paid:'0',due_date:'',notes:''});
  const [saving,setSaving]=useState(false); const [err,setErr]=useState('');
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  async function submit(e){ e.preventDefault();setErr('');setSaving(true);try{await onSave({...form,amount_due:Number(form.amount_due),amount_paid:Number(form.amount_paid)});onClose();}catch(ex){setErr(ex.message);}finally{setSaving(false);} }
  return (
    <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
      <Field label={t('inv2_customer')}><select className="select" value={form.customer_id} onChange={set('customer_id')}><option value="">— No customer —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label={t('inv2_num')}><input className="input" required value={form.invoice_number} onChange={set('invoice_number')}/></Field>
      <Row2>
        <Field label={t('inv2_due')}><input className="input" type="number" min="0" required value={form.amount_due} onChange={set('amount_due')}/></Field>
        <Field label={t('inv2_paid')}><input className="input" type="number" min="0" value={form.amount_paid} onChange={set('amount_paid')}/></Field>
      </Row2>
      <Row2>
        <Field label={t('inv2_date')}><input className="input" type="date" value={form.due_date} onChange={set('due_date')}/></Field>
      </Row2>
      <Field label={t('inv2_notes')}><textarea className="input" rows={2} value={form.notes} onChange={set('notes')}/></Field>
      {err&&<div style={{color:'var(--danger)',fontSize:13}}>{err}</div>}
      <div className="flex gap-3 justify-end"><button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':t('inv2_save')}</button></div>
    </form>
  );
}

function PaymentModal({ invoice, onClose, onPaid, t }) {
  const [amount,setAmount]=useState(''); const [saving,setSaving]=useState(false);
  const remaining=Number(invoice.amount_due)-Number(invoice.amount_paid);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{background:'var(--bg-alt)',borderRadius:'var(--r-sm)',padding:'12px 14px',fontSize:13.5}}>
        Outstanding on <strong>{invoice.invoice_number}</strong>:{' '}
        <strong style={{color:'var(--danger)'}}>{fmt(remaining)}</strong>
      </div>
      <Field label="Amount received">
        <input className="input" type="number" min="1" max={remaining} required value={amount} onChange={e=>setAmount(e.target.value)} placeholder={`Max: ${fmt(remaining)}`}/>
      </Field>
      <div className="flex gap-3 justify-end">
        <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn btn-primary" disabled={saving||!amount} onClick={async()=>{ setSaving(true); try{ await onPaid(invoice,Number(amount)); }catch(ex){alert(ex.message);setSaving(false);}}}>{saving?'Saving…':t('inv2_pay')}</button>
      </div>
    </div>
  );
}

export function Invoices() {
  const { t } = useI18n(); const { push } = useToast();
  const [invoices,setInvoices]=useState([]); const [customers,setCustomers]=useState([]); const [loading,setLoading]=useState(true);
  const [showCreate,setShowCreate]=useState(false); const [paying,setPaying]=useState(null);

  useEffect(()=>{ Promise.all([api.get('/invoices'),api.get('/customers')]).then(([i,c])=>{setInvoices(i.invoices);setCustomers(c.customers);}).catch(()=>{}).finally(()=>setLoading(false)); },[]);

  async function handleSave(payload) { const d=await api.post('/invoices',payload); setInvoices(p=>[d.invoice,...p]); push('Invoice created.'); }
  async function handlePayment(inv,amount) { const d=await api.patch(`/invoices/${inv.id}/payment`,{amount}); setInvoices(p=>p.map(x=>x.id===d.invoice.id?d.invoice:x)); setPaying(null); push('Payment recorded.'); }

  const totalOwed=invoices.filter(i=>i.status!=='paid').reduce((s,i)=>s+Number(i.amount_due)-Number(i.amount_paid),0);
  const overdueCount=invoices.filter(i=>i.status==='overdue').length;

  return (
    <div>
      <PageHeader title={t('inv2_title')}><button className="btn btn-primary" onClick={()=>setShowCreate(true)}><IcPlus s={16}/> {t('inv2_new')}</button></PageHeader>
      {totalOwed>0 && (
        <div style={{background:'var(--danger-pale)',border:'1px solid rgba(239,68,68,.25)',borderRadius:'var(--r-md)',padding:'14px 18px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontWeight:700,marginBottom:2}}>Total outstanding</div>
            {overdueCount>0 && <div style={{fontSize:13,color:'var(--text-2)'}}>{overdueCount} overdue invoice{overdueCount!==1?'s':''}</div>}
          </div>
          <div style={{fontFamily:'var(--ff-display)',fontWeight:800,fontSize:24,color:'var(--danger)'}}>{fmt(totalOwed)}</div>
        </div>
      )}
      <div className="card">
        {loading ? <LoadingBlock/> : invoices.length===0 ? <EmptyState icon="🧾" title="No invoices yet" message={t('inv2_empty')} action={<button className="btn btn-primary" onClick={()=>setShowCreate(true)}><IcPlus s={15}/> {t('inv2_new')}</button>}/> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice #</th><th>{t('inv2_customer')}</th><th>{t('inv2_date')}</th><th style={{textAlign:'right'}}>{t('inv2_due')}</th><th style={{textAlign:'right'}}>{t('inv2_paid')}</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {invoices.map(inv=>(
                  <tr key={inv.id}>
                    <td style={{fontWeight:700}}>{inv.invoice_number}</td>
                    <td>{inv.cname||'—'}</td>
                    <td style={{color:'var(--text-2)',fontSize:12.5}}>{fmtD(inv.due_date)}</td>
                    <td style={{textAlign:'right',fontWeight:700}}>{fmt(inv.amount_due)}</td>
                    <td style={{textAlign:'right',color:Number(inv.amount_paid)>=Number(inv.amount_due)?'var(--brand)':'var(--text-2)'}}>{fmt(inv.amount_paid)}</td>
                    <td><span className={`badge ${INV_BADGE[inv.status]||'badge-gray'}`}>{t(`status_${inv.status}`)}</span></td>
                    <td>{inv.status!=='paid' && <button className="btn btn-sm btn-secondary" onClick={()=>setPaying(inv)}>{t('inv2_pay')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showCreate && <Modal title={t('inv2_new')} onClose={()=>setShowCreate(false)}><InvoiceForm customers={customers} onSave={async p=>{await handleSave(p);setShowCreate(false);}} onClose={()=>setShowCreate(false)} t={t}/></Modal>}
      {paying && <Modal title={t('inv2_pay')} onClose={()=>setPaying(null)} width="420px"><PaymentModal invoice={paying} onClose={()=>setPaying(null)} onPaid={handlePayment} t={t}/></Modal>}
    </div>
  );
}
