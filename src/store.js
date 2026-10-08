import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const FILE = 'data.json';

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { nextId: 1, users: [], refreshTokens: [] };
  }
}

let data = load();

// Write to a temp file first, then swap it in, so a crash can't corrupt data.json.
function save() {
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

export function createUser({ name, email, passwordHash, role = 'USER' }) {
  const user = {
    id: String(data.nextId++),
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
  };
  data.users.push(user);
  save();
  return user;
}

export function findByEmail(email) {
  return data.users.find((u) => u.email === email.toLowerCase());
}

export function findById(id) {
  return data.users.find((u) => u.id === String(id));
}

export function getAllUsers() {
  return [...data.users];
}

export function updateRole(id, role) {
  const user = findById(id);
  if (user) {
    user.role = role;
    save();
  }
  return user;
}

export function deleteUserById(id) {
  const i = data.users.findIndex((u) => u.id === String(id));
  if (i === -1) return false;
  data.users.splice(i, 1);
  data.refreshTokens = data.refreshTokens.filter((t) => t.userId !== String(id));
  save();
  return true;
}

// ---- Refresh tokens (only a hash is stored, never the token itself) ----
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const REFRESH_DAYS = 7;

export function createRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  data.refreshTokens = data.refreshTokens.filter((t) => t.expiresAt > Date.now());
  data.refreshTokens.push({
    tokenHash: sha(token),
    userId: String(userId),
    expiresAt: Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000,
  });
  save();
  return token;
}

// One-time use: the old token is deleted when it is exchanged.
export function consumeRefreshToken(token) {
  const hash = sha(token);
  const row = data.refreshTokens.find((t) => t.tokenHash === hash);
  if (!row) return null;
  data.refreshTokens = data.refreshTokens.filter((t) => t.tokenHash !== hash);
  save();
  if (row.expiresAt < Date.now()) return null;
  return findById(row.userId);
}

export function revokeRefreshToken(token) {
  const hash = sha(token);
  const before = data.refreshTokens.length;
  data.refreshTokens = data.refreshTokens.filter((t) => t.tokenHash !== hash);
  save();
  return data.refreshTokens.length < before;
}

export async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  if (findByEmail(email)) return;
  createUser({
    name: 'Admin',
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'ADMIN',
  });
}