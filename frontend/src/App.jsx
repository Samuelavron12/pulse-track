import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, useTheme, I18nProvider } from './context/index.jsx';
import { AppLayout } from './components/index.jsx';
import { Login, Register } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/POS.jsx';
import { Sales, Inventory, Customers, Expenses, Invoices } from './pages/Business.jsx';
import { Analysis, Alerts, Reports, Settings, Team } from './pages/More.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Shortages from './pages/Shortages.jsx';

function RequireAuth({ children }) {
  const { isAuthenticated, loading, bootError, retryBoot } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#34D399,#6366F1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:24, margin:'0 auto 16px', fontFamily:'var(--ff-display)' }}>P</div>
        <div style={{ color:'var(--text-3)', fontSize:13 }}>Loading Pulse Track…</div>
      </div>
    </div>
  );
  if (bootError && !isAuthenticated) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:340 }}>
        <div style={{ fontSize:34, marginBottom:8 }}>📡</div>
        <div style={{ fontWeight:700, marginBottom:6 }}>Can’t reach the server</div>
        <div style={{ color:'var(--text-3)', fontSize:13, marginBottom:16 }}>{bootError}</div>
        <button className="btn btn-primary" onClick={retryBoot}>Try again</button>
      </div>
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace/>;
  return children;
}

function RequireGuest({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/" replace/>;
  return children;
}

// Syncs server-persisted theme into the ThemeProvider
function ThemeSync() {
  const { user } = useAuth();
  const { setMode } = useTheme();
  useEffect(() => { if (user?.theme) setMode(user.theme); }, [user?.theme]);
  return null;
}

export default function App() {
  const { user } = useAuth();
  return (
    <I18nProvider initLang={user?.language}>
      <ThemeSync/>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<RequireGuest><Login/></RequireGuest>}/>
        <Route path="/register" element={<RequireGuest><Register/></RequireGuest>}/>

        {/* Protected — all wrapped in AppLayout (sidebar + topbar) */}
        <Route element={<RequireAuth><AppLayout/></RequireAuth>}>
          <Route index           element={<Dashboard/>}/>
          <Route path="pos"      element={<POS/>}/>
          <Route path="sales"    element={<Sales/>}/>
          <Route path="inventory" element={<Inventory/>}/>
          <Route path="customers" element={<Customers/>}/>
          <Route path="expenses"  element={<Expenses/>}/>
          <Route path="invoices"  element={<Invoices/>}/>
          <Route path="analysis"  element={<Analysis/>}/>
          <Route path="alerts"    element={<Alerts/>}/>
          <Route path="reports"   element={<Reports/>}/>
          <Route path="settings"  element={<Settings/>}/>
          <Route path="team"      element={<Team/>}/>
          <Route path="suppliers" element={<Suppliers/>}/>
          <Route path="shortages" element={<Shortages/>}/>
        </Route>

        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </I18nProvider>
  );
}
