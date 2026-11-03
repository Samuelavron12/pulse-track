import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useI18n } from '../context/index.jsx';
import { Spinner } from '../components/index.jsx';
import { api, configError } from '../api/client.js';

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO === 'true';

function AuthLogo() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:28 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#34D399,#6366F1)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--ff-display)', fontWeight:800, color:'#fff', fontSize:20 }}>P</div>
      <div>
        <div style={{ fontFamily:'var(--ff-display)', fontWeight:800, fontSize:16 }}>Pulse Track</div>
        <div style={{ fontSize:11.5, color:'var(--text-3)', marginTop:1 }}>Free business manager · stock · sales · suppliers</div>
      </div>
    </div>
  );
}

function ConfigBanner() {
  if (!configError) return null;
  return <div className="auth-err" style={{ marginBottom:14 }}>{configError}</div>;
}

function ForgotPassword({ email }) {
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState(email || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault(); setBusy(true); setMsg('');
    try { const d = await api.post('/auth/forgot-password', { email: addr.trim() }); setMsg(d.message); }
    catch (ex) { setMsg(ex.message); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ textAlign:'center', marginTop:12 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{ background:'none', border:0, color:'var(--text-3)', fontSize:12.5, cursor:'pointer', textDecoration:'underline' }}>Forgot password?</button>
      {open && (
        <form onSubmit={send} style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
          <input className="input" type="email" required value={addr} onChange={e=>setAddr(e.target.value)} placeholder="Your account email" autoCapitalize="none" autoCorrect="off" inputMode="email"/>
          <button className="btn btn-secondary btn-sm" disabled={busy}>Ask the administrator to reset it</button>
          {msg && <div style={{ fontSize:12, color:'var(--text-2)' }}>{msg}</div>}
        </form>
      )}
    </div>
  );
}

export function Login() {
  const { login }    = useAuth();
  const { t }        = useI18n();
  const nav          = useNavigate();
  const [email, setEmail]       = useState(SHOW_DEMO ? 'demo@pulsetrack.app' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  async function submit(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await login(email, password); nav('/'); }
    catch(ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-card-inner">
          <AuthLogo/>
          <h1 style={{ fontSize:26, marginBottom:6 }}>{t('login_title')}</h1>
          <p style={{ color:'var(--text-2)', fontSize:14, marginBottom:28 }}>{t('login_sub')}</p>

          <ConfigBanner/>
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="field">
              <label htmlFor="email">{t('login_email')}</label>
              <input id="email" className="input" type="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email"
                value={email} onChange={e=>setEmail(e.target.value)}/>
            </div>
            <div className="field">
              <label htmlFor="pw">{t('login_password')}</label>
              <input id="pw" className="input" type="password" required autoComplete="current-password"
                value={password} onChange={e=>setPassword(e.target.value)}/>
            </div>
            {err && <div className="auth-err">{err}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop:4 }}>
              {loading ? <Spinner/> : t('login_btn')}
            </button>
          </form>

          {SHOW_DEMO && <p style={{ fontSize:12, color:'var(--text-3)', marginTop:18, textAlign:'center', lineHeight:1.6 }}>{t('login_demo')}</p>}
          <ForgotPassword email={email}/>
          <p style={{ fontSize:13.5, color:'var(--text-2)', marginTop:14, textAlign:'center' }}>
            {t('login_no_acc')}{' '}
            <span style={{ color:'var(--brand)', fontWeight:600, cursor:'pointer' }} onClick={()=>nav('/register')}>
              {t('login_create')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const { t }        = useI18n();
  const nav          = useNavigate();
  const [form, setForm] = useState({ businessName:'', industry:'', ownerName:'', email:'', password:'' });
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  const INDUSTRIES = ['Retail','Pharmacy','Restaurant','Fashion','Electronics','Supermarket','Hardware','Beauty','Service','Wholesale','Other'];

  async function submit(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try { await register(form); nav('/'); }
    catch(ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="auth-card-inner">
          <AuthLogo/>
          <h1 style={{ fontSize:26, marginBottom:6 }}>{t('reg_title')}</h1>
          <p style={{ color:'var(--text-2)', fontSize:14, marginBottom:28 }}>{t('reg_sub')}</p>

          <ConfigBanner/>
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="field">
              <label>{t('reg_biz')}</label>
              <input className="input" required value={form.businessName} onChange={set('businessName')} placeholder="e.g. Adaeze Supermarket"/>
            </div>
            <div className="field">
              <label>{t('reg_industry')}</label>
              <select className="select" value={form.industry} onChange={set('industry')}>
                <option value="">Select your industry…</option>
                {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t('reg_name')}</label>
              <input className="input" required value={form.ownerName} onChange={set('ownerName')} placeholder="Your full name"/>
            </div>
            <div className="field">
              <label>{t('login_email')}</label>
              <input className="input" type="email" required autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" value={form.email} onChange={set('email')}/>
            </div>
            <div className="field">
              <label>{t('login_password')}</label>
              <input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters"/>
            </div>
            {err && <div className="auth-err">{err}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop:6 }}>
              {loading ? <Spinner/> : t('reg_btn')}
            </button>
          </form>

          <p style={{ fontSize:13.5, color:'var(--text-2)', marginTop:16, textAlign:'center' }}>
            {t('reg_have')}{' '}
            <span style={{ color:'var(--brand)', fontWeight:600, cursor:'pointer' }} onClick={()=>nav('/login')}>
              {t('reg_signin')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
