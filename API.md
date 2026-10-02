# ifound API

Browser endpoints use `/api` on the frontend. The proxy supplies private service credentials to Quarkus; browser clients authenticate using the HttpOnly session cookie from login. All business endpoints require an active user session. Dates use `YYYY-MM-DD`; timestamps are UTC.

| Endpoint | Methods | Access / purpose |
|---|---|---|
| `/auth/login` | POST | Username/password; creates session cookie |
| `/auth/me` | GET | Current user |
| `/auth/logout` | POST | End session |
| `/auth/password` | POST | Current/new password; invalidate sessions |
| `/customers`, `/customers/{id}` | GET | All roles; list/detail |
| `/customers`, `/screenings` | POST | Admin/Reviewer; create and screen |
| `/customers/{id}` | PUT | Admin/Reviewer; update and screen |
| `/customers/{id}/screen` | POST | Admin/Reviewer; rescreen |
| `/customers/{id}` | DELETE | Admin; reject if transactions reference customer |
| `/watchlists`, `/watchlists/{id}` | GET | All roles |
| `/watchlists`, `/watchlists/import` | POST | Admin; add/import |
| `/watchlists/{id}` | PUT, DELETE | Admin |
| `/transactions`, `/transactions/{id}` | GET | All roles |
| `/transactions` | POST | Admin/Reviewer; evaluate and commit |
| `/alerts`, `/alerts/{id}` | GET | All roles |
| `/alerts/{id}/reviews` | GET, POST | Read all; write Admin/Reviewer |
| `/rules` | GET, PUT | Read all; write Admin |
| `/dashboard` | GET | All roles; metrics |
| `/audit` | GET | Admin; recent events |
| `/users` | GET, POST | Admin; list/create |
| `/users/{id}` | PUT | Admin; role, active state or password reset |
| `/workspace` | GET, PUT | Read all; Admin backup replacement |
| `/health` | GET | Public readiness; no business data |

## Requests and conflicts

Get `/workspace` for `{revision, workspace}`. Business POST/PUT bodies include the current `revision`; DELETE uses `?revision=N`. Successful business writes return `{revision, workspace, result}`. User/account operations do not use the business revision. HTTP 409 requires refreshing before retry; writes are not automatically retried.

Customer creation/update:

```json
{"revision":0,"first":"Alex","middle":"","last":"Example","dob":"1980-01-01","country":"India","location":"Mumbai","profession":"Engineer","countryRisk":20,"locationRisk":50,"professionRisk":90}
```

First name, country and location are required; last name, profession and DOB are optional but must be a past valid date when provided. Risk inputs are 20, 50 or 90. Server computes identity, risk, matches and alerts.

Watchlist import: `{revision, records:[{name,country,dob,source}]}`. Watchlist creation/edit uses those fields directly with revision. Optional first/middle/last, location, profession and countryRisk/locationRisk/professionRisk (20, 50 or 90) are also stored and validated. Import accepts up to 10,000 records and suppresses identical name/country/DOB/source entries.

Transaction POST requires `{revision, customerId, reference, beneficiary, beneficiaryAccount, amount:"49.99", currency:"INR", destination:"India", transactionDate:"2026-10-02T06:00:00Z", channel:"Bank transfer", purpose:"Invoice payment", idempotencyKey:"unique-reference"}`. Reference is unique, case-insensitively. Supported channels: Bank transfer, UPI, Card, Cash. Currency is currently INR only; transaction date must be an ISO UTC instant at or before the server time. All details except idempotencyKey are mandatory.

The server checks decimal amounts, customer IDs, high-value rules, preceding 24-hour velocity using transaction dates, and beneficiary name matches against the watchlist. It stores triggered reasons, match evidence and a snapshot of applied rules with the transaction. Alerts link to its ID. Duplicate references/keys return 409; validation/conflicts commit no transaction. `screened:false` means both rule groups were disabled. A screening result is not a payment approval. Existing records remain readable, with unavailable legacy details displayed as empty.

Review: `{revision, status:"Closed", note:"Identity evidence reviewed."}`. Status accepts Open, In review or Closed; notes are mandatory. Reviewer identity comes from the session.

Rules: `{revision, rules:...}` using the complete object returned by GET rules. Backup restore: `{revision, workspace:...}` using an exported validated workspace. Restore replaces business collections, retains server audit events and requires Admin.

Create user: `{username,password,role}`; roles Admin/Reviewer/Viewer, passwords at least 12 characters. Update user accepts role, active and optional password. Password change uses `{currentPassword,newPassword}`. Users cannot demote or disable their own Admin account.

Lists accept `q`, `offset` (default 0), `limit` (default 100, maximum 1000). Alerts also accept status/risk. Audit limit is at most 1000. Lists return arrays.

Errors return JSON `error`: 400 validation, 401 sign-in required/invalid credentials, 403 denied, 404 missing record, 409 conflict/duplicate, 429 login lockout. Refresh the workspace after conflicts. Proxy bodies are limited to 10 MB.

Screening creates or updates a watchlist record linked to the customer ID. A customer’s own linked entry is excluded from their matches. Existing MySQL customers are backfilled by migration V3.

## Name matching

Exact and normalized full-name fuzzy matching remain supported. A phonetic token matcher also compares entered Latin-letter name parts with watchlist name parts using Soundex codes and a minimum 60% spelling similarity per part. Every entered part must match a distinct watchlist part. Names shorter than three letters and uninformative vowel-only codes do not receive a phonetic boost. Non-Latin names retain Unicode fuzzy matching; transliteration is not applied.

Phonetic matches score 90 when the entered name has fewer parts than the watchlist name, or 92 when part counts are equal. A higher full-name text score takes precedence. These are heuristic matching scores, not identity probabilities. The configured threshold still applies: at 80, messy/mesi/leoneel each match messi leonel; at 95, those partial matches do not qualify. Evidence records the method, raw text score, matched tokens and phonetic codes. Single-name customers can leave last name empty.

Soundex behavior follows the [Apache Commons Codec reference](https://commons.apache.org/proper/commons-codec/apidocs/org/apache/commons/codec/language/Soundex.html). Existing saved alerts retain their original evidence; rescreen customers to apply the updated matcher.
