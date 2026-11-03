import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useTheme, useI18n, useToast, useOnline, LANGUAGES } from '../context/index.jsx';
import { api } from '../api/client.js';
import {
  IcGrid, IcCart, IcTrend, IcBox, IcUsers, IcWallet, IcFile, IcSparkles,
  IcBell, IcChart, IcCog, IcLogout, IcX, IcSearch, IcPlus, IcCheck,
  IcDownload, IcUpload, IcSun, IcMoon, IcMonitor, IcGlobe, IcChevDown,
  IcMenu, IcBuilding, IcCredit, IcAlert, IcRefresh, IcZap,
  IcTruck, IcWarn, IcMore, IcPhone, IcChat,
} from './Icons.jsx';
import { flushQueue, countPending } from '../api/offline.js';

// ── Helpers ───────────────────────────────────────────────────────────────
export const fmt  = n  => `₦${Math.round(Number(n)||0).toLocaleString()}`;
export const fmtD = s  => { try { return new Date(s).toLocaleDateString(undefined,{dateStyle:'medium'}); } catch { return s||'—'; } };
export const fmtDT= s  => { try { return new Date(s).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); } catch { return s||'—'; } };
export const fmtShort= s=> { try { return new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric'}); } catch { return s; } };
export const daysAgo = s=> { if(!s) return null; return Math.floor((Date.now()-new Date(s))/86400000); };
export const pct  = (a,b) => b ? `${((Number(a)/Number(b))*100).toFixed(0)}%` : '0%';

// ── Basic UI ──────────────────────────────────────────────────────────────
export function Spinner({ lg }) { return <div className={`spinner${lg?' spinner-lg':''}`}/>; }
export function LoadingBlock() { return <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'56px 20px',color:'var(--text-3)'}}><Spinner/><span>Loading…</span></div>; }

export function Modal({ title, onClose, children, width='500px' }) {
  useEffect(() => {
    const fn = e => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{maxWidth:width}}>
        <div className="modal-hdr">
          <h3>{title}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><IcX s={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title='Confirm', message, onConfirm, onCancel, danger=true }) {
  return (
    <Modal title={title} onClose={onCancel} width="380px">
      <p style={{fontSize:14,color:'var(--text-2)',marginBottom:20,lineHeight:1.6}}>{message}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger?'btn-danger':'btn-primary'}`} onClick={onConfirm}>{danger?'Delete':'Confirm'}</button>
      </div>
    </Modal>
  );
}

export function EmptyState({ icon='📋', title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      {title && <div style={{fontFamily:'var(--ff-display)',fontWeight:700,fontSize:16,marginBottom:8}}>{title}</div>}
      <div className="empty-text">{message}</div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p style={{fontSize:13.5,color:'var(--text-2)',marginTop:4}}>{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2 items-center" style={{flexWrap:'wrap'}}>{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, trend, color, icon, onClick }) {
  return (
    <div className={`card stat-card${onClick?' card-hover':''}`} style={{cursor:onClick?'pointer':undefined}} onClick={onClick}>
      <div className="flex justify-between items-start" style={{marginBottom:10}}>
        <div className="stat-label">{label}</div>
        {icon && <div style={{color:'var(--text-3)',opacity:.7}}>{icon}</div>}
      </div>
      <div className="stat-value" style={color?{color}:undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {trend != null && (
        <div className={`stat-trend ${Number(trend)>=0?'up':'down'}`}>
          {Number(trend)>=0?'▲':'▼'} {Math.abs(Number(trend)).toFixed(1)}% vs prev period
        </div>
      )}
    </div>
  );
}

// ── CSV Import / Export ───────────────────────────────────────────────────
export function CsvImportModal({ module, onClose, onDone, t }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const fileRef = useRef();

  const TEMPLATES = {
    products:  'sku,name,category,supplier,cost_price,selling_price,quantity,reorder_level,unit,barcode\nFAB001,Ankara Fabric,Fabric,Aba Textile Hub,8000,12500,50,10,bundle,6001234567890',
    sales:     'date,sku,quantity,unit_price,payment_method,customer_phone\n2026-01-15,FAB001,2,12500,cash,08031234567',
    customers: 'name,phone,email,address\nAda Okafor,08031234567,ada@example.com,Lagos',
    suppliers: 'name,contact_person,phone,whatsapp,email,address,products_note,payment_terms\nAba Textile Hub,Mr Chidi,08031110001,08031110001,,Ariaria Market Aba,Ankara and lace,Pay 50% upfront',
    expenses:  'date,category,description,amount,payment_method\n2026-01-15,Rent,Monthly rent,80000,cash',
  };
  const NOTES = { sales:'Imported sales are added to your reports only — they do not change stock.', products:'Existing products (same SKU or name) are updated. Stock quantity is set to the value in the file.' };

  async function handleFile(f) {
    setFile(f); setPreview(null); setResult(null); setError(''); setBusy(true);
    const fd = new FormData(); fd.append('file', f);
    try { setPreview(await api.upload(`/import/${module}?dry=1`, fd)); }
    catch (ex) { setError(ex.message); }
    finally { setBusy(false); }
  }
  async function doImport() {
    if (!file) return;
    setBusy(true); setError('');
    const fd = new FormData(); fd.append('file', file);
    try { setResult(await api.upload(`/import/${module}`, fd)); onDone && onDone(); }
    catch (ex) { setError(ex.message); }
    finally { setBusy(false); }
  }
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATES[module] || 'name\nExample'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${module}-template.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div className="flex-col" style={{gap:16}}>
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}><IcDownload s={14}/> {t('download_template')}</button>
      </div>
      {NOTES[module] && <div style={{fontSize:12.5,color:'var(--text-2)'}}>{NOTES[module]}</div>}
      {!result ? (
        <>
          <div className={`drop-zone${file?' over':''}`} onClick={() => fileRef.current?.click()}
            onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) handleFile(f);}}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)handleFile(f);}}/>
            <IcUpload s={28} style={{color:'var(--text-3)',margin:'0 auto 10px'}}/>
            <div style={{fontWeight:600,marginBottom:4}}>{file?file.name:'Tap to choose a CSV file'}</div>
            <div style={{fontSize:12.5,color:'var(--text-3)'}}>Max 10MB · up to 5,000 rows</div>
          </div>
          {busy && !preview && <div className="flex gap-2 items-center" style={{color:'var(--text-3)'}}><Spinner/> Checking file…</div>}
          {error && <div className="auth-err">{error}</div>}
          {preview && (
            <div className="card card-p">
              <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>{t('import_preview')}</div>
              <div className="g-grid g3" style={{gap:12,marginBottom:14}}>
                {[['Total rows', preview.totalRows,'var(--text)'],['Valid rows',preview.validRows,'var(--brand)'],['Errors',preview.errorRows,'var(--danger)']].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:'center',padding:'10px',background:'var(--bg-alt)',borderRadius:'var(--r-sm)'}}>
                    <div style={{fontFamily:'var(--ff-display)',fontWeight:800,fontSize:22,color:c}}>{v}</div>
                    <div style={{fontSize:12,color:'var(--text-3)',marginTop:3}}>{l}</div>
                  </div>
                ))}
              </div>
              {preview.errors?.slice(0,5).map((e,i)=>(
                <div key={i} style={{background:'var(--danger-pale)',borderLeft:'3px solid var(--danger)',padding:'8px 12px',borderRadius:'var(--r-sm)',marginBottom:6,fontSize:13}}>
                  <strong>Row {e.row}:</strong> {e.error}
                </div>
              ))}
              {preview.validRows>0 && (
                <button className="btn btn-primary w-full" style={{marginTop:8}} onClick={doImport} disabled={busy}>
                  {busy?<><Spinner/> Importing…</>:<><IcUpload s={14}/> {t('import_btn')} ({preview.validRows} rows)</>}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div style={{fontSize:40,marginBottom:10}}>✅</div>
          <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>Import complete</div>
          <div style={{color:'var(--text-2)',fontSize:13.5}}>{result.imported} imported{result.skipped>0?`, ${result.skipped} skipped`:''}</div>
          {result.errors?.slice(0,3).map((e,i)=><div key={i} style={{fontSize:12.5,color:'var(--danger)',marginTop:6}}>Row {e.row}: {e.error}</div>)}
          <button className="btn btn-primary" style={{marginTop:18}} onClick={onClose}>{t('close')}</button>
        </div>
      )}
      {!result && <div className="flex gap-3 justify-end"><button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button></div>}
    </div>
  );
}

// ── Chart Tooltip ──────────────────────────────────────────────────────────
export function ChartTooltip({ active, payload, label, money=true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{fmtShort(label)}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{fontWeight:700,color:p.color||'var(--brand)'}}>
          {money ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to:'/',          icon:IcGrid,      key:'nav_dashboard', end:true },
  { to:'/pos',       icon:IcCart,      key:'nav_pos' },
  { to:'/shortages', icon:IcWarn,      key:'nav_shortages', shortage:true },
  { to:'/suppliers', icon:IcTruck,     key:'nav_suppliers' },
  { to:'/inventory', icon:IcBox,       key:'nav_inventory' },
  { to:'/sales',     icon:IcTrend,     key:'nav_sales' },
  { to:'/customers', icon:IcUsers,     key:'nav_customers' },
  { to:'/expenses',  icon:IcWallet,    key:'nav_expenses' },
  { to:'/invoices',  icon:IcFile,      key:'nav_invoices' },
  { to:'/analysis',  icon:IcSparkles,  key:'nav_analysis' },
  { to:'/alerts',    icon:IcBell,      key:'nav_alerts', badge:true },
  { to:'/reports',   icon:IcChart,     key:'nav_reports' },
];

export function Sidebar({ open, onClose, unread, shortages=0 }) {
  const { t }                    = useI18n();
  const { user, business, logout } = useAuth();
  const nav                      = useNavigate();

  return (
    <>
      {open && <div className="sb-scrim" onClick={onClose}/>}
      <aside className={`sidebar${open?' open':''}`}>
        <div className="sb-logo">
          <div className="sb-logo-mark">P</div>
          <div style={{minWidth:0}}>
            <div className="sb-logo-text">Pulse Track</div>
            {business && <div className="sb-logo-sub">{business.name}</div>}
          </div>
          <button className="btn btn-icon btn-ghost sb-close" onClick={onClose} aria-label="Close menu"><IcX s={17}/></button>
        </div>

        <nav className="sb-nav" aria-label="Main navigation">
          <div className="sb-section">Business</div>
          {NAV_ITEMS.map(({to,icon:Icon,key,end,badge,shortage})=>(
            <NavLink
              key={to} to={to} end={end} onClick={onClose}
              className={({isActive})=>`sb-link${isActive?' active':''}`}
              aria-label={t(key)}
            >
              <Icon s={18}/>
              <span>{t(key)}</span>
              {badge && unread>0 && <span className="dot" aria-label={`${unread} unread`}/>}
              {shortage && shortages>0 && <span className="count-pill">{shortages>99?'99+':shortages}</span>}
            </NavLink>
          ))}
          <div className="sb-section" style={{marginTop:8}}>Account</div>
          <div style={{margin:'6px 12px 2px',fontSize:11,color:'rgba(255,255,255,.4)',lineHeight:1.5}}>🌿 {t('set_free')}</div>
          <NavLink to="/team" onClick={onClose} className={({isActive})=>`sb-link${isActive?' active':''}`}>
            <IcUsers s={18}/> <span>{t('nav_team')}</span>
          </NavLink>
          <NavLink to="/settings" onClick={onClose} className={({isActive})=>`sb-link${isActive?' active':''}`}>
            <IcCog s={18}/> <span>{t('nav_settings')}</span>
          </NavLink>
        </nav>

        <div className="sb-footer">
          {user && (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',marginBottom:4,borderRadius:'var(--r-sm)'}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,var(--brand-lite),var(--accent))',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,flexShrink:0}}>{user.name?.[0]?.toUpperCase()}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:600,color:'rgba(255,255,255,.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.name}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.35)',textTransform:'capitalize'}}>{user.role}</div>
              </div>
            </div>
          )}
          <button className="sb-link" style={{width:'100%',color:'rgba(255,255,255,.4)'}} onClick={logout}>
            <IcLogout s={17}/> {t('nav_logout')}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Top Bar ───────────────────────────────────────────────────────────────
export function TopBar({ onMenuOpen, unread }) {
  const { t, lang, setLang, languages } = useI18n();
  const { mode, setMode }               = useTheme();
  const { user, updateSettings, logout } = useAuth();
  const { push }                        = useToast();
  const online                          = useOnline();
  const nav                             = useNavigate();

  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen,  setLangOpen]  = useState(false);
  const themeRef = useRef(); const langRef = useRef();

  useEffect(() => {
    const fn = e => {
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false);
      if (langRef.current  && !langRef.current.contains(e.target))  setLangOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const changeTheme = async m => { setMode(m); setThemeOpen(false); try { await updateSettings({theme:m}); } catch {} };
  const changeLang  = async l => { setLang(l); setLangOpen(false);  try { await updateSettings({language:l}); } catch {} };

  const themeIcon = mode==='dark' ? <IcMoon/> : mode==='light' ? <IcSun/> : <IcMonitor/>;

  return (
    <>
      {!online && <div className="offline-bar" role="alert">📴 {t('offline_banner')}</div>}
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn btn-icon btn-ghost tb-menu-btn" onClick={onMenuOpen} aria-label="Open menu">
            <IcMenu/>
          </button>
        </div>

        <div className="topbar-right">
          {/* Alerts */}
          <div className="notif-wrap">
            <button className="btn btn-icon btn-ghost" onClick={()=>nav('/alerts')} aria-label={`${unread} alerts`}>
              <IcBell s={19}/>
              {unread>0 && <span className="notif-badge">{unread>99?'99+':unread}</span>}
            </button>
          </div>

          {/* Sign out — always visible */}
          <button className="btn btn-secondary btn-sm" onClick={()=>{ if (window.confirm(t('nav_logout')+'?')) logout(); }} aria-label={t('nav_logout')} title={t('nav_logout')}>
            <IcLogout s={16}/> <span className="tb-signout-label">{t('nav_logout')}</span>
          </button>

          {/* Theme */}
          <div className="dropdown-wrap" ref={themeRef}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setThemeOpen(v=>!v)} aria-label="Theme">
              {themeIcon} <IcChevDown/>
            </button>
            {themeOpen && (
              <div className="dropdown-menu">
                {[['light','Light',<IcSun/>],['dark','Dark',<IcMoon/>],['system','System',<IcMonitor/>]].map(([v,l,ic])=>(
                  <button key={v} className={`dd-item${mode===v?' active':''}`} onClick={()=>changeTheme(v)}>{ic}{t(`settings_${v}`)}</button>
                ))}
              </div>
            )}
          </div>

          {/* Language */}
          <div className="dropdown-wrap" ref={langRef}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setLangOpen(v=>!v)} aria-label="Language">
              <IcGlobe/> <span style={{fontSize:11.5,fontWeight:700}}>{lang.toUpperCase()}</span> <IcChevDown/>
            </button>
            {langOpen && (
              <div className="dropdown-menu" style={{minWidth:190}}>
                {languages.map(l=>(
                  <button key={l.code} className={`dd-item${lang===l.code?' active':''}`} onClick={()=>changeLang(l.code)}>
                    <span>{l.flag}</span> {l.label}
                    {lang===l.code && <IcCheck s={14} style={{marginLeft:'auto',color:'var(--brand)'}}/>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User */}
          {user && (
            <div className="user-chip" onClick={()=>nav('/settings')} role="button" tabIndex={0}>
              <div className="user-avatar">{user.name?.[0]?.toUpperCase()}</div>
              <span className="user-name hide-mobile">{user.name?.split(' ')[0]}</span>
            </div>
          )}
        </div>
      </header>
    </>
  );
}

// ── Sync manager: pushes offline sales/expenses when the connection returns ──
export function SyncBar({ onSynced }) {
  const { t } = useI18n();
  const { push } = useToast();
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => { countPending().then(setPending).catch(()=>{}); }, []);
  const run = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await flushQueue((p,b)=>api.post(p,b));
      if (r.synced) { push(t('sync_done',{n:r.synced}), 'success'); onSynced && onSynced(); }
      if (r.conflicts) push(t('sync_conflict'), 'info');
      if (r.failed) push(t('sync_failed',{n:r.failed}), 'error');
    } catch {} finally { setSyncing(false); refresh(); }
  }, [push, t, refresh, onSynced]);

  useEffect(() => { refresh(); window.addEventListener('pt-queue-changed', refresh); return () => window.removeEventListener('pt-queue-changed', refresh); }, [refresh]);
  useEffect(() => { if (online) run(); }, [online, run]);
  useEffect(() => { const id = setInterval(() => { if (navigator.onLine) run(); }, 60000); return () => clearInterval(id); }, [run]);

  if (!pending) return null;
  return (
    <button className="sync-bar" onClick={run} disabled={syncing || !online}>
      {syncing ? <Spinner/> : <IcRefresh s={14}/>} {t('sync_pending',{n:pending})}
    </button>
  );
}

// ── Mobile bottom tab bar ─────────────────────────────────────────────────
const TABS = [
  { to:'/',          icon:IcGrid,  key:'nav_dashboard', end:true },
  { to:'/pos',       icon:IcCart,  key:'nav_pos' },
  { to:'/shortages', icon:IcWarn,  key:'nav_shortages', shortage:true },
  { to:'/suppliers', icon:IcTruck, key:'nav_suppliers' },
];
export function BottomNav({ shortages, onMore }) {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label="Quick navigation">
      {TABS.map(({to,icon:Icon,key,end,shortage})=>(
        <NavLink key={to} to={to} end={end} className={({isActive})=>`bn-item${isActive?' active':''}`}>
          <span className="bn-ico"><Icon s={21}/>{shortage && shortages>0 && <span className="bn-badge">{shortages>99?'99+':shortages}</span>}</span>
          <span className="bn-label">{t(key)}</span>
        </NavLink>
      ))}
      <button className="bn-item" onClick={onMore}><span className="bn-ico"><IcMore s={21}/></span><span className="bn-label">{t('nav_more')}</span></button>
    </nav>
  );
}

// ── App Layout ─────────────────────────────────────────────────────────────
export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread]           = useState(0);
  const [shortages, setShortages]     = useState(0);
  const online                        = useOnline();

  const refreshCounts = useCallback(() => {
    api.get('/alerts').then(d => setUnread(d.alerts.filter(a=>!a.is_read).length)).catch(()=>{});
    api.get('/shortages/summary').then(d => setShortages(d.total||0)).catch(()=>{});
  }, []);
  useEffect(() => { if (online) refreshCounts(); }, [online, refreshCounts]);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={()=>setSidebarOpen(false)} unread={unread} shortages={shortages}/>
      <div className="main-col">
        <TopBar onMenuOpen={()=>setSidebarOpen(true)} unread={unread}/>
        <SyncBar onSynced={refreshCounts}/>
        <main className="page-body">
          <Outlet context={{ refreshUnread: refreshCounts }}/>
        </main>
        <BottomNav shortages={shortages} onMore={()=>setSidebarOpen(true)}/>
      </div>
    </div>
  );
}
