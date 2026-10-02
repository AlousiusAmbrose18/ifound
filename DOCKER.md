# Run the complete ifound stack

Requires Docker Desktop or Docker Engine with Compose. From this directory:

```sh
node scripts/setup-env.mjs
docker compose up -d --build --wait
```

Open http://localhost:3000 and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`. The setup script retains existing values, adds missing settings and restricts file permissions. Keep `.env` private. Bootstrap credentials only create an absent admin; changing the environment does not reset an existing account. Change passwords in Account instead.

First startup downloads images and Maven dependencies. Change `APP_PORT` if port 3000 is occupied.

| Service | Runtime | Connection |
|---|---|---|
| frontend | Next.js / Node 24 | Loopback host port 3000; internal backend proxy |
| backend | Java 21 / Quarkus 3.40.1 | Internal 8080; JDBC to MySQL |
| mysql | MySQL 8.4 | Internal 3306; durable `ifound_mysql-data` volume |

Only the frontend publishes a host port. Service credentials stay on the server. Health checks gate MySQL, backend and frontend startup. Flyway creates and validates schemas automatically. V2 migrates any legacy workspace snapshot into entity tables, preserving the V1 payload as an archive.

## Persistence and access

Customers, watchlists, transactions, alerts, rules, users, sessions and audit events use separate MySQL tables. Entity details and review histories include JSON columns; transactions also have decimal amounts and indexed customer IDs/timestamps. Writes and audit events commit together, with a global workspace revision preventing lost updates. The UI uses dedicated business APIs and accepts the committed response; normal editing does not upload workspace snapshots.

Admin manages watchlists, rules, accounts, deletion and backup restore. Reviewer creates/updates/screens customers, evaluates transactions and reviews alerts. Viewer reads business records. Sessions use HttpOnly cookies, hashed database tokens and a 12-hour expiry. Password changes invalidate sessions.

A new database starts with empty business collections and default rules. Browser-local records are never copied automatically: transfer records through the Admin workspace API if needed. Restore replaces shared business data; database audit events are retained. GET workspace provides business data, not a full database/user backup. Workspace export/restore controls are intentionally absent from the UI. Refresh to obtain other users’ changes; real-time synchronization is absent.

```sh
docker compose ps
docker compose logs --tail=100 backend frontend
docker compose restart mysql backend
docker compose up -d --wait
docker compose down
```

`down` preserves the volume; `down -v` deletes it. Changing MySQL passwords in `.env` does not rotate credentials in an initialized database; rotate them inside MySQL first. Arrange regular database backups and test restoration before real deployment.

## Verification

```sh
npm ci
npx playwright install chromium
npm run check
mvn -B -ntp -f backend/pom.xml test
docker compose config --quiet
node scripts/test-stack.mjs
node scripts/test-stack-ui.mjs
```

Stack tests create fictional records and accounts, exercise actual APIs/browser flows, restore the original workspace and disable test accounts. Do not run during concurrent editing. See [API.md](API.md) and [AUDIT.md](AUDIT.md). An externally exposed deployment still needs HTTPS, secure deployment secrets, operational monitoring and backup procedures. Internal JDBC currently uses the isolated Docker network without TLS.

## Local admin recovery

If the existing admin password is lost or sign-in is locked, set a 12–200 character `ADMIN_PASSWORD` in the private `.env`, then run:

```sh
node scripts/reset-admin.mjs
```

This explicitly updates the existing active Admin account named by `ADMIN_USERNAME`, clears its failed-login lockout, invalidates its sessions and records an audit event. It does not change business data. Requires access to the local Docker database; ordinary setup and restarts never reset passwords.
