# genzexpoadmin

Password-protected stall administration and shared booking backend for **Erode Genz Agri Expo 2027**.

Admins can mark or unmark any of the 193 stalls. The public map receives the saved Booked tags. This repository contains the admin frontend, mobile styles, Worker API, D1 schema/migrations, tests and build tools. Runtime credentials and live database contents are excluded.

The public website is in [connectjawa-glitch/genzexpo](https://github.com/connectjawa-glitch/genzexpo).

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
