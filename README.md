# Role-Based Auth System (GraphQL + Node)

Admins and users log in and get different outputs from the same API.

## Roadmap
- [x] **Day 1** – Setup, GraphQL server, register/login, JWT, role-aware `dashboard`
- [ ] **Day 2** – Role guards, admin-only mutations, role switching (admin changes a user's role)
- [ ] **Day 3** – Real database, refresh tokens
- [ ] **Day 4** – Tests, rate limiting, docs, deploy

## Run
```bash
npm install
cp .env.example .env   # set JWT_SECRET
npm run dev
```
Open http://localhost:4000 (Apollo Sandbox).

## Try it
```graphql
mutation { login(email: "admin@example.com", password: "Admin@123") { token user { role } } }
```
Send `Authorization: Bearer <token>` header, then:
```graphql
query { me { name role } dashboard { message data } }
```
Log in as a regular user (`register` first) and compare the `dashboard` output.
