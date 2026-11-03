# Look archive

The original Look page is preserved verbatim in `LookPage.tsx`. It is outside the App Router, so it is not a public route. `/look` redirects to `/play`.

The Look API routes, Vercel Blob media and metadata, Pinterest integration, and admin controls are retained. No stored content was deleted or migrated.

To restore: move `LookPage.tsx` back to `src/app/look/page.tsx`, replacing the redirect, and restore the Look navigation entry and white-page condition in `src/components/Navigation.tsx`. The `look` route name remains reserved.
