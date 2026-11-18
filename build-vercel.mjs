import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// This component has its own entry page; the public website is a separate repo.
const output = new URL('./vercel-public/', import.meta.url);
const source = new URL('./dist/', import.meta.url);
const files = ['admin.js', 'admin.css', 'admin-mobile.css', 'data.js', 'release.json', 'assets/event-recreated.png', 'assets/favicon.svg'];
let html = await readFile(new URL('admin.html', source), 'utf8');
html = html.replace('class="brand" href="/"', 'class="brand" href="https://genzexpo.vercel.app/"')
  .replace('href="/#halls" class="site-link"', 'href="https://genzexpo.vercel.app/#halls" class="site-link"');
// Read all inputs before replacing the generated output, so incomplete exports fail.
await Promise.all(files.map(file => readFile(new URL(file, source))));
await rm(output, { recursive: true, force: true });
await mkdir(new URL('assets/', output), { recursive: true });
await writeFile(new URL('index.html', output), html);
await Promise.all(files.map(file => copyFile(new URL(file, source), new URL(file, output))));
console.log('Built standalone admin portal in vercel-public/ (no public website build required).');
