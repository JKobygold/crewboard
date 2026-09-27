// Button crawler: in every screen of the app, clicks every clickable control (and every option inside the
// menus they open) from a fresh state, and records crashes, console errors, unclickable controls and
// controls that do nothing.
'use strict';
const { chromium, startServer, reset, openPage, fingerprint } = require('./lib.cjs');

const nav = (id) => async (p) => { await p.click(`.nav-item[data-id="${id}"]`); await p.waitForTimeout(80); };
const STATES = [
  { name: 'hackathon · Main table', setup: nav('b_hackathon') },
  { name: 'hackathon · subitems open', setup: async (p) => { await nav('b_hackathon')(p); await p.locator('.expand:not(.none)').first().click(); } },
  { name: 'hackathon · Cards', setup: async (p) => { await nav('b_hackathon')(p); await p.click('[data-action="view"][data-v="cards"]'); } },
  { name: 'general · Main table', setup: nav('b_general') },
  { name: 'general · Timeline', setup: async (p) => { await nav('b_general')(p); await p.click('[data-action="view"][data-v="timeline"]'); } },
  { name: 'general · Kanban', setup: async (p) => { await nav('b_general')(p); await p.click('[data-action="view-add"]'); await p.click('#pop [data-action="add-view"][data-v="kanban"]'); } },
  { name: 'general · search open', setup: async (p) => { await nav('b_general')(p); await p.click('[data-action="tb-search"]'); await p.fill('#tool-search', 'web'); await p.waitForTimeout(250); } },
  { name: 'hackathon · 2 rows selected', setup: async (p) => { await nav('b_hackathon')(p); const cb = p.locator('[data-action="sel"]'); await cb.nth(0).click(); await cb.nth(1).click(); } },
  { name: 'task panel · Updates', scope: '#drawer-root', setup: async (p) => { await nav('b_hackathon')(p); await p.locator('[data-action="open-item"]').nth(10).click(); } },
  { name: 'task panel · Subitems', scope: '#drawer-root', setup: async (p) => { await nav('b_hackathon')(p); await p.locator('[data-action="open-item"]').nth(10).click(); await p.click('[data-action="dtab"][data-v="subitems"]'); } },
  { name: 'task panel · Activity', scope: '#drawer-root', setup: async (p) => { await nav('b_hackathon')(p); await p.locator('[data-action="open-item"]').nth(10).click(); await p.click('[data-action="dtab"][data-v="activity"]'); } },
  { name: 'Dashboard', setup: async (p) => { await p.click('[data-action="nav-dash"]'); } },
  { name: 'My work', setup: async (p) => { await p.click('.rail [data-action="nav-mywork"]'); } },
  { name: 'Workspace · Members', setup: async (p) => { await p.click('.rail [data-action="nav-ws"]'); } },
  { name: 'Workspace · Boards', setup: async (p) => { await p.click('.rail [data-action="nav-ws"]'); await p.click('[data-action="ws-tab"][data-v="boards"]'); } },
  { name: 'Invite dialog', scope: '#modal-root', setup: async (p) => { await p.click('.bh-actions [data-action="invite"]'); } },
  { name: 'Favorites panel', setup: async (p) => { await p.click('[data-action="fav"]'); await p.click('[data-action="rail-fav"]'); } },
  { name: 'Panel collapsed', setup: async (p) => { await p.click('[data-action="panel-close"]'); } },
];
// Controls that legitimately change nothing visible when clicked in this exact state.
const QUIET_OK = new Set(['focus-search', 'modal-bg', 'view', 'dtab', 'ws-tab', 'nav-board', 'nav-dash', 'nav-mywork', 'nav-ws']);

async function visibleActions(page, scope) {
  return page.evaluate((scope) => {
    const root = scope ? document.querySelector(scope) : document;
    const out = []; const count = {};
    root.querySelectorAll('[data-action]').forEach((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.closest('[hidden]')) return;
      const a = el.dataset.action; const i = count[a] = (count[a] || 0) + 1;
      if (i > 1) return; // one sample of each control type per screen
      out.push({ action: a, nth: i - 1, label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) });
    });
    return out;
  }, scope || null);
}
const loc = (page, scope, d) => page.locator((scope ? scope + ' ' : '') + `[data-action="${d.action}"]:visible`).nth(d.nth);

async function probe(browser, srv, state, steps) {
  // steps: [{scope, d}] clicked in order; returns result for the last one
  await reset(srv.port);
  const page = await openPage(browser, srv);
  const res = { state: state.name, path: steps.map((s) => s.d.action + (s.d.label ? ' “' + s.d.label + '”' : '')).join(' › '), ok: true, issues: [] };
  try {
    await state.setup(page);
    await page.waitForTimeout(120);
    for (let i = 0; i < steps.length; i++) {
      const { scope, d } = steps[i];
      const before = await fingerprint(page);
      try { await loc(page, scope, d).click({ timeout: 1500 }); }
      catch (e) { res.ok = false; res.issues.push('UNCLICKABLE: ' + e.message.split('\n')[0]); break; }
      await page.waitForTimeout(220);
      const after = await fingerprint(page);
      if (i === steps.length - 1) {
        res.popOpen = await page.evaluate(() => !document.getElementById('pop').hidden);
        if (before === after && !QUIET_OK.has(d.action)) { res.ok = false; res.issues.push('NO_EFFECT: nothing on screen changed'); }
      }
    }
  } catch (e) { res.ok = false; res.issues.push('SETUP: ' + e.message.split('\n')[0]); }
  if (page.errors.length) { res.ok = false; res.issues.push(...page.errors.map((x) => 'ERROR: ' + x)); }
  res.page = page;
  return res;
}

async function crawlState(browser, srv, state, log) {
  const results = [];
  await reset(srv.port);
  const page = await openPage(browser, srv);
  let top;
  try { await state.setup(page); await page.waitForTimeout(150); top = await visibleActions(page, state.scope);
    if (state.name.includes('selected')) top = top.concat(await visibleActions(page, '#bulk')).filter((d, i, arr) => arr.findIndex((x) => x.action === d.action && x.nth === d.nth) === i); }
  catch (e) { results.push({ state: state.name, path: '(setup)', ok: false, issues: ['SETUP: ' + e.message.split('\n')[0]] }); await page.ctx.close().catch(() => {}); return results; }
  await page.ctx.close().catch(() => {});
  for (const d of top) {
    const r = await probe(browser, srv, state, [{ scope: state.scope, d }]);
    let subs = [];
    if (r.popOpen) subs = (await visibleActions(r.page, '#pop')).slice(0, 8);
    await r.page.ctx.close().catch(() => {}); delete r.page; results.push(r); log(r);
    for (const sd of subs) {
      const r2 = await probe(browser, srv, state, [{ scope: state.scope, d }, { scope: '#pop', d: sd }]);
      await r2.page.ctx.close().catch(() => {}); delete r2.page; delete r2.popOpen; results.push(r2); log(r2);
    }
  }
  return results;
}

async function crawl({ workers = 6, basePort = 4100, onResult } = {}) {
  const servers = Array.from({ length: workers }, (_, i) => startServer(basePort + i));
  await Promise.all(servers.map((s) => s.ready));
  const browser = await chromium.launch();
  const queue = STATES.slice(); const all = [];
  const log = onResult || (() => {});
  await Promise.all(servers.map(async (srv) => {
    while (queue.length) { const st = queue.shift(); all.push(...await crawlState(browser, srv, st, log)); }
  }));
  await browser.close(); servers.forEach((s) => s.stop());
  return all;
}

module.exports = { crawl, STATES };
if (require.main === module) {
  crawl({ onResult: (r) => { if (!r.ok) console.log('✗', r.state, '|', r.path, '|', r.issues.join(' ; ')); } })
    .then((all) => { const bad = all.filter((r) => !r.ok); console.log(`\n${all.length - bad.length}/${all.length} clicks OK`); process.exit(bad.length ? 1 : 0); });
}
