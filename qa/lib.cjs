// Shared helpers for the Crewboard QA loop.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const ROOT = path.join(__dirname, '..');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || ''] }))); }

const IGNORE = [/ERR_TUNNEL_CONNECTION_FAILED/, /fonts\.(googleapis|gstatic)/, /favicon/];

function startServer(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewboard-qa-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dir, CREWBOARD_TEST: '1', CREWBOARD_PASSWORD: '' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    child.stdout.on('data', (d) => { if (String(d).includes('running')) { clearTimeout(t); resolve(); } });
    child.on('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return { port, child, dir, ready, base: 'http://localhost:' + port + '/', stop() { child.kill(); } };
}

function reset(port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: '/api/__reset', method: 'POST' }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end();
  });
}
function getState(port) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: '/api/state' }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function openPage(browser, srv, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, opts || {}));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) page.errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => { page.errors.push('dialog opened: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.goto(srv.base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell', { timeout: 8000 });
  await page.waitForTimeout(150);
  page.ctx = ctx;
  return page;
}

// A cheap fingerprint of everything the user can see, to tell whether a click did anything.
function fingerprint(page) {
  return page.evaluate(() => {
    const ids = ['app', 'drawer-root', 'modal-root', 'bulk', 'pop', 'toast'];
    let s = ids.map((id) => { const el = document.getElementById(id); return el ? (el.hidden ? 'H' : '') + el.innerHTML : ''; }).join('|');
    s += '|theme:' + (document.documentElement.dataset.theme || '');
    s += '|focus:' + (document.activeElement ? document.activeElement.outerHTML.slice(0, 120) : '');
    const m = document.querySelector('.main'); if (m) s += '|scroll:' + m.scrollTop;
    let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return h;
  });
}

module.exports = { chromium, startServer, reset, getState, openPage, fingerprint, ROOT };
