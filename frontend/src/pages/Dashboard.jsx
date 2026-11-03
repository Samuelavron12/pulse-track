import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useI18n, useAuth } from '../context/index.jsx';
import { api } from '../api/client.js';
import { cachedGet } from '../lib/cache.js';
import { StatCard, LoadingBlock, PageHeader, ChartTooltip, EmptyState, fmt, fmtShort } from '../components/index.jsx';
import { IcTrend, IcBox, IcZap, IcChart, IcWarn } from '../components/Icons.jsx';

export default function Dashboard() {
  const { t }    = useI18n();
  const { user } = useAuth();
  const nav      = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tries, setTries]     = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    cachedGet(api, '/dashboard/summary')
      .then(r => { if (alive) setData(r.data); })
      .catch(e => { if (alive) setError(e.message || 'Unknown error'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tries]);

  if (loading) return <LoadingBlock/>;
  if (!data) return (
    <div style={{padding:40,textAlign:'center'}}>
      <div style={{fontWeight:700,marginBottom:6}}>Could not load the dashboard</div>
      <div style={{color:'var(--text-3)',fontSize:13,marginBottom:16}}>{error}</div>
      <button className="btn btn-primary" onClick={()=>setTries(n=>n+1)}>Try again</button>
    </div>
  );

  const name = user?.name?.split(' ')[0] || '';

  return (
    <div>
      <PageHeader title={`${t('dash_greet')}${name ? `, ${name}` : ''}.`}/>

      {/* KPI strip */}
      <div className="g-grid g4 mb-6">
        <StatCard label={t('dash_rev_today')} value={fmt(data.today.rev)} sub={`${data.today.cnt} sale${data.today.cnt!==1?'s':''}`} color="var(--brand)" icon={<IcTrend s={18}/>}/>
        <StatCard label={t('dash_rev_7')}     value={fmt(data.week.rev)}  sub={`${data.week.cnt} transactions`} icon={<IcTrend s={18}/>}/>
        <StatCard label={t('dash_gross_profit')} value={fmt(data.grossProfit30)} sub={`Revenue ${fmt(data.month.rev)}`} color={data.grossProfit30>=0?'var(--brand)':'var(--danger)'} icon={<IcChart s={18}/>}/>
        <StatCard
          label={t('dash_low_stock')}
          value={data.lowStockCount}
          sub={data.lowStockCount>0 ? t('dash_out_n',{n:data.outOfStockCount||0}) : t('short_all_ok')}
          color={data.outOfStockCount>0?'var(--danger)':data.lowStockCount>0?'var(--warning)':undefined}
          icon={<IcBox s={18}/>}
          onClick={()=>nav('/shortages')}
        />
      </div>

      {/* Shortage detection (rule-based: stock at or below reorder level) */}
      {data.topShortages?.length>0 && (
        <div className={`card mb-6 alert-widget${data.outOfStockCount>0?' critical':''}`}>
          <div className="flex justify-between items-center" style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',gap:10}}>
            <div style={{fontFamily:'var(--ff-display)',fontWeight:700,fontSize:14}}><IcWarn s={16}/> {t('dash_shortages')} · {data.lowStockCount}</div>
            <button className="btn btn-primary btn-sm" onClick={()=>nav('/shortages')}>{t('dash_view_all')}</button>
          </div>
          {data.topShortages.map(i=>(
            <div key={i.id} className="short-row">
              <span className={`sev-dot ${i.severity==='out'?'out':'low'}`}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i.name}</div>
                <div style={{fontSize:12,color:'var(--text-3)'}}>{i.supplier_name||t('short_no_supplier')}</div>
              </div>
              <div style={{fontWeight:700,fontSize:13,color:i.severity==='out'?'var(--danger)':'var(--warning)'}}>{i.severity==='out'?t('short_out'):t('short_left',{n:i.qty})}</div>
            </div>
          ))}
        </div>
      )}

      {/* Profit/Loss summary */}
      <div className="g-grid g4 mb-6">
        {[
          { label:'Revenue (30d)',          value:fmt(data.month.rev),       color:'var(--text)' },
          { label:'Cost of Goods (30d)',    value:fmt(data.cogs30),           color:'var(--text-2)' },
          { label:'Operating Expenses (30d)',value:fmt(data.expenses30),      color:'var(--danger)' },
          { label:t('dash_net_profit'),     value:fmt(data.netProfit30),      color:data.netProfit30>=0?'var(--brand)':'var(--danger)' },
        ].map(s=>(
          <div key={s.label} className="card stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:20,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="g-grid g2 mb-6">
        <div className="card card-p">
          <div style={{fontFamily:'var(--ff-display)',fontWeight:700,fontSize:14,marginBottom:16}}>{t('dash_trend')}</div>
          {data.revenueTrend.length===0 ? <EmptyState icon="📈" message="No sales data yet."/> : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={data.revenueTrend} margin={{top:4,right:4,left:-24,bottom:0}}>
                <defs>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--brand)" stopOpacity={0.28}/>
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="day" tickFormatter={fmtShort} tick={{fontSize:10.5,fill:'var(--text-3)'}} tickLine={false} axisLine={false}/>
                <YAxis tickFormatter={v=>fmt(v)} tick={{fontSize:10.5,fill:'var(--text-3)'}} tickLine={false} axisLine={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Area type="monotone" dataKey="rev" stroke="var(--brand)" strokeWidth={2.5} fill="url(#rg)" dot={false} activeDot={{r:5,fill:'var(--brand)'}}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card card-p">
          <div style={{fontFamily:'var(--ff-display)',fontWeight:700,fontSize:14,marginBottom:16}}>{t('dash_top')}</div>
          {data.topProducts.length===0 ? <EmptyState icon="🛒" message="No sales this week yet."/> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data.topProducts} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                <XAxis type="number" tickFormatter={v=>fmt(v)} tick={{fontSize:10,fill:'var(--text-3)'}} tickLine={false} axisLine={false}/>
                <YAxis type="category" dataKey="name" width={110} tick={{fontSize:11,fill:'var(--text-2)'}} tickLine={false} axisLine={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="revenue" fill="var(--brand)" radius={[0,5,5,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Branch Performance */}
      {data.branchPerformance?.length > 1 && (
        <div className="card mb-6">
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',fontFamily:'var(--ff-display)',fontWeight:700,fontSize:14}}>{t('dash_branch')}</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Branch</th><th style={{textAlign:'right'}}>Revenue</th><th style={{textAlign:'right'}}>Profit</th><th style={{textAlign:'right'}}>Sales</th></tr></thead>
              <tbody>
                {data.branchPerformance.map(b=>(
                  <tr key={b.name}>
                    <td style={{fontWeight:600}}>{b.name}</td>
                    <td style={{textAlign:'right',fontWeight:700}}>{fmt(b.rev)}</td>
                    <td style={{textAlign:'right',color:'var(--brand)',fontWeight:600}}>{fmt(b.profit)}</td>
                    <td style={{textAlign:'right',color:'var(--text-2)'}}>{b.cnt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="g-grid g4">
        {[
          {label:'Record a sale',     path:'/pos',      color:'var(--brand)',   icon:'🛍️'},
          {label:t('nav_suppliers'),   path:'/suppliers', color:'var(--accent)',  icon:'🚚'},
          {label:t('nav_analysis'),    path:'/analysis',  color:'var(--info)',    icon:'📊'},
          {label:'View alerts',       path:'/alerts',    color:'var(--warning)', icon:`🔔${data.unreadAlerts>0?` (${data.unreadAlerts})`:''}` },
        ].map(item=>(
          <button key={item.path} className="card card-p" style={{textAlign:'left',cursor:'pointer',display:'flex',alignItems:'center',gap:12,border:'1px solid var(--border)',transition:'all var(--tx)'}} onClick={()=>nav(item.path)}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-s)'; e.currentTarget.style.transform='translateY(-2px)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='';}}>
            <div style={{fontSize:24}}>{item.icon}</div>
            <span style={{fontWeight:600,color:item.color,fontSize:13.5}}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
