import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n, useToast, useOnline } from '../context/index.jsx';
import { api } from '../api/client.js';
import { enqueue } from '../api/offline.js';
import { Spinner, fmt } from '../components/index.jsx';
import CameraScanner from '../components/CameraScanner.jsx';
import { cachedGet } from '../lib/cache.js';
import { IcSearch, IcPlus, IcX, IcBarcode, IcReceipt, IcRefresh, IcCamera } from '../components/Icons.jsx';

const PAYMENT_METHODS = ['cash','transfer','pos','ussd','opay','moniepoint','credit','other'];

function QtyControl({ qty, onInc, onDec, onRemove }) {
  return (
    <div className="cart-qty">
      <button className="qty-btn" onClick={onDec}>{qty <= 1 ? '🗑' : '−'}</button>
      <span style={{ fontWeight:700, minWidth:24, textAlign:'center' }}>{qty}</span>
      <button className="qty-btn" onClick={onInc}>+</button>
    </div>
  );
}

export default function POS() {
  const { t }  = useI18n();
  const { push } = useToast();
  const online   = useOnline();

  const [products,   setProducts]   = useState([]);
  const [customers,  setCustomers]  = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart,       setCart]       = useState([]);
  const [search,     setSearch]     = useState('');
  const [activeCat,  setActiveCat]  = useState('');
  const [customerId, setCustomerId] = useState('');
  const [payment,    setPayment]    = useState('cash');
  const [discount,   setDiscount]   = useState('');
  const [tendered,   setTendered]   = useState('');
  const [scanning,   setScanning]   = useState(false);
  const [camera,     setCamera]     = useState(false);
  const [completing, setCompleting] = useState(false);
  const [receipt,    setReceipt]    = useState(null);
  const [view,       setView]       = useState('quick'); // quick | search
  const searchRef = useRef(); const barcodeInputRef = useRef();

  useEffect(() => {
    // Network-first with a saved copy, so the till keeps working with no internet.
    Promise.all([cachedGet(api,'/products'), cachedGet(api,'/customers'), cachedGet(api,'/categories')])
      .then(([p,c,cat])=>{ setProducts(p.data.products); setCustomers(c.data.customers); setCategories(cat.data.categories); })
      .catch(()=>{});
  }, []);

  // Add to cart (or increment qty if already in cart)
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(x => x.product_id === product.id);
      if (existing) return prev.map(x => x.product_id===product.id ? {...x, quantity: x.quantity+1} : x);
      return [...prev, { product_id:product.id, name:product.name, price:Number(product.selling_price), quantity:1, stock:Number(product.total_qty||0) }];
    });
  }, []);

  const updateQty = (id, delta) => {
    setCart(prev => {
      const item = prev.find(x=>x.product_id===id);
      if (!item) return prev;
      if (item.quantity + delta <= 0) return prev.filter(x=>x.product_id!==id);
      return prev.map(x=>x.product_id===id ? {...x, quantity:x.quantity+delta} : x);
    });
  };

  // Barcode scan handler (continuous)
  // Looks in the loaded product list first (instant + works offline), then asks the server.
  const handleBarcodeScan = useCallback(async (barcodeVal) => {
    const code = String(barcodeVal).trim();
    let product = products.find(p => p.barcode === code || p.sku === code);
    if (!product && online) { try { product = (await api.get(`/products/barcode/${encodeURIComponent(code)}`)).product; } catch {} }
    if (!product) { const m = t('scan_unknown', { code }); push(m, 'error'); return m; }
    addToCart(product);
    const m = t('scan_added', { name: product.name });
    push(m, 'success');
    return m;
  }, [addToCart, push, products, online, t]);

  // Manual barcode text input (for hardware scanners / keyboard emulation)
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const barcodeTimer = useRef(null);
  useEffect(() => {
    if (!scanning) return;
    const handler = (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)) return;
      if (e.key === 'Enter' && barcodeBuffer) {
        handleBarcodeScan(barcodeBuffer);
        setBarcodeBuffer('');
        clearTimeout(barcodeTimer.current);
      } else if (e.key.length === 1) {
        setBarcodeBuffer(b => b + e.key);
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => setBarcodeBuffer(''), 300);
      }
    };
    document.addEventListener('keypress', handler);
    return () => document.removeEventListener('keypress', handler);
  }, [scanning, barcodeBuffer, handleBarcodeScan]);

  const subtotal  = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountN = Number(discount) || 0;
  const total     = Math.max(0, subtotal - discountN);
  const tenderedN = Number(tendered) || 0;
  const change    = payment === 'cash' && tenderedN > 0 ? Math.max(0, tenderedN - total) : null;

  async function completeSale() {
    if (!cart.length) return push('Cart is empty.', 'error');
    setCompleting(true);
    const payload = {
      customer_id: customerId || null,
      payment_method: payment,
      discount: discountN,
      amount_tendered: tenderedN || undefined,
      items: cart.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    };
    try {
      let sale;
      const saveOffline = async () => {
        const offlineId = await enqueue('sale', payload);
        sale = { id: offlineId, total_amount: total, offline: true };
        push('Sale saved on this phone — it will sync when you are online.', 'info');
      };
      if (online) {
        try { const d = await api.post('/sales', payload); sale = d.sale; }
        catch (ex) { if (ex.offline) await saveOffline(); else throw ex; }
      } else {
        await saveOffline();
      }
      setReceipt({ sale, cart:[...cart], total, change, customer: customers.find(c=>c.id===customerId) });
      setCart([]); setDiscount(''); setTendered(''); setCustomerId(''); setPayment('cash');
      if (!sale.offline) push('Sale recorded successfully!', 'success');
    } catch(ex) {
      push(ex.message, 'error');
    } finally {
      setCompleting(false);
    }
  }

  const filteredProducts = products.filter(p => {
    const matchCat = !activeCat || p.category_id === activeCat;
    const matchQ   = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku||'').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  if (receipt) {
    return (
      <div style={{maxWidth:480,margin:'0 auto',padding:'20px 0'}}>
        <div className="card card-p" style={{textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:10}}>🧾</div>
          <div style={{fontFamily:'var(--ff-display)',fontWeight:800,fontSize:20,marginBottom:4}}>Sale Complete</div>
          <div style={{color:'var(--text-2)',fontSize:13.5,marginBottom:20}}>{receipt.sale.offline ? 'Saved offline' : `Receipt #${receipt.sale.id?.slice(-8).toUpperCase()}`}</div>
          <div style={{background:'var(--bg-alt)',borderRadius:'var(--r-md)',padding:'16px',marginBottom:20,textAlign:'left'}}>
            {receipt.cart.map(i=>(
              <div key={i.product_id} className="flex justify-between" style={{padding:'5px 0',fontSize:13.5,borderBottom:'1px solid var(--border)'}}>
                <span>{i.name} × {i.quantity}</span>
                <span style={{fontWeight:600}}>{fmt(i.price*i.quantity)}</span>
              </div>
            ))}
            {discountN>0 && <div className="flex justify-between" style={{padding:'5px 0',fontSize:13.5,color:'var(--danger)'}}><span>Discount</span><span>−{fmt(discountN)}</span></div>}
            <div className="flex justify-between" style={{padding:'10px 0 0',fontFamily:'var(--ff-display)',fontWeight:800,fontSize:18}}>
              <span>Total</span><span style={{color:'var(--brand)'}}>{fmt(receipt.total)}</span>
            </div>
            {receipt.change>0 && <div className="flex justify-between" style={{fontSize:13.5,color:'var(--text-2)',marginTop:4}}><span>Change due</span><span style={{fontWeight:600}}>{fmt(receipt.change)}</span></div>}
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary w-full" onClick={()=>window.print()}><IcReceipt s={16}/> Print</button>
            <button className="btn btn-primary w-full" onClick={()=>setReceipt(null)}><IcPlus s={16}/> New Sale</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      {/* LEFT: Product selection */}
      <div className="flex-col pos-products" style={{gap:12,overflow:'hidden'}}>
        {/* View toggle + scan */}
        <div className="flex gap-2 items-center">
          <div className="flex" style={{background:'var(--bg-alt)',borderRadius:'var(--r-md)',padding:4,gap:4}}>
            {[['quick','⚡ Quick'],['search','🔍 Search']].map(([v,l])=>(
              <button key={v} className={`btn btn-sm ${view===v?'btn-primary':'btn-ghost'}`} style={{borderRadius:'var(--r-sm)'}} onClick={()=>setView(v)}>{l}</button>
            ))}
          </div>
          <button className="btn btn-sm btn-secondary" onClick={()=>setCamera(true)}>
            <IcCamera s={15}/> {t('scan_camera')}
          </button>
          <button
            className={`btn btn-sm ${scanning?'btn-danger':'btn-secondary'}`}
            onClick={()=>setScanning(v=>!v)}
            title={scanning?'Stop scanning':'Start barcode scanning mode'}
          >
            <IcBarcode s={15}/> {scanning ? 'Stop Scan' : 'Scan'}
          </button>
          {scanning && (
            <div style={{fontSize:12.5,color:'var(--warning)',display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--warning)',display:'inline-block',animation:'pulse 1s infinite'}}/>
              Scan mode active — scan any barcode
            </div>
          )}
        </div>

        {/* Search bar */}
        <div className="input-wrap">
          <span className="input-icon"><IcSearch s={16}/></span>
          <input ref={searchRef} className="input" placeholder={t('pos_search')} value={search}
            onChange={e=>setSearch(e.target.value)} onClick={()=>setView('search')}/>
          {search && <button className="input-right btn btn-icon btn-ghost" onClick={()=>setSearch('')}><IcX s={14}/></button>}
        </div>

        {/* Category chips */}
        {categories.length>0 && (
          <div className="flex gap-2" style={{flexWrap:'wrap'}}>
            <button className={`chip${!activeCat?' active':''}`} onClick={()=>setActiveCat('')}>All</button>
            {categories.map(c=>(
              <button key={c.id} className={`chip${activeCat===c.id?' active':''}`} onClick={()=>setActiveCat(c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        {/* Products */}
        <div style={{flex:1,overflowY:'auto'}}>
          {view==='quick' ? (
            <div className="quick-grid">
              {filteredProducts.filter(p=>!p.is_service).map(p=>(
                <button key={p.id} className="quick-btn" onClick={()=>addToCart(p)}>
                  <div className="quick-btn-name">{p.name}</div>
                  <div className="quick-btn-price">{fmt(p.selling_price)}</div>
                  <div className="quick-btn-stock">Stock: {p.total_qty}</div>
                </button>
              ))}
              {filteredProducts.filter(p=>p.is_service).map(p=>(
                <button key={p.id} className="quick-btn" style={{borderStyle:'dashed'}} onClick={()=>addToCart(p)}>
                  <div style={{fontSize:10,color:'var(--text-3)',marginBottom:2}}>SERVICE</div>
                  <div className="quick-btn-name">{p.name}</div>
                  <div className="quick-btn-price">{fmt(p.selling_price)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>SKU</th><th style={{textAlign:'right'}}>Price</th><th style={{textAlign:'right'}}>Stock</th><th></th></tr></thead>
                <tbody>
                  {filteredProducts.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:600}}>{p.name}</td>
                      <td style={{color:'var(--text-3)',fontSize:12}}>{p.sku||'—'}</td>
                      <td style={{textAlign:'right',fontWeight:700}}>{fmt(p.selling_price)}</td>
                      <td style={{textAlign:'right',color:p.total_qty<=p.reorder_level?'var(--warning)':'var(--text-2)'}}>{p.is_service?'—':p.total_qty}</td>
                      <td><button className="btn btn-sm btn-primary" onClick={()=>addToCart(p)}><IcPlus s={13}/>Add</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart & checkout */}
      <div className="card flex-col" id="pos-cart" style={{overflow:'hidden'}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontFamily:'var(--ff-display)',fontWeight:700,fontSize:15,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>{t('pos_cart')} ({cart.length})</span>
          {cart.length>0 && <button className="btn btn-ghost btn-sm" style={{color:'var(--danger)'}} onClick={()=>setCart([])}><IcX s={14}/> Clear</button>}
        </div>

        {/* Cart items */}
        <div style={{flex:1,overflowY:'auto',padding:'0 16px'}}>
          {cart.length===0 ? (
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:13}}>
              <div style={{fontSize:36,marginBottom:10}}>🛒</div>
              {t('pos_empty_cart')}
            </div>
          ) : cart.map(item=>(
            <div key={item.product_id} className="cart-item">
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{fmt(item.price)} each</div>
              </div>
              <QtyControl qty={item.quantity} onInc={()=>updateQty(item.product_id,1)} onDec={()=>updateQty(item.product_id,-1)}/>
              <div style={{fontWeight:700,fontSize:13.5,minWidth:70,textAlign:'right'}}>{fmt(item.price*item.quantity)}</div>
            </div>
          ))}
        </div>

        {/* Checkout section */}
        <div style={{padding:'14px 16px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          {/* Customer */}
          <div className="field">
            <label>{t('pos_customer')}</label>
            <select className="select" value={customerId} onChange={e=>setCustomerId(e.target.value)} style={{fontSize:13}}>
              <option value="">{t('pos_walkin')}</option>
              {customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?` · ${c.phone}`:''}</option>)}
            </select>
          </div>

          {/* Payment method */}
          <div className="field">
            <label>{t('pos_payment')}</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5}}>
              {PAYMENT_METHODS.map(m=>(
                <button key={m} className={`btn btn-sm ${payment===m?'btn-primary':'btn-secondary'}`} style={{padding:'5px 4px',fontSize:11.5}} onClick={()=>setPayment(m)}>
                  {t(`payment_${m}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Discount + tendered */}
          <div className="flex gap-2">
            <div className="field" style={{flex:1}}>
              <label>{t('pos_discount')}</label>
              <input className="input" type="number" min="0" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="0"/>
            </div>
            {payment==='cash' && (
              <div className="field" style={{flex:1}}>
                <label>{t('pos_tendered')}</label>
                <input className="input" type="number" min="0" value={tendered} onChange={e=>setTendered(e.target.value)} placeholder={String(total)}/>
              </div>
            )}
          </div>

          {/* Totals */}
          <div style={{background:'var(--bg-alt)',borderRadius:'var(--r-md)',padding:'12px 14px'}}>
            {discountN>0 && (
              <div className="flex justify-between" style={{fontSize:13,color:'var(--text-2)',marginBottom:4}}>
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
            )}
            {discountN>0 && (
              <div className="flex justify-between" style={{fontSize:13,color:'var(--danger)',marginBottom:6}}>
                <span>Discount</span><span>−{fmt(discountN)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span style={{fontFamily:'var(--ff-display)',fontWeight:700,fontSize:14}}>Total</span>
              <span style={{fontFamily:'var(--ff-display)',fontWeight:800,fontSize:24,color:'var(--brand)'}}>{fmt(total)}</span>
            </div>
            {change!==null && change>0 && (
              <div className="flex justify-between" style={{fontSize:13,color:'var(--info)',marginTop:4}}>
                <span>{t('pos_change')}</span><span style={{fontWeight:700}}>{fmt(change)}</span>
              </div>
            )}
          </div>

          <button className="btn btn-primary btn-lg" onClick={completeSale} disabled={completing||cart.length===0}>
            {completing ? <Spinner/> : <>{t('pos_complete')} — {fmt(total)}</>}
          </button>
          {!online && <div style={{fontSize:11.5,color:'var(--warning)',textAlign:'center'}}>📴 Offline — sale will sync when online</div>}
        </div>
      </div>

      {cart.length>0 && (
        <button className="pos-cart-bar" onClick={()=>document.getElementById('pos-cart')?.scrollIntoView({behavior:'smooth'})}>
          <span>🛒 {cart.reduce((n,i)=>n+i.quantity,0)}</span><span>{fmt(total)} →</span>
        </button>
      )}
      {camera && <CameraScanner onScan={handleBarcodeScan} onClose={()=>setCamera(false)}/>}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
