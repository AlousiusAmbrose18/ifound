# ifound

Customer screening, watchlist management, transaction monitoring and alert investigation, with a navy blue and white UI. The complete stack uses Next.js, Java 21 / Quarkus and MySQL 8.4.

```sh
node scripts/setup-env.mjs
docker compose up -d --build --wait
```

Open http://localhost:3000. Sign in using `ADMIN_USERNAME` and `ADMIN_PASSWORD` from the private `.env` file. See [DOCKER.md](DOCKER.md) for operation and [API.md](API.md) for endpoints.

## Implemented workflows

- Customer creation, editing, rescreening and deletion checks; optional last name/profession, phonetic name-part matching, linked watchlist entries and backend-calculated risk/matches.
- Watchlist CRUD and validated JSON imports with duplicate suppression.
- Transaction register, searchable customer selection, beneficiary/details entry, review before screening, decimal amounts, beneficiary watchlist checks and rolling 24-hour velocity; linked alerts and evidence commit with transactions.
- Alert decisions with mandatory notes, authenticated reviewer identity and timestamped history.
- Configurable rules, dashboard metrics, search and filters.
- Admin, Reviewer and Viewer roles; user management, password changes, HttpOnly sessions and failed-login lockout.
- MySQL entity tables, transactional writes, revision conflict rejection, protected audit events and an Admin backup API.
- Mandatory-field UI errors, backend validation, responsive layouts and error recovery.

Docker mode waits for committed backend results before updating the UI. Refresh workspace to see other users’ changes. Stale writes return 409 and require a refresh. Standalone `npm ci && npm run dev` uses browser localStorage and has no server authentication; it supports the original demonstration workflows.

## Verification

```sh
npm ci
npx playwright install chromium
npm run check
mvn -B -ntp -f backend/pom.xml test
node scripts/test-stack.mjs
node scripts/test-stack-ui.mjs
```

The stack tests require the running Docker app and temporarily replace workspace settings. Run without concurrent editing; their cleanup restores the original workspace and disables temporary test accounts. CI runs frontend checks and both complete-stack tests.

Watchlists and matching remain demonstrations. This is a tested local stack, not regulatory release clearance. See [AUDIT.md](AUDIT.md) for remaining deployment and compliance requirements.

The UI keeps navigation, forms and results plain: demo banners, explanatory notes, storage labels and workspace export/restore controls are removed. Admin backup operations remain available through the API.
