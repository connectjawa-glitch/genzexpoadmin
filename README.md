# genzexpoadmin

Password-protected stall administration and shared booking backend for **Erode Genz Agri Expo 2027**.

Admins can set any of the 193 stalls to **Available**, **Reserved** or **Sold out**, then save the change. The public map displays Reserved and Sold out tags; sold-out stalls block enquiry and reserved drafts include a warning. This repository contains the admin frontend, mobile styles, Worker API, D1 schema/migrations, tests and build tools. Runtime credentials and live database contents are excluded.

The public website is in [connectjawa-glitch/genzexpo](https://github.com/connectjawa-glitch/genzexpo).

## Deploy this admin repository on Vercel

Import this repository with **Root Directory `./`**. The committed `vercel.json` configures the **Other** framework, build command `node build-vercel.mjs`, and output directory `vercel-public`. Remove any dashboard overrides that still run the combined Worker build. No dependency installation or Python is required for the Vercel deployment.

The admin sign-in page is available at `/` and `/admin`. Its public-hall links point to `https://genzexpo.vercel.app/#halls`. To verify locally, use Node.js 24 and run:

```sh
npm run build:vercel
npm run check:vercel
node verify-admin.mjs
node verify-admin-client.mjs
```

Vercel functions under `api/` relay only the booking feed, admin session, sign-in, sign-out and stall updates to the existing backend at `https://erode-genz-agri-expo-2027.surprisingiris2.chatgpt.site`. This preserves the existing admin password, database and public Booked tags. The original backend must remain deployed. No password, database export or production session is copied into this repository or the static output.

The relay checks the portal's incoming origin before translating the upstream origin, accepts only the admin session cookie, rejects redirects, and disables API caching. Session cookies are secure, HTTP-only and host-only on the admin portal. Sign-in on the original Site and sign-in on Vercel use separate browser sessions. The backend's login throttle can be shared by requests from Vercel's outgoing IP; wait for its stated retry interval if it is reached.

`EXPO_BACKEND_ORIGIN` is an optional **server-only** Vercel environment variable for moving the backend later. It must be an HTTPS origin without a trailing slash, path or query, serving the same authenticated API and booking database. Leave it unset for the existing backend. Database/password secrets remain on that backend; do not add them to frontend environment variables.

The appended status-column migration is schema-only. Existing Booked records remain Sold out without a data backfill or reset. Apply migrations on the Worker/D1 backend before deploying the updated admin UI; the Vercel relay itself does not run database migrations. Named status updates and legacy boolean updates both retain revision conflict checks. An administrator can change any saved status later.

## Combine the components and build

Use Node.js 24 or newer and Python 3. Clone both repositories as siblings:

```sh
git clone https://github.com/connectjawa-glitch/genzexpoadmin.git
git clone https://github.com/connectjawa-glitch/genzexpo.git
cd genzexpoadmin
python -c "import shutil; shutil.copytree('../genzexpo/dist', 'dist', dirs_exist_ok=True); shutil.copyfile('../genzexpo/README-WEBSITE.md', 'README-WEBSITE.md')"
npm ci
npm run build
npm run check
```

Merge only the public working files; do not copy its `.git` directory. The source repositories remain separated. This combined working copy is needed for a complete build because the public map and admin portal are components of the same Worker application.

The resulting Worker is `dist/server/index.js`. The public homepage is `/`, administration is `/admin`, and the public booking feed is `/api/bookings`. Downloadable component archives retain a stable `erode-genz-expo/` folder regardless of the checkout directory name. `npm run split-zips` writes them to `exports/`.

## Hosting and runtime configuration

The source `.openai/hosting.json` declares D1 binding `DB` and retains the original Sites project ID. Use that identity only when updating the original Site; configure a different hosting project explicitly when deploying elsewhere.

Apply the committed `drizzle/` migrations through the host's migration workflow. Configure `ADMIN_PASSWORD_HASH` as a server-only secret using the documented PBKDF2 format. Never place a password or its production hash in source or client code. Existing sessions expire after eight hours; rotating the hash invalidates them.

The API uses secure HTTP-only session cookies, same-origin write checks, login throttling and revision checks. The frontend and API must share an origin unless an explicit cross-origin integration is implemented. No initial booking tags are invented by the source code.

See `PROJECT-NOTES.md`, `README-ADMIN.md` and the source verification notes for deployment, asset and brochure limitations. Read generated build files as outputs; edit `worker/`, `db/`, `drizzle/` and the authored frontend files instead.

## Current expo branding

The original organiser-supplied expo PNG is preserved unchanged in `dist/assets/expo-logo-original.png`. The public header/footer and admin brand use that same file. Public layouts include larger readable text and Brain Factory credits under both Organised by and Powered by, with a smaller partner mark. The Vercel-specific configuration and shared booking backend are retained.
