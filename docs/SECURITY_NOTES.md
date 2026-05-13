# Security Notes

## Frontend key policy
- Frontend code (`index.html`, `auth.js`, `app.js`, `config.js`) uses only:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Do not place `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ACCESS_TOKEN`, or user session JWTs in frontend files.

## Script key policy
- Local scripts under `scripts/` read privileged tokens from local `.env` only.
- `.env` is gitignored and must not be committed.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to browser JS.

## Token rotation
- A previously exposed session JWT should be treated as compromised.
- Rotate by signing out active sessions / revoking sessions in the Supabase dashboard and re-authenticating.
- If any service role key is exposed, rotate it immediately in Supabase project settings.
