import crypto from 'node:crypto';
import { pool, initDb } from './db.js';
import { hashPassword } from './password.js';

// Database ids are integers; GraphQL ids are strings.
const toUser = (row) => (row ? { ...row, id: String(row.id) } : undefined);
function toDbId(id) {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function createUser({ name, email, passwordHash, role = 'USER' }) {
  const [res] = await pool.execute(
    'INSERT INTO users (name, email, passwordHash, role) VALUES (?, ?, ?, ?)',
    [name, email.toLowerCase(), passwordHash, role]
  );
  return findById(res.insertId);
}

export async function findByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  return toUser(rows[0]);
}

export async function findById(id) {
  const n = toDbId(id);
  if (n === null) return undefined;
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [n]);
  return toUser(rows[0]);
}

export async function getAllUsers() {
  const [rows] = await pool.execute('SELECT * FROM users ORDER BY id');
  return rows.map(toUser);
}

export async function updateRole(id, role) {
  const n = toDbId(id);
  if (n === null) return undefined;
  await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, n]);
  return findById(n);
}

// Refresh tokens are removed automatically too (ON DELETE CASCADE).
export async function deleteUserById(id) {
  const n = toDbId(id);
  if (n === null) return false;
  const [res] = await pool.execute('DELETE FROM users WHERE id = ?', [n]);
  return res.affectedRows > 0;
}

// ---- Refresh tokens (only a hash is stored, never the token itself) ----
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const REFRESH_DAYS = 7;

export async function createRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  await pool.execute('DELETE FROM refresh_tokens WHERE expiresAt < ?', [Date.now()]);
  await pool.execute(
    'INSERT INTO refresh_tokens (tokenHash, userId, expiresAt) VALUES (?, ?, ?)',
    [sha(token), toDbId(userId), Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000]
  );
  return token;
}

// One-time use: the DELETE decides who wins if two requests use the same token.
export async function consumeRefreshToken(token) {
  const hash = sha(token);
  const [rows] = await pool.execute(
    'SELECT userId, expiresAt FROM refresh_tokens WHERE tokenHash = ?',
    [hash]
  );
  if (!rows.length) return null;
  const [res] = await pool.execute('DELETE FROM refresh_tokens WHERE tokenHash = ?', [hash]);
  if (res.affectedRows === 0) return null;
  if (Number(rows[0].expiresAt) < Date.now()) return null;
  return findById(rows[0].userId);
}

export async function revokeRefreshToken(token) {
  const [res] = await pool.execute('DELETE FROM refresh_tokens WHERE tokenHash = ?', [sha(token)]);
  return res.affectedRows > 0;
}

export async function seedAdmin() {
  await initDb(); // creates the tables on first run
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  if (await findByEmail(email)) return;
  await createUser({
    name: 'Admin',
    email,
    passwordHash: await hashPassword(password),
    role: 'ADMIN',
  });
}