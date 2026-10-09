# Role-Based Auth System (GraphQL + Node)

Admins and users log in and get different outputs from the same API.

## Roadmap
- [x] **Day 1** – Setup, GraphQL server, register/login, JWT, role-aware `dashboard`
- [x] **Day 2** – Role guards, admin-only mutations, role switching (admin changes a user's role)
- [x] **Day 3** – JSON file storage, refresh tokens, logout
- [x] **Day 4** – rate limiting, tests, docs, deploy

## Features
- Register and login with bcrypt-hashed passwords
- Short-lived access tokens (JWT) plus one-time refresh tokens
- Roles `ADMIN` and `USER`, checked on every request
- Admin-only: list users, switch roles, delete users
- Login rate limiting (5 failed attempts per 15 minutes)
- JSON file storage (`data.json`)

## Setup
```bash
npm install
cp .env.example .env   # set JWT_SECRET and the admin password
npm run dev
npm test
```
Generate a secret with `openssl rand -hex 64`.
Open http://localhost:4000 (Apollo Sandbox).

## API
| Operation | Access | What it does |
|---|---|---|
| `register(name, email, password)` | public | Creates a USER |
| `login(email, password)` | public | Returns `token` and `refreshToken` |
| `refreshToken(refreshToken)` | public | Swaps a refresh token for a new pair (one use) |
| `logout(refreshToken)` | public | Cancels a refresh token |
| `me` | logged in | Current user (or null) |
| `dashboard` | logged in | Admin sees all users, user sees own data |
| `users` | ADMIN | All users with display number `no` |
| `setUserRole(userId, role)` | ADMIN | Switch a user between USER and ADMIN |
| `deleteUser(userId)` | ADMIN | Delete a user |

Send the token as the header `Authorization: Bearer <token>`.

## Examples

Log in (no header needed):
```graphql
mutation {
  login(email: "admin@example.com", password: "<your SEED_ADMIN_PASSWORD>") {
    token
    refreshToken
    user { role }
  }
}
```

Check your role and dashboard:
```graphql
query {
  me { name role }
  dashboard { message data }
}
```

Register a new user (no header needed):
```graphql
mutation {
  register(name: "Ravi", email: "ravi@test.com", password: "password1") {
    token
    user { id email role }
  }
}
```

List users (admin only):
```graphql
query { users { no id email role } }
```

Change a user's role (admin only):
```graphql
mutation {
  setUserRole(userId: "2", role: ADMIN) {
    id
    email
    role
  }
}
```

Delete a user (admin only):
```graphql
mutation { deleteUser(userId: "2") }
```

Get a new token when the access token expires:
```graphql
mutation {
  refreshToken(refreshToken: "<your refreshToken>") {
    token
    refreshToken
  }
}
```

## Notes
- Admins can't change or delete their own account.
- User ids are never reused. `no` is a display number only.
- Never commit `.env` or `data.json`.
- On hosts with a temporary filesystem (like Render's free tier), `data.json` resets on every redeploy.

It can still be devloped more like adding some UI's but currently its just for api call testing i have not built any frontend yet .