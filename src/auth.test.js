import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Use a throwaway data file and test secrets (must be set before importing the app).
process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-')), 'data.json');
process.env.JWT_SECRET = 'test-secret';
process.env.SEED_ADMIN_EMAIL = 'admin@test.com';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';

const { ApolloServer } = await import('@apollo/server');
const { typeDefs } = await import('../src/schema.js');
const { resolvers } = await import('../src/resolvers.js');
const { getUserFromHeader } = await import('../src/auth.js');
const { seedAdmin } = await import('../src/store.js');

await seedAdmin();
const server = new ApolloServer({ typeDefs, resolvers });
after(() => server.stop());

async function run(query, { variables, token } = {}) {
  const res = await server.executeOperation(
    { query, variables },
    {
      contextValue: {
        user: getUserFromHeader(token ? `Bearer ${token}` : undefined),
        ip: 'test',
      },
    }
  );
  return res.body.singleResult;
}

const code = (r) => r.errors?.[0]?.extensions?.code;

let adminToken, adminRefresh, samToken, samId;

test('admin can log in', async () => {
  const r = await run(
    `mutation($e:String!,$p:String!){login(email:$e,password:$p){token refreshToken user{role}}}`,
    { variables: { e: 'admin@test.com', p: 'Admin@12345' } }
  );
  assert.equal(r.data.login.user.role, 'ADMIN');
  adminToken = r.data.login.token;
  adminRefresh = r.data.login.refreshToken;
});

test('register always creates a USER', async () => {
  const r = await run(
    `mutation{register(name:"Sam",email:"sam@test.com",password:"password1"){token user{id role}}}`
  );
  assert.equal(r.data.register.user.role, 'USER');
  samToken = r.data.register.token;
  samId = r.data.register.user.id;
});

test('dashboard needs login', async () => {
  const r = await run('{ dashboard { message } }');
  assert.equal(code(r), 'UNAUTHENTICATED');
});

test('admin and user get different dashboards', async () => {
  const a = await run('{ dashboard { role data } }', { token: adminToken });
  const u = await run('{ dashboard { role data } }', { token: samToken });
  assert.equal(a.data.dashboard.role, 'ADMIN');
  assert.equal(u.data.dashboard.role, 'USER');
  assert.notDeepEqual(a.data.dashboard.data, u.data.dashboard.data);
});

test('users list is admin only and numbered', async () => {
  const denied = await run('{ users { id } }', { token: samToken });
  assert.equal(code(denied), 'FORBIDDEN');
  const ok = await run('{ users { no id email } }', { token: adminToken });
  assert.deepEqual(ok.data.users.map((u) => u.no), [1, 2]);
});

test('admin can switch a role and it applies immediately', async () => {
  const up = await run(`mutation{setUserRole(userId:"${samId}",role:ADMIN){role}}`, { token: adminToken });
  assert.equal(up.data.setUserRole.role, 'ADMIN');
  const nowAllowed = await run('{ users { id } }', { token: samToken });
  assert.ok(nowAllowed.data.users);
  await run(`mutation{setUserRole(userId:"${samId}",role:USER){role}}`, { token: adminToken });
});

test('admin cannot change own role', async () => {
  const me = await run('{ me { id } }', { token: adminToken });
  const r = await run(`mutation{setUserRole(userId:"${me.data.me.id}",role:USER){role}}`, { token: adminToken });
  assert.match(r.errors[0].message, /own role/);
});

test('refresh token works once only', async () => {
  const q = `mutation($t:String!){refreshToken(refreshToken:$t){token refreshToken}}`;
  const first = await run(q, { variables: { t: adminRefresh } });
  assert.ok(first.data.refreshToken.token);
  const second = await run(q, { variables: { t: adminRefresh } });
  assert.equal(code(second), 'UNAUTHENTICATED');
});

test('deleted user token stops working', async () => {
  const d = await run(`mutation{deleteUser(userId:"${samId}")}`, { token: adminToken });
  assert.equal(d.data.deleteUser, true);
  const r = await run('{ dashboard { message } }', { token: samToken });
  assert.equal(code(r), 'UNAUTHENTICATED');
});

test('login is rate limited after 5 failures', async () => {
  let last;
  for (let i = 0; i < 6; i++) {
    last = await run(`mutation{login(email:"nobody@test.com",password:"wrongpass"){token}}`);
  }
  assert.equal(code(last), 'RATE_LIMITED');
});