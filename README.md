# PCDL Platform

Central Summer Word Fest / Rock Solid accountability platform.

## Primary app entry

- Production frontend is the Next.js App Router homepage:
  - `app/page.tsx`
  - Runtime UI scripts under `public/pcdl/*`
  - Shared styling in `styles.css`

## Local scripts

- `npm run pcdl:login`
- `npm run pcdl:collect-links`
- `npm run pcdl:refresh`

## Security

- Browser app uses Supabase anon key only.
- Keep privileged tokens in local `.env` for scripts only.
- See [`docs/SECURITY_NOTES.md`](/c:/Users/moser/Downloads/pcdl_live_clean_fellowship_fix/pcdl_supabase_app/docs/SECURITY_NOTES.md).

## Archived/legacy

- Legacy RAF financial scaffold is archived under `archive/raf` and is not deployed.
- Legacy standalone HTML entrypoint has been removed from production routing.
# Central-Word-Fest
