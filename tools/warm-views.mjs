// Precompute (warm) the default dashboard view of the ACTIVE snapshot through the deployed public
// API, right after a Sheets sync. The deployment itself computes and persists the view in
// snapshot_views (keyed by snapshot id + engine + filter), so no extra database privilege is needed
// and the engine key always matches the running code. Prints timings and status codes only.
//   GREENCALL_WARM_URL=https://... node tools/warm-views.mjs
const base = process.env.GREENCALL_WARM_URL;
if (!base) { console.log(JSON.stringify({ ok: false, skipped: true, reason: 'GREENCALL_WARM_URL not configured' })); process.exit(0); }
const VIEWS = ['/api/dashboard']; // default filters = the executive overview every visitor opens
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function timed(path) {
  const t0 = performance.now();
  const r = await fetch(base + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(120000) });
  await r.arrayBuffer();
  return { status: r.status, ms: Math.round(performance.now() - t0) };
}
const report = { ok: true, views: [] };
for (const path of VIEWS) {
  let first;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { first = await timed(path); if (first.status < 500) break; } catch (e) { first = { status: 0, ms: null, error: String(e.name) }; }
    await sleep(2000 * 2 ** attempt);
  }
  const second = first?.status === 200 ? await timed(path).catch(() => ({ status: 0, ms: null })) : null;
  report.views.push({ path, first, second });
  if (first?.status !== 200 || second?.status !== 200) report.ok = false;
}
console.log(JSON.stringify(report));
process.exit(report.ok ? 0 : 1);
