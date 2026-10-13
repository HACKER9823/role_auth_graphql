import { useCallback, useEffect, useState } from 'react';
import { gql, hasSession, getRefreshToken, setSession, clearSession } from './api.js';

const LOGIN = `mutation($e:String!,$p:String!){login(email:$e,password:$p){token refreshToken}}`;
const REGISTER = `mutation($n:String!,$e:String!,$p:String!){register(name:$n,email:$e,password:$p){token refreshToken}}`;
const LOGOUT = `mutation($t:String!){logout(refreshToken:$t)}`;
const HOME = `{ me { id name email role } dashboard { message data } }`;
const USERS = `{ users { id name email role } }`;
const SET_ROLE = `mutation($id:ID!,$r:Role!){setUserRole(userId:$id,role:$r){id}}`;
const DELETE = `mutation($id:ID!){deleteUser(userId:$id)}`;

function AuthCard({ onSubmit }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function submit(e) {
    e.preventDefault();
    if (mode === 'login') onSubmit(LOGIN, { e: form.email, p: form.password }, 'login');
    else onSubmit(REGISTER, { n: form.name, e: form.email, p: form.password }, 'register');
  }

  return (
    <section className="card">
      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Log in
        </button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Register
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <input placeholder="Name" value={form.name} onChange={set('name')} required />
        )}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input
          type="password"
          placeholder={mode === 'register' ? 'Password (min 8 characters)' : 'Password'}
          value={form.password}
          onChange={set('password')}
          minLength={mode === 'register' ? 8 : undefined}
          required
        />
        <button>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
    </section>
  );
}

export default function App() {
  const [home, setHome] = useState(null); // { me, dashboard }
  const [users, setUsers] = useState([]);
  const [toast, setToast] = useState(null); // { text, ok }
  const [loading, setLoading] = useState(hasSession());

  const notify = (text, ok = false) => setToast({ text, ok });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadUsers = useCallback(async () => {
    const d = await gql(USERS);
    setUsers(d.users);
  }, []);

  const loadHome = useCallback(async () => {
    try {
      const d = await gql(HOME);
      setHome(d);
      if (d.me.role === 'ADMIN') await loadUsers();
    } catch (e) {
      clearSession();
      setHome(null);
      setToast({ text: e.message, ok: false });
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    if (hasSession()) loadHome();
  }, [loadHome]);

  async function authenticate(query, variables, key) {
    try {
      const d = await gql(query, variables);
      setSession(d[key]);
      setLoading(true);
      await loadHome();
    } catch (e) {
      notify(e.message);
    }
  }

  async function logout() {
    try {
      await gql(LOGOUT, { t: getRefreshToken() }, false);
    } catch {
      /* ignore */
    }
    clearSession();
    setHome(null);
    setUsers([]);
  }

  async function changeRole(u, role) {
    try {
      await gql(SET_ROLE, { id: u.id, r: role });
      notify(`${u.name} is now ${role}`, true);
      await loadUsers();
    } catch (e) {
      notify(e.message);
    }
  }

  async function removeUser(u) {
    if (!confirm(`Delete ${u.email}?`)) return;
    try {
      await gql(DELETE, { id: u.id });
      notify('User deleted', true);
      await loadUsers();
    } catch (e) {
      notify(e.message);
    }
  }

  return (
    <>
      <header>
        <h1>Role Auth Demo</h1>
        {home && (
          <div className="right">
            <span className={`badge ${home.me.role.toLowerCase()}`}>
              {home.me.name} · {home.me.role}
            </span>
            <button onClick={logout}>Log out</button>
          </div>
        )}
      </header>

      {toast && <div className={`toast ${toast.ok ? 'ok' : 'err'}`}>{toast.text}</div>}

      <main>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : !home ? (
          <AuthCard onSubmit={authenticate} />
        ) : (
          <>
            <section className="card">
              <h2>You</h2>
              <div className="muted">
                {home.me.email} (id {home.me.id})
              </div>
            </section>

            <section className="card">
              <h2>Dashboard</h2>
              <div>{home.dashboard.message}</div>
              <ul>
                {home.dashboard.data.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>

            {home.me.role === 'ADMIN' && (
              <section className="card">
                <h2>Admin: manage users</h2>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>
                          <select
                            value={u.role}
                            disabled={u.id === home.me.id}
                            onChange={(e) => changeRole(u, e.target.value)}
                          >
                            <option>USER</option>
                            <option>ADMIN</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="danger"
                            disabled={u.id === home.me.id}
                            onClick={() => removeUser(u)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}