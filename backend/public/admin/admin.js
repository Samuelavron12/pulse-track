// Pulse Track — Master Admin (no build step; plain JS so it works from the backend alone)
(() => {
'use strict';
const API = location.pathname.replace(/\/admin\/?.*$/, '') + '/admin/api';
const TK = 'pt-admin-token';
let token = null; try { token = sessionStorage.getItem(TK); } catch {}
let me = null, tab = 'overview', badge = { requests: 0, tickets: 0 };
const app = document.getElementById('app');

// ── helpers ───────────────────────────────────────────────────────────────
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); };
const fmtN = n => Number(n || 0).toLocaleString();
const fmtD = d => d ? new Date(d).toLocaleString() : '—';
const dur = s => s > 86400 ? Math.floor(s / 86400) + 'd ' + Math.floor(s % 86400 / 3600) + 'h' : s > 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm' : Math.floor(s / 60) + 'm';
function toast(msg) { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), 3200); }

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch { throw new Error('Cannot reach the server. Check your internet and try again.'); }
  let data = {}; try { data = await res.json(); } catch {}
  if (res.status === 401 && token && data.code === 'TOKEN_INVALID') { logout(); throw new Error('Session expired. Please sign in again.'); }
  if (!res.ok) throw new Error(data.error || ('Server error (' + res.status + ')'));
  return data;
}
function logout() { token = null; me = null; try { sessionStorage.removeItem(TK); } catch {} render(); }

// ── login ─────────────────────────────────────────────────────────────────
function renderLogin(msg) {
  clear(app);
  const err = h('div', { class: 'err' }, msg || '');
  const email = h('input', { type: 'email', autocomplete: 'username', autocapitalize: 'none', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try {
      const d = await api('/login', { method: 'POST', body: { email: email.value.trim(), password: pw.value } });
      token = d.token; me = d.admin; try { sessionStorage.setItem(TK, token); } catch {}
      render();
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  } }, h('h2', {}, 'Pulse Track'), h('div', { class: 'muted' }, 'Master admin sign-in'),
    h('label', {}, 'Email', email), h('label', {}, 'Password', pw), err, btn);
  app.append(h('div', { class: 'login' }, form));
  email.focus();
}

// ── shell ─────────────────────────────────────────────────────────────────
const TABS = [['overview', 'Overview'], ['database', 'Database'], ['users', 'Users'], ['businesses', 'Businesses'], ['requests', 'Requests'], ['errors', 'Errors'], ['account', 'Account']];
let content;
async function render() {
  if (!token) return renderLogin();
  clear(app);
  if (!me) { try { me = (await api('/me')).admin; } catch (e) { return renderLogin(e.message); } }
  const tabs = h('div', { class: 'tabs' }, TABS.map(([id, label]) => h('button', { class: 'tab' + (tab === id ? ' on' : ''), onclick: () => { tab = id; render(); } },
    label, id === 'requests' && badge.requests + badge.tickets > 0 ? h('span', { class: 'n' }, badge.requests + badge.tickets) : null)));
  app.append(h('div', { class: 'top' }, h('b', {}, 'Pulse Track · Admin'), tabs, h('span', { class: 'sp' }), h('span', { class: 'muted' }, me.email), h('button', { class: 'btn ghost small', onclick: logout }, 'Sign out')));
  content = h('main'); app.append(content);
  try { await views[tab](); } catch (e) { content.append(h('div', { class: 'card err' }, e.message, ' ', h('button', { class: 'btn small ghost', onclick: render }, 'Retry'))); }
}

function table(cols, rows, onClick) {
  const t = h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c.label)))),
    h('tbody', {}, rows.map(r => h('tr', { class: onClick ? 'click' : '', onclick: onClick ? () => onClick(r) : null }, cols.map(c => h('td', { title: c.title ? c.title(r) : null }, c.render ? c.render(r) : (r[c.key] ?? '—')))))));
  return h('div', { class: 'tablewrap' }, t);
}
const pill = (text, kind) => h('span', { class: 'pill ' + (kind || '') }, text);

// ── charts (inline SVG built via DOM — no libraries) ──────────────────────
function bars(points, w = 560, hgt = 150) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`); svg.setAttribute('width', '100%'); svg.setAttribute('role', 'img');
  const max = Math.max(1, ...points.map(p => p.v)), bw = (w - 30) / Math.max(points.length, 1);
  points.forEach((p, i) => {
    const bh = Math.round((hgt - 28) * p.v / max);
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', 28 + i * bw + 1); r.setAttribute('y', hgt - 18 - bh); r.setAttribute('width', Math.max(bw - 2, 1)); r.setAttribute('height', Math.max(bh, p.v ? 1 : 0)); r.setAttribute('rx', 2);
    r.setAttribute('fill', p.bad ? 'var(--bad)' : 'var(--brand)');
    const tt = document.createElementNS(NS, 'title'); tt.textContent = p.label + ': ' + p.v; r.append(tt); svg.append(r);
  });
  [[0, hgt - 18], [max, 10]].forEach(([v, y]) => { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 0); t.setAttribute('y', y); t.textContent = fmtN(v); svg.append(t); });
  if (points.length) { [0, points.length - 1].forEach(i => { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', 28 + i * bw); t.setAttribute('y', hgt - 4); t.setAttribute('text-anchor', i ? 'end' : 'start'); t.textContent = points[i].short; svg.append(t); }); }
  return svg;
}

// ── views ─────────────────────────────────────────────────────────────────
const views = {
  async overview() {
    const d = await api('/overview'); badge = { requests: d.totals.passwordRequests, tickets: d.totals.openTickets };
    const stat = (v, l, kind) => h('div', { class: 'card stat' }, h('div', { class: 'v', style: kind === 'bad' && v > 0 ? 'color:var(--bad)' : null }, v), h('div', { class: 'l' }, l));
    content.append(
      h('div', { class: 'grid' },
        stat(fmtN(d.totals.businesses), 'Businesses'), stat(fmtN(d.totals.users), 'Users'), stat(fmtN(d.totals.activeUsers24h), 'Signed in (24h)'),
        stat(fmtN(d.traffic24h.requests), 'Requests (24h)'), stat(d.traffic24h.avg_ms + ' ms', 'Avg response (24h)'), stat(fmtN(d.errors24h), 'Server errors (24h)', 'bad'),
        stat(fmtN(d.totals.sales), 'Sales recorded'), stat(fmtN(d.totals.passwordRequests + d.totals.openTickets), 'Open requests', 'bad')),
      h('div', { class: 'two' },
        h('div', { class: 'card' }, h('h3', {}, 'Traffic — last 48 hours'), h('div', { class: 'muted' }, 'Requests per hour (red = hours with server errors)'),
          bars(d.trafficHourly.map(x => ({ v: x.requests, bad: x.errors > 0, label: new Date(x.hour).toLocaleString(), short: new Date(x.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })))),
        h('div', { class: 'card' }, h('h3', {}, 'Server'), h('table', {}, h('tbody', {}, [
          ['Status', pill('Online', 'ok')], ['Uptime', dur(d.server.uptimeSec)], ['Database latency', d.server.dbPingMs + ' ms'], ['Database size', d.server.dbSizeMb + ' MB'],
          ['Memory', d.server.memoryMb + ' MB'], ['Node', d.server.node], ['Environment', d.server.env]].map(([k, v]) => h('tr', {}, h('td', { class: 'muted' }, k), h('td', {}, v))))))),
      h('h3', { style: 'margin:16px 0 8px' }, 'Busiest endpoints (today & yesterday)'),
      table([{ label: 'Method', key: 'method' }, { label: 'Path', key: 'path' }, { label: 'Requests', render: r => fmtN(r.requests) }, { label: 'Errors', render: r => r.errors ? pill(r.errors, 'bad') : '0' }, { label: 'Avg ms', key: 'avg_ms' }], d.topPaths));
    if (!d.topPaths.length) content.append(h('p', { class: 'muted' }, 'No traffic recorded yet — numbers appear as people use the app.'));
  },

  async database() {
    const d = await api('/db/tables');
    const holder = h('div');
    content.append(h('div', { class: 'row' }, h('h3', {}, 'Database tables'), h('span', { class: 'muted' }, 'Read-only view. Password columns are hidden.')),
      table([{ label: 'Table', key: 'name' }, { label: 'Rows', render: r => fmtN(r.rows) }], d.tables, r => openTable(r.name)), holder);
    async function openTable(name, offset = 0, q = '') {
      clear(holder);
      const t = await api('/db/tables/' + encodeURIComponent(name) + '?offset=' + offset + '&limit=50' + (q ? '&q=' + encodeURIComponent(q) : ''));
      const search = h('input', { type: 'search', placeholder: 'Search this table…', value: q, onkeydown: e => { if (e.key === 'Enter') openTable(name, 0, search.value.trim()).catch(x => toast(x.message)); } });
      holder.append(h('h3', { style: 'margin:18px 0 8px' }, name, ' ', h('span', { class: 'muted' }, '(' + fmtN(t.total) + ' rows)')),
        h('div', { class: 'row' }, search,
          h('button', { class: 'btn small ghost', disabled: offset === 0, onclick: () => openTable(name, Math.max(0, offset - 50), q) }, '← Prev'),
          h('span', { class: 'muted' }, t.total ? (offset + 1) + '–' + Math.min(offset + 50, t.total) + ' of ' + fmtN(t.total) : 'No rows'),
          h('button', { class: 'btn small ghost', disabled: offset + 50 >= t.total, onclick: () => openTable(name, offset + 50, q) }, 'Next →')),
        table(t.columns.map(c => ({ label: c.column_name, title: r => String(r[c.column_name] ?? ''), render: r => { const v = r[c.column_name]; return v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); } })), t.rows));
      holder.scrollIntoView({ behavior: 'smooth' });
    }
  },

  async users() {
    const list = h('div'); const q = h('input', { type: 'search', placeholder: 'Search name, email or business…', onkeydown: e => { if (e.key === 'Enter') load(); } });
    content.append(h('div', { class: 'row' }, q, h('button', { class: 'btn small', onclick: load }, 'Search')), list);
    async function load() {
      const d = await api('/users?q=' + encodeURIComponent(q.value.trim())); clear(list);
      list.append(table([{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Business', key: 'business' }, { label: 'Role', key: 'role' },
        { label: 'Status', render: r => r.is_active ? pill('Active', 'ok') : pill('Disabled', 'bad') }, { label: 'Last login', render: r => fmtD(r.last_login_at) },
        { label: '', render: r => h('span', {}, h('button', { class: 'btn small', onclick: () => resetModal(r) }, 'Reset password'), ' ',
          h('button', { class: 'btn small ghost', onclick: async () => { try { await api('/users/' + r.id + '/active', { method: 'POST', body: { active: !r.is_active } }); load(); } catch (e) { toast(e.message); } } }, r.is_active ? 'Disable' : 'Enable')) }], d.users));
      if (!d.users.length) list.append(h('p', { class: 'muted' }, 'No users found.'));
    }
    await load();
  },

  async businesses() {
    const list = h('div'); const q = h('input', { type: 'search', placeholder: 'Search business name…', onkeydown: e => { if (e.key === 'Enter') load(); } });
    content.append(h('div', { class: 'row' }, q, h('button', { class: 'btn small', onclick: load }, 'Search')), list);
    async function load() {
      const d = await api('/businesses?q=' + encodeURIComponent(q.value.trim())); clear(list);
      list.append(table([{ label: 'Business', key: 'name' }, { label: 'Industry', key: 'industry' }, { label: 'Users', key: 'users' }, { label: 'Products', key: 'products' }, { label: 'Sales', key: 'sales' },
        { label: 'Revenue', render: r => '₦' + fmtN(Math.round(r.revenue)) }, { label: 'Created', render: r => fmtD(r.created_at) },
        { label: 'Status', render: r => r.is_active ? pill('Active', 'ok') : pill('Suspended', 'bad') },
        { label: '', render: r => h('button', { class: 'btn small ghost', onclick: async () => { if (r.is_active && !confirm('Suspend ' + r.name + '? Its users will be unable to sign in.')) return; try { await api('/businesses/' + r.id + '/active', { method: 'POST', body: { active: !r.is_active } }); load(); } catch (e) { toast(e.message); } } }, r.is_active ? 'Suspend' : 'Reactivate') }], d.businesses));
    }
    await load();
  },

  async requests() {
    const [pr, tk] = await Promise.all([api('/password-requests'), api('/tickets')]);
    badge = { requests: pr.requests.filter(r => r.status === 'open').length, tickets: tk.tickets.filter(t => t.status !== 'resolved').length };
    content.append(h('h3', { style: 'margin-bottom:8px' }, 'Password reset requests'),
      table([{ label: 'Email', key: 'email' }, { label: 'Note', key: 'note' }, { label: 'Requested', render: r => fmtD(r.created_at) }, { label: 'Status', render: r => pill(r.status, r.status === 'open' ? 'warn' : '') },
        { label: '', render: r => r.status !== 'open' ? '' : h('span', {}, r.user_id ? h('button', { class: 'btn small', onclick: () => resetModal({ id: r.user_id, email: r.email }) }, 'Reset password') : pill('No such user'), ' ',
          h('button', { class: 'btn small ghost', onclick: async () => { await api('/password-requests/' + r.id + '/dismiss', { method: 'POST' }); render(); } }, 'Dismiss')) }], pr.requests),
      h('h3', { style: 'margin:18px 0 8px' }, 'Support tickets'),
      table([{ label: 'Business', key: 'business' }, { label: 'From', render: r => (r.uname || '') + (r.uemail ? ' · ' + r.uemail : '') }, { label: 'Subject', key: 'subject' }, { label: 'Message', key: 'message', title: r => r.message }, { label: 'Date', render: r => fmtD(r.created_at) },
        { label: 'Status', render: r => h('select', { onchange: async e => { try { await api('/tickets/' + r.id + '/status', { method: 'POST', body: { status: e.target.value } }); render(); } catch (x) { toast(x.message); } } }, ['open', 'in_progress', 'resolved'].map(s => h('option', { value: s, selected: s === r.status }, s))) }], tk.tickets));
  },

  async errors() {
    const d = await api('/errors');
    content.append(h('h3', { style: 'margin-bottom:8px' }, 'Recent server errors'), d.errors.length ? table([{ label: 'When', render: r => fmtD(r.created_at) }, { label: 'Request', render: r => r.method + ' ' + r.path }, { label: 'Message', key: 'message', title: r => r.stack || r.message }], d.errors) : h('p', { class: 'muted' }, '🎉 No errors recorded.'));
  },

  async account() {
    const cur = h('input', { type: 'password', autocomplete: 'current-password' }), nw = h('input', { type: 'password', autocomplete: 'new-password' });
    content.append(h('div', { class: 'card', style: 'max-width:420px;display:grid;gap:10px' }, h('h3', {}, 'Change my password'), h('label', {}, 'Current password', cur), h('label', {}, 'New password (8+ characters)', nw),
      h('button', { class: 'btn', onclick: async () => { try { await api('/password', { method: 'POST', body: { current: cur.value, newPassword: nw.value } }); cur.value = nw.value = ''; toast('Password changed.'); } catch (e) { toast(e.message); } } }, 'Update password')));
    if (me.role === 'superadmin') {
      const d = await api('/admins');
      const name = h('input', { placeholder: 'Name' }), em = h('input', { type: 'email', placeholder: 'Email', autocapitalize: 'none' }), pw = h('input', { type: 'text', placeholder: 'Temporary password (8+)' });
      content.append(h('h3', { style: 'margin:18px 0 8px' }, 'Admin accounts'),
        table([{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Role', key: 'role' }, { label: '', render: r => r.id === me.id ? pill('You') : h('button', { class: 'btn small ghost', onclick: async () => { if (!confirm('Remove ' + r.email + '?')) return; try { await api('/admins/' + r.id, { method: 'DELETE' }); render(); } catch (e) { toast(e.message); } } }, 'Remove') }], d.admins),
        h('div', { class: 'row', style: 'margin-top:10px' }, name, em, pw, h('button', { class: 'btn small', onclick: async () => { try { await api('/admins', { method: 'POST', body: { name: name.value, email: em.value, password: pw.value, role: 'staff' } }); toast('Admin added.'); render(); } catch (e) { toast(e.message); } } }, 'Add staff admin')));
    }
  },
};

// ── reset-password dialog ─────────────────────────────────────────────────
function resetModal(user) {
  const pw = h('input', { type: 'text', placeholder: 'Leave empty to generate one', autocomplete: 'off' });
  const body = h('div', { class: 'card' });
  const close = () => ov.remove();
  const ov = h('div', { class: 'modal', onclick: e => { if (e.target === ov) close(); } }, body);
  const err = h('div', { class: 'err' });
  body.append(h('h3', {}, 'Reset password'), h('div', { class: 'muted' }, user.email), h('label', {}, 'New password (optional)', pw), err,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async e => {
      e.target.disabled = true;
      try {
        const d = await api('/users/' + user.id + '/reset-password', { method: 'POST', body: pw.value ? { password: pw.value } : {} });
        clear(body); body.append(h('h3', {}, 'Password reset ✓'), h('div', { class: 'muted' }, 'Send this to ' + d.email + ' — it will not be shown again:'), h('div', { class: 'secret' }, d.password),
          h('button', { class: 'btn', onclick: () => { close(); render(); } }, 'Done'));
      } catch (x) { err.textContent = x.message; e.target.disabled = false; }
    } }, 'Reset'), h('button', { class: 'btn ghost', onclick: close }, 'Cancel')));
  document.body.append(ov); pw.focus();
}

render();
})();
