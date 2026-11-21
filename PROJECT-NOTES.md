# Erode Genz Agri Expo 2027

## Booking administration

`/admin` is a separate password-protected booking portal. Choose a hall/stall, select **Available**, **Reserved** or **Sold out**, then save; the server confirms each edit. The public map refreshes tags every 20 seconds while visible and when revisited. Reserved stalls show a warning and include their status in the WhatsApp draft. Sold-out stalls show a popup and cannot be selected for enquiry. Stall-specific WhatsApp handoffs require a fresh status check. Availability and booking terms still require organiser confirmation.

The appended schema-only migration adds a three-state status without rewriting booking records. Existing Booked records resolve to Sold out. Legacy boolean API clients remain compatible; new clients send a named status and revision. The original migration and admin password remain unchanged.

Booking records and hashed admin sessions use the Sites-provisioned D1 `DB` binding. The schema and generated initial migration are in `db/` and `drizzle/`; future schema changes require new migrations. No initial booked stalls are invented or imported. Status records persist across site releases.

The server reads `ADMIN_PASSWORD_HASH` from Sites runtime secrets, using `pbkdf2_sha256$100000$<base64 salt>$<base64 32-byte hash>`. The password and its hash are absent from source and backup files. Updating this secret and deploying invalidates existing sessions. Sessions expire after 8 hours; logout revokes the current session. Login is rate limited, write requests require an exact same-origin request, and revision checks prevent one admin session overwriting another session's newer edit.

Run `node prepare-release.mjs`, the check scripts, then `node build-worker.mjs` and `node verify-worker.mjs`. The custom Worker embeds the existing public assets and admin page, preserving all public content/links. Its build enforces a 10 MiB compressed artifact ceiling. Deployment archives include the hosting manifest, `dist/` and generated `drizzle/` migrations. Generated `dist/server/` is excluded from browser release hashing and downloadable source backups to prevent recursive bundles.

Buildless, multilingual exhibition site. The deployed static root is `dist/`.

## Run

Use any ordinary HTTP static server pointed at `dist/`. In the managed Sites environment, use `sites-preview start /workspace/sites/erode-genz-expo`. ES modules need HTTP; opening index.html as a local file will not provide the full experience.

## Content and layout

- `dist/data.js`: all 193 stalls, brochure tiers/prices, source map colors, schematic relative geometry, facilities, walking paths and calendar event.
- `dist/i18n.js`: 190 content/control keys in English, Tamil, Hindi, Malayalam, Kannada and Telugu. The language selector persists locally.
- `dist/scene.js`: locally hosted Three.js 3D model, selectable booths, orbit/zoom, animated aisle visitors, guided tour, pause and source-note labels.
- `dist/app.js`: page interactions, accessible flat map and numbered directory, category/number filtering, tariffs, programme tabs, enquiry dialog, data/calendar downloads.
- `dist/records/source-record.md`: full ordered visual transcription and cross-source audit of 15 supplied images.
- `dist/records/stalls.json` / `stalls.csv`: machine-readable stall records.

## Important source limitations

The expo logo original is now preserved unchanged in `dist/assets/expo-logo-original.png` (supplied by the user through Drive on 21 November 2026). Original binaries for the earlier references were not available in the execution workspace. Images were read visually from chat. Original posters, other exact logos, aerial venue photographs and QR payload are NOT backed up. Files named `*-recreated.png` are reference-derived image-generation reconstructions, not original logo extractions. `agri-future.png` is newly generated concept artwork, not venue photography. See `dist/records/asset-manifest.json`.

Hall 1's orange size legend is inconsistent with its total and tariff sheet; 114–116 have a specific size/color conflict. Hall 2 prints 198 where its price sheet requires 149; the page explicitly shows a source note. No dimension units, general admission policy, daily expo operating hours, named confirmed guests or live booking feed were supplied. Enquiry links open organiser phone numbers; no booking is submitted.

The model is a schematic interpretation of the supplied floor layouts, not a surveyed architectural model or live occupancy system. Programmes, prices and venue claims follow the brochure and require organiser confirmation.

## Before final brand release

Replace reconstructed PNGs with the original approved logo assets, retain originals in a separate backup, add actual supplied aerial venue photographs, resolve the dimension schedule and 149/198 numbering with the organiser, and verify translations with native speakers. Three.js is vendored under MIT; fonts are requested from Google Fonts. Browser fallback remains available without WebGL.

## Verification

Run `node verify.mjs`. It validates stall identifiers, dimensions/bounds, tariff and color counts, all language entries, source annotations and referenced local files. Browser QA status is documented in `dist/records/verification.md`.

## Hall explorer revision

The map uses `circulation.js` as a single source for 20 directed lanes, interrupted perimeter walls and three masonry pathway barriers matching the supplied close-ups. The divider between stalls 31/89 reaches the 46/88 block and splits the top cross-aisle. The lower Hall 1 divider is centred on the shared boundary between stalls 28 and 45 and extends below the block; stall 45's east aisle remains clear. Hall 2's LED/173 boundary remains separated from the open aisle beside 172/174. Arrows and visitors stop before barriers; that aisle remains open. `plan-view.js` handles accessible SVG selection, pan, pinch, zoom and spatial keyboard selection. `canvas-scene.js` supplies an interactive orthographic 3D fallback. The tour uses lane chapters, not invented closed circulation loops. See records/circulation-audit.json.

## Renderer release preparation

Run `node prepare-release.mjs` after changing browser JavaScript or CSS, then `npm run check`. The preparer fingerprints the complete local module graph and updates its URLs consistently, so a new page cannot mix cached renderer modules from an older deployment. `dist/release.json` records the current code release.

## WhatsApp enquiries
The enquiry dialog snapshots the selected stall and prepares a localized draft for+917305749636. Visitors enter their name/mobile and optional business/message, review the draft and explicitly open WhatsApp through a UTF-8 GET form. Only the reviewed message text is submitted; WhatsApp controls the final Send action. Details are kept only in the current page's form, with no booking or server storage.
Run `node prepare-release.mjs` after code/style changes, then `npm run check` to include WhatsApp and release-graph regressions.

## Separate component downloads

`/records/erode-genz-admin.zip` contains the admin portal, backend and build/database setup. `/records/erode-genz-website.zip` contains the public pages, hall maps and assets. Both preserve the same project folder; extract both together for the complete build. See README-ADMIN.md and README-WEBSITE.md.

The server selects the existing compressed ZIP entries from the complete source backup, preserving exact file contents without embedding duplicate large archives. `npm run split-zips` creates the same two ZIPs in /workspace/exports for local delivery. Passwords, live booking records, sessions and generated server output are excluded as documented.

## Original expo branding
`dist/assets/expo-logo-original.png` is the user-supplied original PNG, used by the header, footer and admin brand without image processing. The source backup stores PNG/JPEG assets as uncompressed ZIP entries; the Worker reuses their exact byte ranges rather than embedding duplicate image copies. Both component downloads still include their required original assets. The build verifies every image range against the original file bytes.
