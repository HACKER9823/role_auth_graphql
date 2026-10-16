import 'dotenv/config';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

// Tests always use their own database, never your real one.
process.env.DB_NAME = 'role_auth_test';
process.env.JWT_SECRET = 'test-secret';
process.env.SEED_ADMIN_EMAIL = 'admin@test.com';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';

const { ApolloServer } = await import('@apollo/server');
const { typeDefs } = await import('../src/schema.js');
const { resolvers } = await import('../src/resolvers.js');
const { getUserFromHeader } = await import('../src/auth.js');
const { seedAdmin } = await import('../src/store.js');
const { pool, initDb } = await import('../src/db.js');

// Start every run from an empty test database.
await initDb();
await pool.query('DELETE FROM refresh_tokens');
await pool.query('DELETE FROM users');
await seedAdmin();

const server = new ApolloServer({ typeDefs, resolvers });
after(async () => {
  await server.stop();
  await pool.end();
});

async function run(query, { variables, token } = {}) {
  const res = await server.executeOperation(
    { query, variables },
    {
      contextValue: {
        user: await getUserFromHeader(token ? `Bearer ${token}` : undefined),
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

test('users list is admin only', async () => {
  const denied = await run('{ users { id } }', { token: samToken });
  assert.equal(code(denied), 'FORBIDDEN');
  const ok = await run('{ users { id email } }', { token: adminToken });
  assert.equal(ok.data.users.length, 2);
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

test('DEV can read but not change', async () => {
  const set = await run(`mutation{setUserRole(userId:"${samId}",role:DEV){role}}`, { token: adminToken });
  assert.equal(set.data.setUserRole.role, 'DEV');
  const list = await run('{ users { id } }', { token: samToken });
  assert.ok(list.data.users);
  const info = await run('{ systemInfo { nodeVersion totalUsers } }', { token: samToken });
  assert.ok(info.data.systemInfo.nodeVersion);
  const del = await run(`mutation{deleteUser(userId:"${samId}")}`, { token: samToken });
  assert.equal(code(del), 'FORBIDDEN');
  const promote = await run(`mutation{setUserRole(userId:"${samId}",role:ADMIN){role}}`, { token: samToken });
  assert.equal(code(promote), 'FORBIDDEN');
  await run(`mutation{setUserRole(userId:"${samId}",role:USER){role}}`, { token: adminToken });
});

test('plain USER cannot read system info', async () => {
  const r = await run('{ systemInfo { nodeVersion } }', { token: samToken });
  assert.equal(code(r), 'FORBIDDEN');
});

let kimId, kimToken;

test('MANAGER can change roles but cannot grant ADMIN, touch admins, or delete', async () => {
  const kim = await run(
    `mutation{register(name:"Kim",email:"kim@test.com",password:"password1"){token user{id}}}`
  );
  kimId = kim.data.register.user.id;
  kimToken = kim.data.register.token;
  await run(`mutation{setUserRole(userId:"${samId}",role:MANAGER){role}}`, { token: adminToken });

  const ok = await run(`mutation{setUserRole(userId:"${kimId}",role:DEV){role}}`, { token: samToken });
  assert.equal(ok.data.setUserRole.role, 'DEV');
  const grant = await run(`mutation{setUserRole(userId:"${kimId}",role:ADMIN){role}}`, { token: samToken });
  assert.equal(code(grant), 'FORBIDDEN');
  const me = await run('{ me { id } }', { token: adminToken });
  const demote = await run(`mutation{setUserRole(userId:"${me.data.me.id}",role:USER){role}}`, { token: samToken });
  assert.equal(code(demote), 'FORBIDDEN');
  const del = await run(`mutation{deleteUser(userId:"${kimId}")}`, { token: samToken });
  assert.equal(code(del), 'FORBIDDEN');
});

test('SUPPORT can unlock users but not change roles; USER cannot unlock', async () => {
  await run(`mutation{setUserRole(userId:"${kimId}",role:SUPPORT){role}}`, { token: adminToken });

  const bad = `mutation{login(email:"locked@test.com",password:"wrongpass"){token}}`;
  for (let i = 0; i < 5; i++) await run(bad);
  assert.equal(code(await run(bad)), 'RATE_LIMITED');
  const unlock = await run(`mutation{unlockUser(email:"locked@test.com")}`, { token: kimToken });
  assert.equal(unlock.data.unlockUser, true);
  assert.equal(code(await run(bad)), 'UNAUTHENTICATED');

  const role = await run(`mutation{setUserRole(userId:"${samId}",role:USER){role}}`, { token: kimToken });
  assert.equal(code(role), 'FORBIDDEN');

  await run(`mutation{setUserRole(userId:"${samId}",role:USER){role}}`, { token: adminToken });
  const denied = await run(`mutation{unlockUser(email:"locked@test.com")}`, { token: samToken });
  assert.equal(code(denied), 'FORBIDDEN');

  await run(`mutation{deleteUser(userId:"${kimId}")}`, { token: adminToken });
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