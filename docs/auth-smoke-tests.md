# Auth Smoke Test Playbook

Quick manual checks to validate the auth flow (GraphQL-first with REST fallback).

## Prereqs
- `.env` configured so the app can reach WordPress (WPGraphQL + WPGraphQL JWT Auth + WooGraphQL).
- Run the Next.js dev server (`npm run dev` or `pnpm dev`).
- Replace `BASE` below with your local URL (e.g. `http://localhost:3000`).
- Have a known test user: `TEST_USER` / `TEST_PASS`.

## Curl/API checks

Login (REST fallback endpoint used by client):
```bash
BASE=http://localhost:3000
USER=TEST_USER
PASS=TEST_PASS

curl -i -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}"
```
- Expect `200` with `success:true` and cookies `session` + `csrf-token` set in `cookies.txt`.

Session read (authenticated):
```bash
curl -i "$BASE/api/auth/session" -b cookies.txt
```
- Expect `authenticated:true` and sanitized `user`. No token should be in the payload.

Refresh (GraphQL refresh token flow):
```bash
curl -i -X POST "$BASE/api/auth/refresh" -b cookies.txt -c cookies.txt
```
- Expect `200`, `success:true`. If 401, refresh failed and cookies are cleared.

Validate (optional if `/api/auth/validate` exists):
```bash
curl -i -X POST "$BASE/api/auth/session" -b cookies.txt
```
- Expect `200` when valid; `401` when not.

Logout:
```bash
curl -i -X POST "$BASE/api/auth/logout" -b cookies.txt
```
- Expect cookies cleared; subsequent `/api/auth/session` should return guest.

Negative cases:
- Wrong password on login → `401` and `success:false`.
- Hit `/api/auth/login` >5 times in 15m → `429` from rate limiter.
- Delete/alter `refresh_token` cookie then POST `/api/auth/refresh` → expect `401`, session cleared.

## Browser checks
- Login through UI: should redirect to dashboard; cookies are HttpOnly (inspect via devtools Application → Cookies, values should be HttpOnly).
- Cross-tab sync: login in tab A; tab B should become authenticated after reload; logout in tab B should unauth tab A.
- Idle >1h: app’s refresh timer should keep you logged in; if blocked, you should be logged out cleanly.
- If you wire CSRF header on client, mismatched token should block login.

## Optional Playwright smoke (outline)
- Write a test that:
  1) visits `/login`, submits creds, waits for dashboard.
  2) hits `/api/auth/session` via page.request and asserts `authenticated:true`.
  3) reloads and confirms still authenticated.
  4) calls `/api/auth/refresh` via page.request and asserts 200.
  5) logs out via UI, then `/api/auth/session` shows guest.

Keep `cookies.txt` around per run; delete between users to avoid leaking sessions.

