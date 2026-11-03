import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useI18n, useAuth, useTheme, useToast } from '../context/index.jsx';
import { api } from '../api/client.js';
import { getAll, retryFailed, discardFailed } from '../api/offline.js';
import {
  PageHeader, LoadingBlock, EmptyState, Modal, StatCard,
  ChartTooltip, fmt, fmtD, fmtShort,
} from '../components/index.jsx';
import { IcCheck, IcPlus, IcSun, IcMoon, IcMonitor, IcGlobe } from '../components/Icons.jsx';
import { LANGUAGES } from '../context/index.jsx';

const COLORS = ['#10B981','#6366F1','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16'];

// ══════════════════════════════════════════════════════════════════════════
// BUSINESS ANALYSIS — rule-based intelligence, no AI
// ══════════════════════════════════════════════════════════════════════════
export function Analysis() {
  const { t } = useI18n();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/analysis').then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock/>;
  if (!data)   return <EmptyState icon="📊" message="Could not load analysis."/>;

  const INSIGHT_CONFIG = {
    positive: { icon:'📈', bg:'var(--brand-pale)',   border:'rgba(16,185,129,.25)' },
    warning:  { icon:'⚠️',  bg:'var(--warning-pale)', border:'rgba(245,158,11,.25)' },
    info:     { icon:'💡',  bg:'var(--info-pale)',    border:'rgba(59,130,246,.25)' },
  };

  return (
    <div>
      <PageHeader title={t('analysis_title')} subtitle={t('analysis_sub')}/>

      {/* Insights strip */}
      {data.insights?.length > 0 && (
        <div className="mb-6">
          {data.insights.map((ins, i) => {
            const cfg = INSIGHT_CONFIG[ins.type] || INSIGHT_CONFIG.info;
            return (
              <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'13px 16px', borderRadius:'var(--r-md)', marginBottom:10, background:cfg.bg, border:`1px solid ${cfg.border}` }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{cfg.icon}</span>
                <p style={{ fontSize:13.5, lineHeight:1.7, color:'var(--text)' }}>{ins.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Revenue vs previous period */}
      {data.revenueTrend && (
        <div className="g-grid g4 mb-6" style={{ gap:14 }}>
          <StatCard label="Revenue (30 days)"    value={fmt(data.revenueTrend.current)}  trend={data.revenueTrend.changePercent} color="var(--brand)"/>
          <StatCard label="Profit (30 days)"     value={fmt(data.profitTrend.current)}   trend={data.profitTrend.changePercent}  color={data.profitTrend.current>=0?'var(--brand)':'var(--danger)'}/>
          <StatCard label="Avg Transaction"      value={fmt(data.avgTransactionValue)}/>
          <StatCard label="Top Expense Category" value={data.highestExpenseCategory?.category||'—'} sub={data.highestExpenseCategory?fmt(data.highestExpenseCategory.total):undefined}/>
        </div>
      )}

      <div className="g-grid g2 mb-6">
        {/* Best sellers */}
        <div className="card card-p">
          <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>{t('analysis_best')}</div>
          {data.bestSellers.length === 0 ? <EmptyState icon="📦" message="No sales data yet."/> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.bestSellers} layout="vertical" margin={{ top:0, right:10, left:0, bottom:0 }}>
                <XAxis type="number" tickFormatter={v=>fmt(v)} tick={{ fontSize:10, fill:'var(--text-3)' }} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize:11, fill:'var(--text-2)' }} tickLine={false} axisLine={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="rev" name="Revenue" fill="var(--brand)" radius={[0,5,5,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Slow movers */}
        <div className="card card-p">
          <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>{t('analysis_slow')}</div>
          {data.slowMovers.length === 0 ? <EmptyState icon="✅" message="All products are selling."/> : (
            <div>
              {data.slowMovers.map((p,i) => (
                <div key={i} className="flex justify-between items-center" style={{ padding:'9px 0', borderBottom:'1px solid var(--border)', fontSize:13.5 }}>
                  <span style={{ fontWeight:500 }}>{p.name}</span>
                  <span className="badge badge-yellow">{Math.round(p.units)} sold</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="g-grid g2 mb-6">
        {/* Low stock */}
        <div className="card card-p">
          <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>{t('analysis_low_stock')}</div>
          {data.lowStock.length === 0 ? <EmptyState icon="✅" message="Stock levels are healthy."/> : (
            <div>
              {data.lowStock.map((p,i) => (
                <div key={i} className="flex justify-between items-center" style={{ padding:'9px 0', borderBottom:'1px solid var(--border)', fontSize:13.5 }}>
                  <span style={{ fontWeight:500 }}>{p.name}</span>
                  <div className="flex gap-2 items-center">
                    <span style={{ color:'var(--warning)', fontWeight:700 }}>{p.quantity} left</span>
                    <span style={{ color:'var(--text-3)', fontSize:11.5 }}>/ {p.reorder_level} min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top customers */}
        <div className="card card-p">
          <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>{t('analysis_top_cust')}</div>
          {data.topCustomers.length === 0 ? <EmptyState icon="👤" message="No customer purchases yet."/> : (
            <div>
              {data.topCustomers.map((c,i) => (
                <div key={i} className="flex justify-between items-center" style={{ padding:'9px 0', borderBottom:'1px solid var(--border)', fontSize:13.5 }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width:26, height:26, borderRadius:'50%', background:`linear-gradient(135deg,var(--brand-lite),var(--accent))`, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontWeight:600 }}>{c.name}</span>
                  </div>
                  <span style={{ fontWeight:700, color:'var(--brand)' }}>{fmt(c.spent)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inactive customers */}
      {data.inactiveCustomers.length > 0 && (
        <div className="card card-p">
          <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>{t('analysis_inactive')}</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Phone</th><th style={{ textAlign:'right' }}>Total Spent</th></tr></thead>
              <tbody>
                {data.inactiveCustomers.map(c => (
                  <tr key={c.name}>
                    <td style={{ fontWeight:600 }}>{c.name}</td>
                    <td style={{ color:'var(--text-2)' }}>{c.phone||'—'}</td>
                    <td style={{ textAlign:'right', fontWeight:700 }}>{fmt(c.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ALERTS
// ══════════════════════════════════════════════════════════════════════════
const SEV_STYLE = {
  info:     { border:'var(--info)',    icon:'💡' },
  warning:  { border:'var(--warning)', icon:'⚠️' },
  critical: { border:'var(--danger)',  icon:'🚨' },
};
const TYPE_ICON = { low_stock:'📦', out_of_stock:'🚫', sync_conflict:'🔄', inactive_customer:'👤', overdue_invoice:'💰', anomaly:'⚡' };

export function Alerts() {
  const { t } = useI18n(); const { push } = useToast();
  const nav = useNavigate();
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/alerts').then(d => setAlerts(d.alerts)).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const unread = alerts.filter(a => !a.is_read);

  async function markRead(id) {
    await api.patch(`/alerts/${id}/read`, {});
    setAlerts(prev => prev.map(a => a.id===id ? {...a, is_read:true} : a));
  }

  async function markAllRead() {
    await api.post('/alerts/read-all', {});
    setAlerts(prev => prev.map(a => ({...a, is_read:true})));
    push('All alerts marked as read.');
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('alerts_title')}</h1>
        {unread.length > 0 && (
          <button className="btn btn-secondary" onClick={markAllRead}>
            <IcCheck s={15}/> {t('alerts_mark_all')}
          </button>
        )}
      </div>

      {loading ? <LoadingBlock/> : alerts.length === 0 ? (
        <div className="card card-p"><EmptyState icon="✅" message={t('alerts_empty')}/></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {alerts.map(a => {
            const sev = SEV_STYLE[a.severity] || SEV_STYLE.info;
            return (
              <div key={a.id} className="card" style={{ borderLeft:`3px solid ${sev.border}`, opacity:a.is_read?0.65:1, transition:'opacity 200ms' }}>
                <div style={{ padding:'14px 18px', display:'flex', gap:12, alignItems:'flex-start', justifyContent:'space-between' }}>
                  <div style={{ flex:1 }}>
                    <div className="flex items-center gap-2" style={{ marginBottom:5, flexWrap:'wrap' }}>
                      <span>{TYPE_ICON[a.type]||sev.icon}</span>
                      <span style={{ fontWeight:700, fontSize:14.5 }}>{a.title}</span>
                      {!a.is_read && <span className="badge badge-yellow">New</span>}
                    </div>
                    <p style={{ fontSize:13.5, color:'var(--text-2)', lineHeight:1.65 }}>{a.message}</p>
                    <p style={{ fontSize:11.5, color:'var(--text-3)', marginTop:5 }}>{fmtD(a.created_at)}</p>
                    {(a.type==='low_stock'||a.type==='out_of_stock') && <button className="btn btn-secondary btn-sm" style={{ marginTop:8 }} onClick={()=>nav('/shortages')}>{t('nav_shortages')} →</button>}
                  </div>
                  {!a.is_read && (
                    <button className="btn btn-ghost btn-sm" style={{ flexShrink:0 }} onClick={()=>markRead(a.id)}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════════
export function Reports() {
  const { t } = useI18n();
  const def = () => ({ from: new Date(Date.now()-30*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) });
  const [range, setRange]     = useState(def());
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/reports/sales?from=${range.from}T00:00:00Z&to=${range.to}T23:59:59Z`),
      api.get(`/dashboard/reports/expenses?from=${range.from}T00:00:00Z&to=${range.to}T23:59:59Z`),
      api.get(`/dashboard/reports/profit-loss?from=${range.from}T00:00:00Z&to=${range.to}T23:59:59Z`),
    ]).then(([s,e,pl]) => setData({s,e,pl})).catch(()=>{}).finally(()=>setLoading(false));
  }, [range]);

  useEffect(()=>load(),[load]);

  const QUICK = [
    { label:'Today',     from:new Date().toISOString().slice(0,10), to:new Date().toISOString().slice(0,10) },
    { label:'7 days',    from:new Date(Date.now()-7*864e5).toISOString().slice(0,10),  to:new Date().toISOString().slice(0,10) },
    { label:'30 days',   from:new Date(Date.now()-30*864e5).toISOString().slice(0,10), to:new Date().toISOString().slice(0,10) },
    { label:'90 days',   from:new Date(Date.now()-90*864e5).toISOString().slice(0,10), to:new Date().toISOString().slice(0,10) },
    { label:'This year', from:`${new Date().getFullYear()}-01-01`, to:new Date().toISOString().slice(0,10) },
  ];

  // Group daily sales for area chart
  const daily = data ? (() => {
    const m = {};
    for (const s of data.s.sales) {
      const d = s.created_at?.slice(0,10)||'';
      m[d] = (m[d]||0) + Number(s.total_amount);
    }
    return Object.entries(m).sort().map(([day,rev])=>({day,rev}));
  })() : [];

  return (
    <div>
      <PageHeader title={t('reports_title')}/>

      {/* Range controls */}
      <div className="card card-p mb-6">
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div className="field" style={{ margin:0 }}>
            <label>{t('reports_from')}</label>
            <input className="input" type="date" value={range.from} onChange={e=>setRange(r=>({...r,from:e.target.value}))} style={{ width:'auto' }}/>
          </div>
          <div className="field" style={{ margin:0 }}>
            <label>{t('reports_to')}</label>
            <input className="input" type="date" value={range.to}   onChange={e=>setRange(r=>({...r,to:e.target.value}))}   style={{ width:'auto' }}/>
          </div>
          <button className="btn btn-primary btn-sm" onClick={load} style={{ marginBottom:0 }}>Apply</button>
          <div className="flex gap-2" style={{ flexWrap:'wrap' }}>
            {QUICK.map(q=>(
              <button key={q.label} className="btn btn-secondary btn-sm" onClick={()=>setRange({from:q.from,to:q.to})}>{q.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <LoadingBlock/> : !data ? null : (
        <>
          {/* P&L Summary */}
          <div className="g-grid g4 mb-6" style={{ gap:14 }}>
            {[
              ['Revenue',          data.pl.revenue,          'var(--text)'],
              ['Cost of Goods',    data.pl.cogs,             'var(--text-2)'],
              ['Gross Profit',     data.pl.grossProfit,      data.pl.grossProfit>=0?'var(--brand)':'var(--danger)'],
              ['Operating Expenses',data.pl.operatingExpenses,'var(--danger)'],
            ].map(([l,v,c])=>(
              <div key={l} className="card stat-card">
                <div className="stat-label">{l}</div>
                <div className="stat-value" style={{ fontSize:20, color:c }}>{fmt(v)}</div>
              </div>
            ))}
          </div>
          {/* Net profit banner */}
          <div className="card card-p mb-6 flex justify-between items-center" style={{ flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:16 }}>Net Profit</div>
              <div style={{ fontSize:13, color:'var(--text-2)', marginTop:3 }}>Gross Profit − Operating Expenses</div>
            </div>
            <div style={{ fontFamily:'var(--ff-display)', fontWeight:800, fontSize:32, color:data.pl.netProfit>=0?'var(--brand)':'var(--danger)' }}>
              {fmt(data.pl.netProfit)}
            </div>
          </div>

          <div className="g-grid g2 mb-6">
            {/* Daily sales area chart */}
            <div className="card card-p">
              <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:16 }}>{t('reports_sales')}</div>
              {daily.length===0 ? <EmptyState icon="📈" message="No sales in this period."/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={daily} margin={{ top:4, right:4, left:-24, bottom:0 }}>
                    <defs>
                      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--brand)" stopOpacity={0.28}/>
                        <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="day" tickFormatter={fmtShort} tick={{ fontSize:10.5, fill:'var(--text-3)' }} tickLine={false} axisLine={false}/>
                    <YAxis tickFormatter={v=>fmt(v)} tick={{ fontSize:10, fill:'var(--text-3)' }} tickLine={false} axisLine={false}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Area type="monotone" dataKey="rev" stroke="var(--brand)" strokeWidth={2.5} fill="url(#ag)" dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Expense pie chart */}
            <div className="card card-p">
              <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:16 }}>{t('reports_expenses')}</div>
              {data.e.byCategory.length===0 ? <EmptyState icon="💸" message="No expenses in this period."/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.e.byCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                      {data.e.byCategory.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={v=>[fmt(v)]} contentStyle={{ background:'var(--bg-el)', border:'1px solid var(--border)', borderRadius:10, fontSize:12.5 }}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Payment method breakdown */}
          {data.s.byPaymentMethod?.length > 0 && (
            <div className="card card-p mb-6">
              <div style={{ fontFamily:'var(--ff-display)', fontWeight:700, fontSize:14, marginBottom:14 }}>Sales by Payment Method</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {data.s.byPaymentMethod.map(m=>(
                  <div key={m.payment_method} style={{ flex:'1 1 150px', background:'var(--bg-alt)', borderRadius:'var(--r-md)', padding:'12px 14px' }}>
                    <div style={{ fontWeight:700, textTransform:'capitalize', marginBottom:4 }}>{m.payment_method}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:'var(--brand)', fontFamily:'var(--ff-display)' }}>{fmt(m.total)}</div>
                    <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{m.cnt} sales</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales table */}
          {data.s.sales.length > 0 && (
            <div className="card">
              <div style={{ padding:'13px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13.5, display:'flex', justifyContent:'space-between' }}>
                <span>Sales ({data.s.totals.cnt})</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>api.download(`/sales/export?from=${range.from}&to=${range.to}`,`sales-report.csv`)}>
                  Export CSV
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Customer</th><th>Branch</th><th style={{ textAlign:'right' }}>Revenue</th><th style={{ textAlign:'right' }}>Profit</th></tr></thead>
                  <tbody>
                    {data.s.sales.slice(0,100).map(s=>(
                      <tr key={s.id}>
                        <td style={{ fontSize:12.5, color:'var(--text-2)', whiteSpace:'nowrap' }}>{fmtD(s.created_at)}</td>
                        <td>{s.cname||<span style={{ color:'var(--text-3)' }}>Walk-in</span>}</td>
                        <td style={{ color:'var(--text-2)', fontSize:12.5 }}>{s.bname||'—'}</td>
                        <td style={{ textAlign:'right', fontWeight:700 }}>{fmt(s.total_amount)}</td>
                        <td style={{ textAlign:'right', fontWeight:600, color:Number(s.profit)>=0?'var(--brand)':'var(--danger)' }}>{fmt(s.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════
export function Settings() {
  const { t, lang, setLang, languages } = useI18n();
  const { mode, setMode }               = useTheme();
  const { user, business, updateSettings, logout } = useAuth();
  const { push }                        = useToast();
  const [name, setName]                 = useState(user?.name||'');
  const [curPw, setCurPw]               = useState('');
  const [newPw, setNewPw]               = useState('');
  const [saving, setSaving]             = useState(false);
  const [pwSaving, setPwSaving]         = useState(false);

  const changeTheme = async m => { setMode(m); try { await updateSettings({theme:m}); } catch {} };
  const changeLang  = async l => { setLang(l);  try { await updateSettings({language:l}); } catch {} };

  async function saveName(e) {
    e.preventDefault(); setSaving(true);
    try { await updateSettings({name}); push(t('settings_saved')); }
    catch(ex) { push(ex.message,'error'); }
    finally { setSaving(false); }
  }

  async function savePw(e) {
    e.preventDefault(); setPwSaving(true);
    try {
      await api.patch('/auth/me/password', { current:curPw, newPassword:newPw });
      push('Password changed successfully.'); setCurPw(''); setNewPw('');
    } catch(ex) { push(ex.message,'error'); }
    finally { setPwSaving(false); }
  }

  const Section = ({ title, children }) => (
    <div className="mb-6">
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-3)', marginBottom:12 }}>{title}</div>
      <div className="card">{children}</div>
    </div>
  );

  const SettingRow = ({ label, desc, children }) => (
    <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:20, flexWrap:'wrap' }}>
      <div style={{ minWidth:180 }}>
        <div style={{ fontWeight:600, fontSize:14 }}>{label}</div>
        {desc && <div style={{ fontSize:12.5, color:'var(--text-3)', marginTop:2, lineHeight:1.5 }}>{desc}</div>}
      </div>
      <div style={{ flex:'1 1 300px', maxWidth:400 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth:740 }}>
      <PageHeader title={t('settings_title')}/>

      <Section title={t('settings_appearance')}>
        <SettingRow label={t('settings_theme')} desc="Applied immediately and synced across devices.">
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[['light',<IcSun s={15}/>,t('settings_light')],['dark',<IcMoon s={15}/>,t('settings_dark')],['system',<IcMonitor s={15}/>,t('settings_system')]].map(([v,ic,l])=>(
              <button key={v} onClick={()=>changeTheme(v)} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', border:`1.5px solid ${mode===v?'var(--brand)':'var(--border)'}`, borderRadius:'var(--r-sm)', background:mode===v?'var(--brand-pale)':'var(--bg-input)', color:mode===v?'var(--brand)':'var(--text-2)', fontWeight:mode===v?700:500, fontSize:13.5, cursor:'pointer', transition:'all var(--tx)' }}>
                {ic} {l}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title={t('settings_language')}>
        <SettingRow label={t('settings_language')} desc="Changes all labels and text in Pulse Track.">
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {languages.map(l=>(
              <button key={l.code} onClick={()=>changeLang(l.code)} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:`1.5px solid ${lang===l.code?'var(--brand)':'var(--border)'}`, borderRadius:'var(--r-sm)', background:lang===l.code?'var(--brand-pale)':'var(--bg-input)', color:lang===l.code?'var(--brand)':'var(--text)', fontWeight:lang===l.code?700:400, fontSize:14, cursor:'pointer', transition:'all var(--tx)', textAlign:'left' }}>
                <span style={{ fontSize:18 }}>{l.flag}</span>
                {l.label}
                {lang===l.code && <IcCheck s={15} style={{ marginLeft:'auto', color:'var(--brand)' }}/>}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title={t('settings_account')}>
        <SettingRow label={t('settings_name')} desc="Shown in the sidebar and on receipts.">
          <form onSubmit={saveName} style={{ display:'flex', gap:8 }}>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} style={{ flex:1 }}/>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':t('save')}</button>
          </form>
        </SettingRow>
        <SettingRow label="Email"><span style={{ color:'var(--text-2)', fontSize:14 }}>{user?.email}</span></SettingRow>
        <SettingRow label="Role"><span className="badge badge-blue" style={{ textTransform:'capitalize' }}>{user?.role}</span></SettingRow>
      </Section>

      <Section title="Business">
        <SettingRow label="Business name"><span style={{ fontWeight:600 }}>{business?.name}</span></SettingRow>
        <SettingRow label="Pulse Track"><span className="badge badge-green">{t('free_badge')}</span></SettingRow>
        <SettingRow label="Currency"><span style={{ color:'var(--text-2)' }}>{business?.currency||'NGN'} (₦)</span></SettingRow>
      </Section>

      <SyncSection t={t} push={push}/>

      <Section title={t('nav_logout')}>
        <div style={{ padding:'16px 20px' }}>
          <button className="btn btn-secondary" onClick={logout}>{t('nav_logout')}</button>
        </div>
      </Section>


      <Section title={t('set_about')}>
        <div style={{ padding:'16px 20px', fontSize:13.5, color:'var(--text-2)', lineHeight:1.7 }}>
          <div style={{ fontWeight:700, color:'var(--text)', marginBottom:4 }}>Pulse Track v4.0</div>
          {t('set_free')}
          <div style={{ marginTop:8, fontSize:12.5, color:'var(--text-3)' }}>MIT licence · your data stays in your own database.</div>
        </div>
      </Section>

      <Section title={t('settings_password')}>
        <div style={{ padding:'16px 20px' }}>
          <form onSubmit={savePw} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="field"><label>Current password</label><input className="input" type="password" required value={curPw} onChange={e=>setCurPw(e.target.value)}/></div>
            <div className="field"><label>New password (min 8 characters)</label><input className="input" type="password" required minLength={8} value={newPw} onChange={e=>setNewPw(e.target.value)}/></div>
            <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf:'flex-start' }} disabled={pwSaving}>{pwSaving?'Saving…':'Change password'}</button>
          </form>
        </div>
      </Section>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
const ROLE_BADGE = { owner:'badge-purple', manager:'badge-blue', staff:'badge-gray', accountant:'badge-green' };

export function Team() {
  const { t } = useI18n(); const { push } = useToast(); const { user } = useAuth();
  const [members, setMembers] = useState([]); const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false); const [form, setForm] = useState({ name:'', email:'', password:'', role:'staff', phone:'' });
  const [saving, setSaving]   = useState(false); const [err, setErr] = useState('');
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  useEffect(()=>{ api.get('/team').then(d=>setMembers(d.users)).catch(()=>{}).finally(()=>setLoading(false)); },[]);

  async function handleAdd(e) {
    e.preventDefault(); setErr(''); setSaving(true);
    try { const d=await api.post('/team',form); setMembers(m=>[...m,d.user]); setShowAdd(false); setForm({name:'',email:'',password:'',role:'staff',phone:''}); push('Team member added.'); }
    catch(ex){ setErr(ex.message); } finally{ setSaving(false); }
  }

  async function toggleActive(m) {
    try { await api.patch(`/team/${m.id}`,{is_active:!m.is_active}); setMembers(prev=>prev.map(x=>x.id===m.id?{...x,is_active:!m.is_active}:x)); push(m.is_active?'Deactivated.':'Reactivated.'); }
    catch(ex){ push(ex.message,'error'); }
  }

  async function changeRole(m, role) {
    try { await api.patch(`/team/${m.id}`,{role}); setMembers(prev=>prev.map(x=>x.id===m.id?{...x,role}:x)); push('Role updated.'); }
    catch(ex){ push(ex.message,'error'); }
  }

  return (
    <div>
      <PageHeader title={t('team_title')}>
        {['owner','manager'].includes(user?.role) && (
          <button className="btn btn-primary" onClick={()=>setShowAdd(true)}><IcPlus s={16}/> {t('team_new')}</button>
        )}
      </PageHeader>

      <div className="card">
        {loading ? <LoadingBlock/> : members.length===0 ? <EmptyState icon="👥" message={t('team_empty')}/> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
              <tbody>
                {members.map(m=>(
                  <tr key={m.id}>
                    <td style={{ fontWeight:600 }}>{m.name}{m.id===user?.id && <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:6 }}>(you)</span>}</td>
                    <td style={{ color:'var(--text-2)', fontSize:12.5 }}>{m.email}</td>
                    <td style={{ color:'var(--text-2)' }}>{m.phone||'—'}</td>
                    <td>
                      {user?.role==='owner' && m.id!==user?.id ? (
                        <select className="select" value={m.role} onChange={e=>changeRole(m,e.target.value)} style={{ width:'auto', padding:'4px 8px', fontSize:12 }}>
                          {['manager','staff','accountant'].map(r=><option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}
                        </select>
                      ) : <span className={`badge ${ROLE_BADGE[m.role]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{m.role}</span>}
                    </td>
                    <td><span className={`badge ${m.is_active?'badge-green':'badge-red'}`}>{m.is_active?'Active':'Inactive'}</span></td>
                    <td style={{ color:'var(--text-3)', fontSize:12.5 }}>{m.last_login_at?fmtD(m.last_login_at):'Never'}</td>
                    <td>
                      {user?.role==='owner' && m.id!==user?.id && (
                        <button className={`btn btn-sm ${m.is_active?'btn-danger':'btn-secondary'}`} onClick={()=>toggleActive(m)}>
                          {m.is_active?'Deactivate':'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title={t('team_new')} onClose={()=>setShowAdd(false)}>
          <form onSubmit={handleAdd} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="field"><label>{t('team_name')}</label><input className="input" required value={form.name} onChange={set('name')}/></div>
            <div className="field"><label>{t('team_email')}</label><input className="input" type="email" required value={form.email} onChange={set('email')}/></div>
            <div className="field"><label>{t('team_phone')}</label><input className="input" type="tel" value={form.phone} onChange={set('phone')}/></div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="field"><label>{t('team_role')}</label><select className="select" value={form.role} onChange={set('role')}>{['manager','staff','accountant'].map(r=><option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}</select></div>
              <div className="field"><label>{t('team_password')}</label><input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')}/></div>
            </div>
            {err && <div style={{ color:'var(--danger)', fontSize:13 }}>{err}</div>}
            <div className="flex gap-3 justify-end">
              <button type="button" className="btn btn-secondary" onClick={()=>setShowAdd(false)}>{t('cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Adding…':t('team_save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}


function SyncSection({ t, push }) {
  const [items, setItems] = useState([]);
  const load = useCallback(() => { getAll().then(setItems).catch(()=>{}); }, []);
  useEffect(() => { load(); window.addEventListener('pt-queue-changed', load); return () => window.removeEventListener('pt-queue-changed', load); }, [load]);
  const pending = items.filter(i=>i.status==='pending'), failed = items.filter(i=>i.status==='failed');
  if (!pending.length && !failed.length) return null;
  return (
    <div className="mb-6">
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--text-3)', marginBottom:12 }}>Offline sync</div>
      <div className="card card-p">
        {pending.length>0 && <div style={{ fontSize:14, marginBottom:8 }}>{t('sync_pending',{n:pending.length})}</div>}
        {failed.map(f=>(
          <div key={f.offlineId} style={{ background:'var(--danger-pale)', borderLeft:'3px solid var(--danger)', padding:'8px 12px', borderRadius:'var(--r-sm)', marginBottom:6, fontSize:13 }}>
            <strong>{f.type}</strong> · {new Date(f.createdAt).toLocaleString()}<br/>{f.error}
          </div>
        ))}
        {failed.length>0 && (
          <div className="flex gap-2" style={{ marginTop:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={async()=>{ await retryFailed(); push('Retrying…','info'); }}>Retry</button>
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} onClick={async()=>{ if(confirm('Discard records that could not sync?')) { await discardFailed(); load(); } }}>Discard</button>
          </div>
        )}
      </div>
    </div>
  );
}
