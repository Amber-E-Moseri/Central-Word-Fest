# Production Deployment Runbook

## Platform config
- Runtime: Node.js 20+ (`package.json` engines)
- Build command: `npm run build`
- Start command: `npm run start`
- Health check: `GET /api/health`

## Environment variable mapping

### Client-safe only
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Server-only
- `SUPABASE_SERVICE_ROLE_KEY` (never in browser bundle)

### Script/local only
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_ACCESS_TOKEN` (optional)
- `PCDL_EMAIL` / `PCDL_PASSWORD` (optional; local/CI only)

## Staging checklist
1. Deploy current commit to staging.
2. Confirm `/api/health` returns `status=ok`.
3. Verify homepage loads and script bootstrap succeeds.
4. Verify signup/login/logout flow with staging users.
5. Verify Today page loads without JS console errors.
6. Verify circle page loads with both:
   - no relationships
   - existing relationships
7. Verify admin media manager reads/writes day and item rows.
8. Verify media fallback and source link behavior.
9. Verify `POST /api/client-errors` receives test payload.

## Smoke test checklist (production immediately after deploy)
1. Open `/` on desktop and mobile.
2. Sign in and refresh page (session persistence).
3. Load Today page and submit one reflection.
4. Open Circle page and confirm empty state or data state.
5. Call `/api/health` and confirm timestamp updates.
6. Check server logs for:
   - error spikes
   - client-error route traffic
   - 5xx responses

## Rollback plan
1. Keep previous production deployment ID in release notes.
2. If critical regression is detected:
   - rollback to previous deployment immediately.
   - keep DB schema unchanged (additive migrations only).
3. Disable scheduled media refresh job if it contributes to failure.
4. Capture incident timeline and impacted user actions.

## Known risk register
1. Frontend runtime remains script-driven (`public/pcdl/app.js`), not fully React-native.
2. Circle assignment flow still has legacy local-state paths that need full Supabase write migration.
3. Automated test coverage is minimal.
4. Rate-limit controls are handled upstream (platform/WAF), not app-level.

## GO/NO-GO gate
- GO only if all commands pass:
  - `npm run build`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
- NO-GO if auth flow or circle flow fails in staging smoke tests.

