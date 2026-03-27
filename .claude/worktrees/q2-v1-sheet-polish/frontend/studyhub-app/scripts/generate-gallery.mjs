#!/usr/bin/env node
/**
 * generate-gallery.mjs
 *
 * Reads every PNG in tests/screenshots/ and generates a self-contained
 * HTML gallery grouped by page → theme → viewport. Open the resulting
 * file in a browser to review the full app UI in 2–3 minutes.
 *
 * Usage:  node scripts/generate-gallery.mjs
 * Output: tests/screenshots/gallery.html
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SCREENSHOTS_DIR = resolve(import.meta.dirname, '..', 'tests', 'screenshots')

let files
try {
  files = readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png')).sort()
} catch {
  console.error('No screenshots directory found. Run the visual-baseline suite first:')
  console.error('  npx playwright test visual-baseline --project=chromium')
  process.exit(1)
}

if (files.length === 0) {
  console.error('No screenshots found. Run the visual-baseline suite first.')
  process.exit(1)
}

// Parse filenames: page--theme--viewport.png
const entries = files.map((f) => {
  const [page, theme, viewportRaw] = f.replace('.png', '').split('--')
  return { file: f, page, theme, viewport: viewportRaw }
})

// Group by page
const byPage = new Map()
for (const entry of entries) {
  if (!byPage.has(entry.page)) byPage.set(entry.page, [])
  byPage.get(entry.page).push(entry)
}

const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StudyHub Visual Gallery — ${timestamp}</title>
<style>
  :root { --bg: #f8fafc; --card: #fff; --text: #1e293b; --muted: #64748b; --border: #e2e8f0; --accent: #3b82f6; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --muted: #94a3b8; --border: #334155; --accent: #60a5fa; }
  }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }
  .toc { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 2rem; }
  .toc a { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.375rem 0.75rem; font-size: 0.8125rem; color: var(--accent); text-decoration: none; }
  .toc a:hover { background: var(--accent); color: #fff; }
  .page-group { margin-bottom: 3rem; }
  .page-group h2 { font-size: 1.25rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.375rem; margin-bottom: 1rem; text-transform: capitalize; }
  .variant-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 1rem; }
  .variant-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .variant-label { display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .variant-label .theme { color: var(--accent); }
  .variant-label .vp { color: var(--muted); }
  .variant-card img { width: 100%; display: block; cursor: zoom-in; }
  .variant-card img.zoomed { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; object-fit: contain; background: rgba(0,0,0,0.85); z-index: 999; cursor: zoom-out; }
  .stats { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 2rem; display: flex; gap: 2rem; flex-wrap: wrap; }
  .stat { text-align: center; }
  .stat .n { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
  .stat .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; }
</style>
</head>
<body>

<h1>StudyHub Visual Gallery</h1>
<p class="meta">Generated ${timestamp} &middot; ${files.length} screenshots across ${byPage.size} pages</p>

<div class="stats">
  <div class="stat"><div class="n">${byPage.size}</div><div class="label">Pages</div></div>
  <div class="stat"><div class="n">${files.length}</div><div class="label">Screenshots</div></div>
  <div class="stat"><div class="n">${new Set(entries.map((e) => e.viewport)).size}</div><div class="label">Viewports</div></div>
  <div class="stat"><div class="n">${new Set(entries.map((e) => e.theme)).size}</div><div class="label">Themes</div></div>
</div>

<nav class="toc">
${[...byPage.keys()].map((p) => `  <a href="#${p}">${p.replace(/-/g, ' ')}</a>`).join('\n')}
</nav>

${[...byPage.entries()]
  .map(
    ([page, variants]) => `<div class="page-group" id="${page}">
  <h2>${page.replace(/-/g, ' ')}</h2>
  <div class="variant-grid">
${variants
  .map(
    (v) => `    <div class="variant-card">
      <div class="variant-label"><span class="theme">${v.theme}</span><span class="vp">${v.viewport}</span></div>
      <img src="${v.file}" alt="${v.page} ${v.theme} ${v.viewport}" loading="lazy" onclick="this.classList.toggle('zoomed')">
    </div>`
  )
  .join('\n')}
  </div>
</div>`
  )
  .join('\n\n')}

<script>
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('img.zoomed').forEach((img) => img.classList.remove('zoomed'))
  }
})
</script>
</body>
</html>`

const outPath = join(SCREENSHOTS_DIR, 'gallery.html')
writeFileSync(outPath, html, 'utf-8')
console.log(`Gallery written to ${outPath}`)
console.log(`${files.length} screenshots across ${byPage.size} pages`)
