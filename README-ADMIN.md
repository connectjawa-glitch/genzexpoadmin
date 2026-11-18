# Admin portal and booking backend

This ZIP contains the admin HTML, JavaScript, desktop/mobile CSS, shared stall data/logo, Worker booking API, database schema/migrations, tests and build configuration. Passwords, sessions and live booking database contents are not included.

These are two components of the same website, not two independent deployments. To restore the complete project, extract the website ZIP and this admin ZIP into the same parent directory. Both use the folder `erode-genz-expo`; merge their contents and keep the identical shared files.

From the restored project run `npm ci`, `npm run build`, then `npm run check`. See README.md for the Worker/D1 hosting setup and the server-only ADMIN_PASSWORD_HASH runtime secret. The existing `.openai/hosting.json` retains the original Site ID; use it only when updating that same Site.

The admin page is served at /admin. API requests use the same origin, and the public map reads the shared /api/bookings endpoint. Keep the backend and website together when deploying the restored project.
