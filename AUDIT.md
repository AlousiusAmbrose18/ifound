# ifound audit

Updated 2026-10-02. Scope: frontend workflows, Java/Quarkus business API, MySQL persistence and local Docker deployment.

## Addressed

- Product renamed ifound; navy and white theme; aligned customer form; removed the requested screening results/demo guidance panel.
- Mandatory-field UI errors and server checks for dates, bounds, imports, rules, review notes and decimal amounts.
- Dedicated customer, screening, watchlist, transaction, alert, rule, dashboard, user, authentication and audit APIs connected to the UI.
- Separate MySQL entity tables, stable IDs, transactional business/audit writes, revision conflicts and legacy migration.
- Backend-authoritative screening, risk, transaction velocity and alert generation; decimal financial amounts.
- PBKDF2 password hashes, random sessions stored as hashes, HttpOnly cookies, role authorization and failed-login lockout.
- Authenticated review history, service-token proxy, same-origin write checks and baseline HTTP security headers.
- Reproducible domain/browser/stack tests, Docker health checks and CI.

## Validation scope

Frontend checks cover TypeScript, five domain tests, production build and twelve Chromium workflow tests. Nineteen Java tests cover workspace validation, matching, risk/evidence, decimal transactions, velocity and password verification. Complete-stack API tests exercise authorization, CRUD, screening, review, rule changes, invalid inputs, stale writes, cross-origin rejection, password changes and audit. A separate browser test exercises login, watchlists, screening, customer edits, reviews, transaction velocity, reload persistence and account roles.

These tests use fictional records. They do not constitute penetration testing, regulatory model validation or load certification.

## Remaining requirements for live deployment

- Authoritative sanctions/PEP feeds, provenance, freshness checks, aliases/transliteration and validated matching performance. Current matching combines normalized token-sorted edit distance and a guarded Soundex token matcher; country/DOB are evidence, not name-score components.
- Tenant isolation: this implementation is one shared workspace with a global write lock. Writes currently persist all entity rows and reads assemble the workspace; capacity and contention require measurement and optimization for larger workloads.
- External ledger integration and ingestion reconciliation. Transaction idempotency keys reject duplicates with 409; there is no automatic ingestion/retry service.
- Tamper-evident audit retention: application APIs protect audit events, but database administrators can alter them. Admin backup restore can replace business records; this is not an immutable regulated ledger.
- HTTPS, external database TLS, deployed secret rotation, MFA where required, complete CSP, monitoring, retention controls, backup restoration drills and broader browser/accessibility/security/load testing.

Standalone browser mode remains local and unauthenticated. Docker mode implements authentication, authorization and durable persistence; neither mode provides regulatory release clearance.

Transaction workflow now uses a register, mandatory transaction/beneficiary details, review before screening, server-side beneficiary matching, immutable-by-API screening evidence snapshots, unique references and linked investigations. The UI supports INR only and does not execute, approve or block payments. Event-time velocity uses transaction dates; later-arriving records do not retroactively rescreen previously processed transactions.

Phonetic matching is heuristic and currently limited to Latin-letter name parts, with configurable thresholds. Tests include the requested messy/mesi/leoneel variants, unrelated names, conflicting extra tokens, short names, Unicode preservation and threshold rejection. Last name is optional to support single-name screening.
