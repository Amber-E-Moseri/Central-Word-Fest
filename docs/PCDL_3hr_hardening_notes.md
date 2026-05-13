# PCDL 3-Hour Hardening Notes (2026-05-13)

## Scope Completed
- Auth/signup flow hardened with clearer validation and inline auth error/success messaging.
- `app.js` reduced by extracting auth/session and live data logic into:
  - `app/auth-flow.js`
  - `app/data.js`
- Live people/reflection pages kept active via overrides in `app/data.js`.
- Added RLS policy hardening migration:
  - `sql/20260513_harden_profiles_self_update.sql`
- Fixed key UI encoding artifacts in `index.html` (close icon and circle text).

## Manual Regression Checklist
1. Sign up as `Member` with fellowship selected.
2. Sign up as `Coordinator` with fellowship selected.
3. Sign in and sign out.
4. Open `People` page and verify live list loads.
5. Post a community reflection.
6. Open person detail as an allowed oversight role.
7. Confirm a non-oversight role cannot open person detail.

## Follow-Up
- Apply all SQL migrations in Supabase and re-test role update and person-detail access.
- Continue encoding cleanup in `app.js` legacy UI strings.
- Add lightweight browser E2E checks for signup/login/community flows.
