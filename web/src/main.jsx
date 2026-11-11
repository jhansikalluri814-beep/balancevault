import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch {
    throw new Error(`Cannot reach the API at ${API}. Check that the backend is running and its WEB_ORIGIN matches this page.`);
  }
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('overview');
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  async function refresh() {
    let me;
    try {
      me = await request('/api/me');
      setSession(me);
    } catch {
      setSession(null);
      return;
    }
    if (me.user.role === 'ADMIN') {
      try {
        const [pending, audit, userList] = await Promise.all([request('/api/admin/onboarding'), request('/api/admin/audit'), request('/api/admin/users')]);
        setRows(pending.requests); setEvents(audit.events); setUsers(userList.users);
        setError('');
      } catch (err) { setError(err.message); }
    } else setError('');
  }
  useEffect(() => { refresh(); }, []);

  async function authenticate(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (authMode === 'register') await request('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
      else await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) });
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setError('');
    try { await request('/api/auth/logout', { method: 'POST' }); }
    catch (err) { setError(err.message); }
    finally { setSession(null); setTab('overview'); }
  }
  async function review(id, decision) {
    try { await request(`/api/admin/onboarding/${id}/review`, { method: 'POST', body: JSON.stringify({ decision }) }); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function toggleUser(user) {
    try {
      await request(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ disabled: !user.disabled }) });
      await refresh();
    } catch (err) { setError(err.message); }
  }

  if (!session) return <main className="auth-page"><section className="auth-card"><Brand/><p className="eyebrow">ACCOUNT ACCESS</p><h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1><p className="muted">{authMode === 'login' ? 'Sign in to your BalanceVault workspace.' : 'Register to begin account onboarding.'}</p>
    {error && <div className="alert">{error}</div>}
    <form onSubmit={authenticate} className="form">{authMode === 'register' && <label>Full name<input required minLength="2" maxLength="80" autoComplete="name" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/></label>}<label>Email<input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})}/></label><label>Password<input required type="password" minLength="12" maxLength="128" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={e => setForm({...form,password:e.target.value})}/></label><button className="primary" disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}</button></form>
    <button className="text-button" onClick={() => {setAuthMode(authMode === 'login' ? 'register' : 'login');setError('')}}>{authMode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</button><p className="fine">Demo application. Use synthetic data only.</p></section></main>;

  const admin = session.user.role === 'ADMIN';
  const tabLabel = { overview: 'Overview', onboarding: 'Onboarding', users: 'Users', audit: 'Audit trail' }[tab];
  return <div className="shell"><aside className="sidebar"><Brand/><div className="nav-label">WORKSPACE</div><button className={`nav-item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}><span>◫</span> Overview</button>{admin && <><button className={`nav-item ${tab === 'onboarding' ? 'active' : ''}`} onClick={() => setTab('onboarding')}><span>♧</span> Onboarding <b>{rows.length}</b></button><button className={`nav-item ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><span>♙</span> Users</button><button className={`nav-item ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}><span>◷</span> Audit trail</button></>}<div className="sidebar-foot"><div className="avatar">{session.user.name[0]?.toUpperCase()}</div><div className="person"><strong>{session.user.name}</strong><span>{admin ? 'Administrator' : 'Account holder'}</span></div><button className="logout" onClick={logout} aria-label="Sign out" title="Sign out">Sign out</button></div></aside>
    <main className="main"><header className="topbar"><div><span className="crumb">BalanceVault</span><span className="slash">/</span><strong>{tabLabel}</strong></div><div className="top-right"><span className="secure">● Secure session</span><span className="avatar small" aria-hidden="true">{session.user.name[0]?.toUpperCase()}</span><button className="top-logout" onClick={logout}>Sign out</button></div></header>
      <div className="content">{error && <div className="alert">{error}</div>}
      {tab === 'overview' && <><div className="welcome"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Good to see you, {session.user.name.split(' ')[0]}</h1><p className="muted">Manage your account access and onboarding status.</p></div><div className="date-chip">DEMO ENVIRONMENT</div></div><section className="stat-grid"><article className="stat-card"><span>ACCOUNT STATUS</span><strong className="status"><i className={`dot ${session.onboarding?.toLowerCase() || 'pending'}`}></i>{session.onboarding || 'Not started'}</strong><small>Onboarding review</small></article><article className="stat-card"><span>ACCESS LEVEL</span><strong>{admin ? 'Administrator' : 'Account holder'}</strong><small>Assigned role</small></article><article className="stat-card"><span>SECURITY</span><strong>Protected</strong><small>Authenticated session</small></article></section><section className="panel"><div className="panel-head"><div><h2>Getting started</h2><p>Track the key steps for your account.</p></div><span className="step-count">{session.onboarding === 'APPROVED' ? '3' : '2'} / 3 complete</span></div><div className="steps"><Step done title="Create your profile" description="Your account details are on file."/><Step done title="Submit onboarding" description="Your request is in the review queue."/><Step done={session.onboarding === 'APPROVED'} title="Review decision" description={session.onboarding === 'APPROVED' ? 'Your onboarding was approved.' : session.onboarding === 'REJECTED' ? 'Contact support about the decision.' : 'An administrator will review your request.'}/></div></section><div className="notice"><span>ⓘ</span><p><strong>Demonstration only</strong><br/>BalanceVault is a hackathon demo. Do not enter real financial or sensitive identity information.</p></div></>}
      {tab === 'onboarding' && admin && <><div className="welcome"><div><p className="eyebrow">ADMINISTRATION</p><h1>Onboarding requests</h1><p className="muted">Review new account-holder requests.</p></div></div><section className="panel"><div className="panel-head"><div><h2>Pending review</h2><p>{rows.length} request{rows.length === 1 ? '' : 's'} waiting</p></div></div>{rows.length ? <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Submitted</th><th>Request ID</th><th>Decision</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.user.name}</strong><small>{r.user.email}</small></td><td>{new Date(r.createdAt).toLocaleDateString()}</td><td className="mono">{r.id.slice(0,12)}</td><td className="actions"><button className="approve" onClick={() => review(r.id,'APPROVED')}>Approve</button><button className="reject" onClick={() => review(r.id,'REJECTED')}>Reject</button></td></tr>)}</tbody></table></div> : <Empty title="Queue is clear" message="New registration requests will appear here."/>}</section></>}
      {tab === 'users' && admin && <><div className="welcome"><div><p className="eyebrow">ADMINISTRATION</p><h1>User management</h1><p className="muted">Review accounts and manage holder access.</p></div></div><section className="panel"><div className="panel-head"><div><h2>Accounts</h2><p>{users.length} recent account{users.length === 1 ? '' : 's'}</p></div></div>{users.length ? <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.role === 'ADMIN' ? 'Administrator' : 'Holder'}</td><td>{user.disabled ? 'Disabled' : 'Active'}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.role === 'ADMIN' ? <span className="muted">Protected</span> : <button className={user.disabled ? 'approve' : 'reject'} onClick={() => toggleUser(user)}>{user.disabled ? 'Restore access' : 'Disable access'}</button>}</td></tr>)}</tbody></table></div> : <Empty title="No accounts found" message="Registered users will appear here."/>}</section></>}
      {tab === 'audit' && admin && <><div className="welcome"><div><p className="eyebrow">ACCOUNTABILITY</p><h1>Audit trail</h1><p className="muted">Recent administrative and account events.</p></div></div><section className="panel"><div className="panel-head"><div><h2>Recent events</h2><p>Latest recorded activity</p></div></div>{events.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>Time</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td><strong>{e.action.replaceAll('_',' ')}</strong></td><td>{e.actor?.email || 'System'}</td><td className="mono">{e.targetId?.slice(0,12) || '—'}</td><td>{new Date(e.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <Empty title="No activity yet" message="Recorded events will appear here."/>}</section></>}
      </div><footer>BalanceVault <span>•</span> Hackathon demonstration <span>•</span> Synthetic data only</footer>
    </main></div>;
}
function Brand(){return <div className="brand"><div className="brand-mark">B</div><strong>Balance<span>Vault</span></strong></div>}
function Step({done,title,description}){return <div className="step"><div className={`check ${done?'done':''}`}>{done?'✓':''}</div><div><strong>{title}</strong><p>{description}</p></div></div>}
function Empty({title,message}){return <div className="empty"><div className="empty-icon">✓</div><strong>{title}</strong><p>{message}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);
