import bcrypt from 'bcryptjs';

// In-memory store for Day 1. Replaced by a real database on Day 3.
export const users = [];
let nextId = 1;

export function createUser({ name, email, passwordHash, role = 'USER' }) {
  const user = { id: String(nextId++), name, email: email.toLowerCase(), passwordHash, role };
  users.push(user);
  return user;
}

export function findByEmail(email) {
  return users.find((u) => u.email === email.toLowerCase());
}

export function findById(id) {
  return users.find((u) => u.id === id);
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

export function deleteUserById(id) {
  const i = users.findIndex((u) => u.id === id);
  if (i === -1) return false;
  users.splice(i, 1);
  return true;
}