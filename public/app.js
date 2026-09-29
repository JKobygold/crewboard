/* Crewboard — workspace-style project boards.
   Workspace → boards & dashboards → groups → tasks → subitems.
   Per-board columns (Owner, Status, Priority, Date, Timeline, Tags, Notes, Progress),
   views (Main table, Cards, Kanban, Timeline), delegation, updates, activity log, My work, dashboards. */
'use strict';
(function () {
  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => (p || '') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => isoDay(new Date());
  const addDaysTo = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDay(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return MONTHS[m - 1] + ' ' + dd + (y !== new Date().getFullYear() ? ', ' + y : ''); };
  const fmtAgo = (ts) => { const m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + 'm'; const h = Math.round(m / 60); if (h < 24) return h + 'h'; const d = Math.round(h / 24); return d < 30 ? d + 'd' : new Date(ts).toLocaleDateString(); };
  // Update text with @mentions highlighted. Names are matched longest-first so "Jo" never steals "Jordan Lee".
  function richText(text) {
    let html = esc(text || '');
    people.slice().sort((a, b) => b.name.length - a.name.length).forEach((p) => { const tok = '@' + esc(p.name); if (html.includes(tok)) html = html.split(tok).join('<span class="mention">' + tok + '</span>'); });
    return html;
  }
  const mentionsIn = (text) => people.filter((p) => (text || '').includes('@' + p.name)).map((p) => p.id);
  const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } };

  // ---------- icons ----------
  const P = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    userPlus: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5M18.5 7.5v6M15.5 10.5h6"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    mywork: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
    star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
    users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><circle cx="16.5" cy="9" r="2.5"/><path d="M16 14.2c2.3.1 4 1.5 4.5 4.3"/>',
    dots: '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
    right: '<path d="m10 7 5 5-5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    person: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.6 18.4c1.3-2 3.2-3 5.4-3s4.1 1 5.4 3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    sort: '<path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3"/>',
    hide: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4 4l16 16"/>',
    groupby: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/>',
    bubble: '<path d="M5 5h14v10h-8l-4 3.5V15H5z"/>',
    bubblePlus: '<path d="M5 5h14v10h-8l-4 3.5V15H5z"/><path d="M12 7.5v5M9.5 10h5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    collapse: '<path d="m11 7-5 5 5 5M18 7l-5 5 5 5"/>',
    expandR: '<path d="m13 7 5 5-5 5M6 7l5 5-5 5"/>',
    dash: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8.5 16v-3.5M12 16V8.5M15.5 16v-5.5"/>',
    board: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9.5h16M9 9.5V19"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5.2M12 16.2h.01"/>',
    ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    okCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.8-5"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14.5h16M10 10v9"/>',
    cards: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    kanban: '<rect x="4" y="4" width="4.5" height="16" rx="1"/><rect x="10" y="4" width="4.5" height="11" rx="1"/><rect x="16" y="4" width="4" height="7" rx="1"/>',
    timeline: '<path d="M4 7h9M8 12h11M6 17h8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/>',
    move: '<path d="M5 12h13M14 8l4 4-4 4"/>',
    handoff: '<path d="M4 12h11M11 8l4 4-4 4"/><circle cx="19" cy="12" r="1.8"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    text: '<path d="M5 7h14M5 12h14M5 17h9"/>',
    hash: '<path d="M9 4 7 20M17 4l-2 16M4 9h16M4 15h16"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    thumb: '<path d="M7 11v9H4v-9h3Zm3 9h7.2a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.4 10H14V6a2 2 0 0 0-2-2l-2 7v9Z"/>',
  };
  const ic = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[n] + '</svg>';

  // ---------- vocabulary ----------
  // Status labels. Every board starts with these four; "Edit labels" in the status menu renames, recolors and adds more per board.
  // The keys 'done', 'working', 'stuck' and 'todo' carry meaning (roll-ups, My work, dashboards), so they can be renamed but not removed.
  const DEFAULT_STATUSES = [
    { key: 'working', label: 'Working on it', color: '#fdab3d' },
    { key: 'done', label: 'Done', color: '#00c875' },
    { key: 'stuck', label: 'Stuck', color: '#e2445c' },
    { key: 'todo', label: 'Not Started', color: '#c4c4c4' },
  ];
  const CORE_STATUS = new Set(DEFAULT_STATUSES.map((s) => s.key));
  const LABEL_COLORS = ['#fdab3d', '#00c875', '#e2445c', '#c4c4c4', '#0086c0', '#9d50dd', '#ff642e', '#037f4c', '#579bfc', '#cab641', '#ffcb00', '#333333', '#bb3354', '#ff158a', '#ff5ac4', '#784bd1', '#9cd326', '#66ccff', '#808080', '#7f5347', '#ff7575', '#ffadad', '#e8697d', '#9aadbd', '#68a1bd', '#225091', '#4eccc6', '#5559df', '#a25ddc', '#2b76e5', '#2da283'];
  const statuses = (b) => (b && Array.isArray(b.statuses) && b.statuses.length ? b.statuses : DEFAULT_STATUSES);
  const sdef = (b, k) => statuses(b).find((s) => s.key === k) || DEFAULT_STATUSES.find((s) => s.key === k) || { key: k, label: k, color: '#c4c4c4' };
  const inkFor = (hex) => { const n = parseInt(String(hex || '').replace('#', '').padEnd(6, '0').slice(0, 6), 16); const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? '#323338' : '#fff'; };
  const stStyle = (def) => 'style="background:' + esc(def.color) + ';color:' + inkFor(def.color) + '"';
  const PRIO = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  const PRIO_ORDER = ['critical', 'high', 'medium', 'low'];
  const COLS = {
    owners: { title: 'Owner', w: 100 },
    status: { title: 'Status', w: 140 },
    priority: { title: 'Priority', w: 120 },
    due: { title: 'Due date', w: 130 },
    timeline: { title: 'Timeline', w: 170 },
    tags: { title: 'Tags', w: 130 },
    notes: { title: 'Notes', w: 140 },
    progress: { title: 'Progress', w: 140 },
    text: { title: 'Text', w: 170 },
    number: { title: 'Numbers', w: 110 },
    checkbox: { title: 'Checkbox', w: 90 },
    link: { title: 'Link', w: 180 },
  };
  const VIEWS = { table: ['Main table', 'table'], cards: ['Cards', 'cards'], kanban: ['Kanban', 'kanban'], timeline: ['Timeline View', 'timeline'], calendar: ['Calendar', 'cal'] };
  const GROUP_COLORS = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#037f4c', '#ff642e', '#66ccff', '#784bd1', '#ff158a', '#9cd326', '#bb3354'];
  const PERSON_COLORS = ['#579bfc', '#e2445c', '#00a9a0', '#e2a91b', '#9d50dd', '#ff642e', '#4f8ef7', '#bb3354', '#037f4c', '#784bd1'];

  // ---------- state ----------
  let people = [];
  let ws = { name: 'Main workspace', order: [], dashboards: [] };
  let boards = {};
  let loaded = false;
  let readOnly = false;
  const deletedBoards = new Set();
  const ui = {
    section: 'board', id: null, views: {}, panel: true, panelMode: 'ws',
    drawer: null, drawerShown: null, dtab: 'updates', sel: new Set(), open: new Set(), collapsed: new Set(),
    f: {}, me: lsGet('cb:me'), favs: new Set(JSON.parse(lsGet('cb:favs') || '[]')),
    mwPerson: null, mwDone: false, wsTab: 'members', dashF: { q: '', person: null }, modal: null, dirty: false,
  };
  const F = (bid) => ui.f[bid] || (ui.f[bid] = { q: '', searchOpen: false, person: null, status: [], priority: [], tags: [], sort: null, hidden: [], groupBy: '' });


  // Merge two copies of a board task-by-task so teammates editing different tasks never overwrite each other.
  function mergeBoard(base, inc) {
    if (!base) return inc;
    const del = new Map();
    (base.deletedTasks || []).concat(inc.deletedTasks || []).forEach((d) => { if (!del.has(d.id) || del.get(d.id) < d.at) del.set(d.id, d.at); });
    const pick = new Map();
    (base.tasks || []).forEach((t) => pick.set(t.id, t));
    (inc.tasks || []).forEach((t) => { const o = pick.get(t.id); if (!o || (t.u || 0) >= (o.u || 0)) pick.set(t.id, t); });
    const order = (inc.tasks || []).map((t) => t.id);
    (base.tasks || []).forEach((t) => { if (!order.includes(t.id)) order.push(t.id); });
    const tasks = order.map((id) => pick.get(id)).filter((t) => !(del.has(t.id) && del.get(t.id) >= (t.u || 0)));
    const out = Object.assign({}, inc, { tasks, deletedTasks: Array.from(del, ([id, at]) => ({ id, at })).slice(-300) });
    const gids = new Set((out.groups || []).map((g) => g.id));
    tasks.forEach((t) => { if (!gids.has(t.groupId)) { const g = (base.groups || []).find((x) => x.id === t.groupId); if (g) { out.groups = (out.groups || []).concat([g]); gids.add(g.id); } } });
    return out;
  }
  const remote = {};
  // ---------- store ----------
  const pending = new Map();
  const chains = new Map();
  const store = {
    mode: 'local', db: null, inflight: 0, version: 0,
    async init() {
      let db = null;
      try { if (window.claude && typeof window.claude.use === 'function') db = await window.claude.use('db'); } catch (e) { db = null; }
      if (db) { this.mode = 'db'; this.db = db; this.subscribe(); return; }
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('api/state', { cache: 'no-store' });
          if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
            const s = await r.json();
            this.mode = 'server'; this.version = s.version;
            people = s.people || []; ws = s.workspace || ws; boards = s.boards || {};
            loaded = true; boot(); this.poll(); return;
          }
        } catch (e) { /* no server: fall back to this browser */ }
      }
      let data = null;
      try { const raw = lsGet('cb2:data'); if (raw) data = JSON.parse(raw); } catch (e) { data = null; }
      if (!data && window.CREWBOARD_SEED) data = clone(window.CREWBOARD_SEED);
      if (!data) { const b = newBoard('My first board'); data = { people: [], workspace: { name: 'Main workspace', order: [b.id], dashboards: [] }, boards: { [b.id]: b } }; }
      people = data.people || []; ws = data.workspace || ws; boards = data.boards || {};
      loaded = true; boot();
    },
    subscribe() {
      const got = { t: false, w: false, b: false };
      const after = () => { if (!got.t || !got.w || !got.b) return; if (!loaded) { loaded = true; boot(); } else softRender(); };
      this.db.doc('team/roster').onSnapshot((s) => { if (!pending.has('team')) people = s.exists ? clone(s.data().people || []) : []; got.t = true; after(); }, onDbError);
      this.db.doc('workspace/main').onSnapshot((s) => { if (!pending.has('ws') && s.exists) ws = clone(s.data()); got.w = true; after(); }, onDbError);
      this.db.collection('boards').onSnapshot((q) => {
        const next = {};
        q.docs.forEach((d) => { if (deletedBoards.has(d.id)) return; remote[d.id] = clone(d.data()); next[d.id] = pending.has('b:' + d.id) && boards[d.id] ? boards[d.id] : clone(d.data()); });
        for (const id in boards) if (!next[id] && pending.has('b:' + id)) next[id] = boards[id];
        boards = next; got.b = true; after();
      }, onDbError);
    },
    queue(key, fn) {
      clearTimeout(pending.get(key));
      pending.set(key, setTimeout(() => {
        pending.delete(key);
        const prev = chains.get(key) || Promise.resolve();
        chains.set(key, prev.then(() => { store.inflight += 1; return Promise.resolve().then(fn).finally(() => { store.inflight -= 1; }); }).catch(onWriteError));
      }, 350));
    },
    // ---- server mode (self-hosted, e.g. Railway) ----
    api(method, url, body) {
      return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
        .then((r) => { if (!r.ok) throw { code: r.status === 401 ? 'invalid_argument' : r.status === 413 ? 'quota_exceeded' : 'unavailable' }; return r.json(); });
    },
    poll() {
      const tick = async () => {
        try {
          if (!pending.size && !this.inflight && !document.hidden) {
            const v = await fetch('api/version', { cache: 'no-store' }).then((r) => r.json());
            if (v.version !== this.version && !pending.size && !this.inflight) {
              const s = await fetch('api/state', { cache: 'no-store' }).then((r) => r.json());
              if (!pending.size && !this.inflight) {
                this.version = s.version;
                people = s.people || []; ws = s.workspace || ws;
                const next = s.boards || {}; deletedBoards.forEach((id) => delete next[id]); boards = next;
                softRender();
              }
            }
          }
        } catch (e) { /* offline for a moment; try again next tick */ }
        setTimeout(tick, 4000);
      };
      setTimeout(tick, 4000);
    },
    saveBoard(id) {
      if (this.mode === 'local') return saveLocal();
      if (this.mode === 'server') return this.queue('b:' + id, () => (boards[id] ? this.api('PUT', 'api/boards/' + encodeURIComponent(id), boards[id]) : null));
      this.queue('b:' + id, () => { if (!boards[id]) return null; const merged = mergeBoard(remote[id], clone(boards[id])); boards[id] = merged; return this.db.doc('boards/' + id).set(clone(merged)); });
    },
    saveWs() {
      if (this.mode === 'local') return saveLocal();
      if (this.mode === 'server') return this.queue('ws', () => this.api('PUT', 'api/workspace', ws));
      this.queue('ws', () => this.db.doc('workspace/main').set(clone(ws)));
    },
    savePeople() {
      if (this.mode === 'local') return saveLocal();
      if (this.mode === 'server') return this.queue('team', () => this.api('PUT', 'api/team', { people }));
      this.queue('team', () => this.db.doc('team/roster').set({ people: clone(people) }));
    },
    deleteBoard(id) {
      if (this.mode === 'local') return saveLocal();
      if (this.mode === 'server') { deletedBoards.add(id); clearTimeout(pending.get('b:' + id)); pending.delete('b:' + id); this.api('DELETE', 'api/boards/' + encodeURIComponent(id)).catch(onWriteError); return; }
      deletedBoards.add(id); clearTimeout(pending.get('b:' + id)); pending.delete('b:' + id);
      this.db.doc('boards/' + id).delete().catch(onWriteError);
    },
    restoreBoard(id) { deletedBoards.delete(id); this.saveBoard(id); },
  };
  let localTimer = null;
  function saveLocal() { clearTimeout(localTimer); localTimer = setTimeout(() => lsSet('cb2:data', JSON.stringify({ people, workspace: ws, boards })), 200); }
  function onWriteError(e) {
    const code = e && e.code;
    if (code === 'invalid_argument') { readOnly = true; toast('You have view-only access, so changes aren’t saved.'); render(); }
    else if (code === 'quota_exceeded') toast('This workspace is full. Delete an old board to make room.');
    else toast('Couldn’t save that change. Check your connection and try again.');
  }
  function onDbError() { toast('Live sync stopped. Reload the page to reconnect.'); }

  // ---------- model helpers ----------
  function newBoard(name) {
    const g1 = uid('g_');
    return {
      id: uid('b_'), name, kind: 'board', description: '', createdAt: Date.now(), views: ['table'],
      columns: [{ type: 'owners', title: 'Owner' }, { type: 'status', title: 'Status' }, { type: 'due', title: 'Due date' }],
      tagOptions: [], groups: [{ id: g1, name: 'Group Title', color: GROUP_COLORS[0] }], tasks: [],
    };
  }
  const person = (id) => people.find((p) => p.id === id);
  const pname = (id) => (person(id) || {}).name || 'Someone';
  const board = (id) => boards[id];
  const dashboard = (id) => (ws.dashboards || []).find((d) => d.id === id);
  function navItems() {
    const seen = new Set();
    const out = [];
    (ws.order || []).forEach((id) => { if (seen.has(id)) return; if (boards[id] || dashboard(id)) { out.push(id); seen.add(id); } });
    Object.values(boards).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach((b) => { if (!seen.has(b.id)) { out.push(b.id); seen.add(b.id); } });
    (ws.dashboards || []).forEach((d) => { if (!seen.has(d.id)) { out.push(d.id); seen.add(d.id); } });
    return out;
  }
  const allBoards = () => navItems().filter((id) => boards[id]).map((id) => boards[id]);
  function locate(tid) {
    for (const b of Object.values(boards)) { const t = (b.tasks || []).find((x) => x.id === tid); if (t) return { b, t }; }
    return null;
  }
  const subOf = (t, sid) => (t.subtasks || []).find((s) => s.id === sid);
  const isLate = (due, st) => !!due && st !== 'done' && due < today();
  const hasCol = (b, type) => (b.columns || []).some((c) => c.type === type);
  function progressOf(t) {
    const s = t.subtasks || [];
    if (s.length) return s.filter((x) => x.status === 'done').length / s.length;
    return t.status === 'done' ? 1 : 0;
  }
  function logAct(t, text) {
    t.activity = t.activity || [];
    t.activity.unshift({ at: Date.now(), by: ui.me, text });
    if (t.activity.length > 60) t.activity.length = 60;
  }
  const boardOf = (t) => Object.values(boards).find((b) => (b.tasks || []).includes(t)) || null;
  const slabel = (s, b) => (s ? sdef(b, s).label : 'Blank');
  function setStatus(t, s, sub) {
    const b = boardOf(t);
    if (sub) {
      const was = sub.status; sub.status = s;
      logAct(t, 'Subitem “' + sub.name + '”: ' + slabel(was, b) + ' → ' + slabel(s, b));
      const subs = t.subtasks;
      if (subs.length && subs.every((x) => x.status === 'done') && t.status !== 'done') { logAct(t, 'Status: ' + slabel(t.status, b) + ' → ' + slabel('done', b) + ' (all subitems done)'); t.status = 'done'; celebrate(t.id); }
      else if (t.status === 'done' && s !== 'done') t.status = 'working';
      else if ((!t.status || t.status === 'todo') && s && s !== 'todo') t.status = 'working';
      if (s === 'done') celebrate(t.id, sub.id);
      return;
    }
    if (t.status === s) return;
    logAct(t, 'Status: ' + slabel(t.status, b) + ' → ' + slabel(s, b));
    t.status = s;
    if (s === 'done') { (t.subtasks || []).forEach((x) => { x.status = 'done'; }); celebrate(t.id); }
  }
  // The little "done" celebration monday.com plays on a status label: queued here, played after the next render.
  const toCelebrate = [];
  function celebrate(tid, sid) { toCelebrate.push({ tid, sid: sid || '' }); }
  function playCelebrations() {
    while (toCelebrate.length) {
      const c = toCelebrate.shift();
      document.querySelectorAll('[data-action="status"][data-tid="' + CSS.escape(c.tid) + '"]' + (c.sid ? '[data-sid="' + CSS.escape(c.sid) + '"]' : ':not([data-sid])')).forEach((el) => {
        el.classList.remove('celebrate'); void el.offsetWidth; el.classList.add('celebrate');
        setTimeout(() => el.classList.remove('celebrate'), 1100);
      });
    }
  }

  // ---------- mutation ----------
  let undoSnap = null;
  function guard() { if (readOnly) { toast('You have view-only access to this workspace.'); return false; } return true; }
  function mutate(b, fn, opts) {
    if (!guard()) return;
    const before = b ? new Map((b.tasks || []).map((t) => [t.id, JSON.stringify(t)])) : null;
    fn();
    if (b) {
      const now = Date.now();
      const after = new Set();
      (b.tasks || []).forEach((t) => { after.add(t.id); const was = before.get(t.id); if (was === undefined) t.u = now; else if (was !== JSON.stringify(t)) t.u = now; });
      before.forEach((_, id) => { if (!after.has(id)) { b.deletedTasks = (b.deletedTasks || []).concat([{ id, at: now }]).slice(-300); } });
      b.updatedAt = now; store.saveBoard(b.id);
    }
    if (opts && opts.ws) store.saveWs();
    if (opts && opts.people) store.savePeople();
    render();
  }
  function snapshotUndo(label) {
    undoSnap = { people: clone(people), ws: clone(ws), boards: clone(boards) };
    toast(label, () => {
      if (!undoSnap) return;
      const s = undoSnap; undoSnap = null;
      people = s.people; ws = s.ws;
      const now = Date.now();
      for (const id in s.boards) { const b = s.boards[id]; b.deletedTasks = []; (b.tasks || []).forEach((t) => { t.u = now; }); boards[id] = b; store.restoreBoard(id); }
      store.savePeople(); store.saveWs(); render();
    });
  }

  // ---------- small renderers ----------
  function av(id, cls) {
    const p = person(id); if (!p) return '';
    return '<span class="av ' + (cls || '') + '" style="--c:' + esc(p.color) + '" data-tip="' + esc(p.name) + '">' + esc(initials(p.name)) + '</span>';
  }
  function stack(ids, max) {
    const v = (ids || []).filter(person);
    if (!v.length) return '<span class="av-empty">' + ic('person') + '</span>';
    max = max || 2;
    let h = v.slice(0, max).map((id) => av(id)).join('');
    if (v.length > max) h += '<span class="av more">+' + (v.length - max) + '</span>';
    return '<span class="stack">' + h + '</span>';
  }
  const A = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => 'data-' + k + '="' + esc(v) + '"').join(' ');
  const cellOwners = (ids, at, max) => '<button class="owners-btn" data-action="owners" ' + at + ' aria-label="Owner">' + stack(ids, max) + '</button>';
  const cellStatus = (s, at, b) => { const d = s ? sdef(b, s) : null; return '<button class="label-cell ' + (s ? 'st-' + esc(s) : '') + '" ' + (d ? stStyle(d) : '') + ' data-action="status" ' + at + '>' + (d ? '<span class="lbl">' + esc(d.label) + '</span>' : '<span class="sr-only">Set status</span>') + '</button>'; };
  const cellPrio = (p, at) => '<button class="label-cell ' + (p ? 'pr-' + p : '') + '" data-action="priority" ' + at + '>' + (p ? esc(PRIO[p]) : '<span class="sr-only">Set priority</span>') + '</button>';
  function cellDate(d, st, at) {
    const done = st === 'done';
    const flag = d ? (done ? '<span class="flag ok">' + ic('ok') + '</span>' : isLate(d, st) ? '<span class="flag late" data-tip="Overdue">' + ic('alert') + '</span>' : '') : '';
    return '<button class="date-btn' + (done && d ? ' done' : '') + '" data-action="date" ' + at + '>' + flag + (d ? '<span class="txt">' + esc(fmtDate(d)) + '</span>' : '<span class="ph">' + ic('cal', 'sm') + '</span>') + '</button>';
  }
  function cellTimeline(t, at) {
    if (!t.start && !t.due) return '<button class="date-btn" data-action="timeline" ' + at + '><span class="ph">' + ic('cal', 'sm') + '</span></button>';
    const s = t.start || t.due, e = t.due || t.start;
    const total = Math.max(1, daysBetween(s, e) + 1);
    const el = Math.min(total, Math.max(0, daysBetween(s, today()) + 1));
    const pct = t.status === 'done' ? 100 : Math.round((el / total) * 100);
    const lbl = s === e ? fmtDate(s) : fmtDate(s) + ' - ' + (s.slice(0, 7) === e.slice(0, 7) ? String(Number(e.slice(8))) : fmtDate(e));
    return '<button class="date-btn" data-action="timeline" ' + at + ' style="padding:0 8px"><span class="tl-pill"><i style="width:' + pct + '%"></i><span>' + esc(lbl) + '</span></span></button>';
  }
  const cellTags = (tags, at) => '<button class="tags-btn" data-action="tags" ' + at + '>' + (tags || []).map((x) => '<span class="chip">' + esc(x) + '</span>').join('') + '</button>';
  const cellNotes = (n, at) => '<input class="notes-in" data-edit="notes" ' + at + ' value="' + esc(n || '') + '" aria-label="Notes">';
  const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '');
  const safeUrl = (u) => { const v = String(u || '').trim(); if (/^https?:\/\//i.test(v)) return v; if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '#'; return 'https://' + v; };
  const progCell = (f) => '<div class="prog"><div class="prog-bar"><i style="width:' + Math.round(f * 100) + '%"></i></div><span>' + Math.round(f * 100) + '%</span></div>';
  function cellFor(type, t, at, b) {
    switch (type) {
      case 'owners': return cellOwners(t.owners, at);
      case 'status': return cellStatus(t.status, at, b);
      case 'priority': return cellPrio(t.priority, at);
      case 'due': return cellDate(t.due, t.status, at);
      case 'timeline': return cellTimeline(t, at);
      case 'tags': return cellTags(t.tags, at);
      case 'notes': return cellNotes(t.notes, at);
      case 'progress': return progCell(progressOf(t));
      case 'text': return '<input class="notes-in" data-edit="text" ' + at + ' value="' + esc(t.text || '') + '" aria-label="Text">';
      case 'number': return '<input class="notes-in num-in" data-edit="number" inputmode="decimal" ' + at + ' value="' + esc(t.number == null || t.number === '' ? '' : fmtNum(t.number)) + '" aria-label="Number">';
      case 'checkbox': return '<button class="cb' + (t.checked ? ' on' : '') + '" data-action="check" ' + at + ' aria-label="' + (t.checked ? 'Checked' : 'Not checked') + '" aria-pressed="' + !!t.checked + '"></button>';
      case 'link': return '<span class="link-cell"><input class="notes-in" data-edit="link" ' + at + ' value="' + esc(t.link || '') + '" placeholder="https://" aria-label="Link">' + (t.link ? '<a href="' + esc(safeUrl(t.link)) + '" target="_blank" rel="noopener" data-tip="Open link">' + ic('link', 'sm') + '</a>' : '') + '</span>';
    }
    return '';
  }
  function battery(list, key, cls, order, labels, colorOf) {
    if (!list.length) return '';
    const counts = {}; list.forEach((x) => { const k = x[key] || ''; counts[k] = (counts[k] || 0) + 1; });
    const keys = order.concat(['']).filter((k) => counts[k]);
    Object.keys(counts).forEach((k) => { if (!keys.includes(k)) keys.splice(keys.length - 1, 0, k); });
    return '<div class="battery">' + keys.map((k) => '<i class="' + (k ? cls(k) : 'st-empty') + '" style="flex:' + counts[k] + (k && colorOf ? ';background:' + esc(colorOf(k)) : '') + '" data-tip="' + esc((k ? labels(k) : 'Blank') + ': ' + counts[k] + ' of ' + list.length + ' (' + Math.round((counts[k] / list.length) * 100) + '%)') + '"></i>').join('') + '</div>';
  }
  const statusBattery = (list, b) => battery(list, 'status', (k) => 'st-' + k, statuses(b).map((s) => s.key), (k) => sdef(b, k).label, (k) => sdef(b, k).color);
  const prioBattery = (list) => battery(list, 'priority', (k) => 'pr-' + k, PRIO_ORDER, (k) => PRIO[k]);

  // ---------- filtering / grouping ----------
  function matches(t, f) {
    const q = (f.q || '').trim().toLowerCase();
    if (q && !t.name.toLowerCase().includes(q) && !(t.text || '').toLowerCase().includes(q) && !(t.subtasks || []).some((s) => s.name.toLowerCase().includes(q)) && !(t.tags || []).some((x) => x.toLowerCase().includes(q))) return false;
    if (f.person && !(t.owners || []).includes(f.person) && !(t.subtasks || []).some((s) => (s.owners || []).includes(f.person))) return false;
    if (f.status.length && !f.status.includes(t.status || '')) return false;
    if (f.priority.length && !f.priority.includes(t.priority || '')) return false;
    if (f.tags.length && !(t.tags || []).some((x) => f.tags.includes(x))) return false;
    return true;
  }
  function sortTasks(list, sort, b) {
    if (!sort) return list;
    const dir = sort.dir === 'desc' ? -1 : 1;
    const sorder = statuses(b).map((s) => s.key);
    const key = {
      name: (t) => t.name.toLowerCase(),
      status: (t) => (t.status ? sorder.indexOf(t.status) : 99),
      priority: (t) => (t.priority ? PRIO_ORDER.indexOf(t.priority) : 9),
      due: (t) => t.due || '9999',
      timeline: (t) => t.start || t.due || '9999',
      owners: (t) => ((t.owners || [])[0] ? pname(t.owners[0]).toLowerCase() : '~'),
      tags: (t) => ((t.tags || [])[0] || '~').toLowerCase(),
      notes: (t) => (t.notes || '~').toLowerCase(),
      progress: (t) => progressOf(t),
      text: (t) => (t.text || '~').toLowerCase(),
      number: (t) => (t.number === '' || t.number == null ? Infinity : Number(t.number)),
      checkbox: (t) => (t.checked ? 0 : 1),
      link: (t) => (t.link || '~').toLowerCase(),
    }[sort.type] || (() => 0);
    return list.slice().sort((a, b) => { const x = key(a), y = key(b); return x < y ? -dir : x > y ? dir : 0; });
  }
  function viewGroups(b) {
    const f = F(b.id);
    const tasks = (b.tasks || []).filter((t) => matches(t, f));
    if (!f.groupBy) {
      return (b.groups || []).map((g) => ({ g, real: true, tasks: sortTasks(tasks.filter((t) => t.groupId === g.id), f.sort, b) }));
    }
    let defs;
    if (f.groupBy === 'status') defs = statuses(b).map((s) => ({ key: s.key, name: s.label, color: s.color })).concat([{ key: '', name: 'Blank', color: '#797e93' }]);
    else if (f.groupBy === 'priority') defs = PRIO_ORDER.map((k, i) => ({ key: k, name: PRIO[k], color: ['#784bd1', '#df2f4a', '#fdab3d', '#00c875'][i] })).concat([{ key: '', name: 'Blank', color: '#797e93' }]);
    else defs = people.map((p) => ({ key: p.id, name: p.name, color: p.color })).concat([{ key: '', name: 'Unassigned', color: '#797e93' }]);
    const keyOf = (t) => (f.groupBy === 'owner' ? ((t.owners || []).find(person) || '') : (t[f.groupBy] || ''));
    return defs.map((d) => {
      const list = tasks.filter((t) => keyOf(t) === d.key);
      return { g: { id: 'v_' + f.groupBy + '_' + (d.key || 'none'), name: d.name, color: d.color }, real: false, vkey: d.key || '__none', tasks: sortTasks(list, f.sort, b) };
    }).filter((x) => x.tasks.length);
  }

  // ---------- shell ----------
  function effectiveTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function myAlerts() {
    const out = [];
    const fresh = Date.now() - 7 * 864e5;
    for (const b of allBoards()) for (const t of b.tasks || []) {
      if ((t.owners || []).includes(ui.me) && t.status !== 'done' && (isLate(t.due, t.status) || t.status === 'stuck')) out.push({ b, t });
      (t.updates || []).forEach((u) => { if (u.at > fresh && u.author !== ui.me && ((u.mentions || []).includes(ui.me) || (u.replies || []).some((r) => r.at > fresh && r.author !== ui.me && (u.author === ui.me || (r.mentions || []).includes(ui.me))))) out.push({ b, t }); });
    }
    return out;
  }
  function renderTop() {
    const me = person(ui.me);
    const alerts = myAlerts().length;
    return '<header class="topbar">' +
      '<div class="brand"><span class="mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="word">Crewboard</span></div>' +
      '<div class="global-search">' + ic('search', 'sm') + '<input id="gsearch" type="search" placeholder="Search for anything..." autocomplete="off" aria-label="Search for anything"></div>' +
      '<div class="top-actions">' +
      '<button class="top-btn" data-action="notif" aria-label="Notifications" data-tip="Notifications">' + ic('bell') + (alerts ? '<span class="badge">' + alerts + '</span>' : '') + '</button>' +
      '<button class="top-btn hide-sm" data-action="invite" aria-label="Invite members" data-tip="Invite members">' + ic('userPlus') + '</button>' +
      '<button class="top-btn hide-sm" data-action="theme" aria-label="Switch theme" data-tip="' + (effectiveTheme() === 'dark' ? 'Light mode' : 'Dark mode') + '">' + ic('moon') + '</button>' +
      '<button class="me-btn" data-action="me-menu" aria-label="Your profile">' + (me ? av(me.id, 'lg') : '<span class="av-empty">' + ic('person') + '</span>') + '</button>' +
      '</div></header>';
  }
  function renderRail() {
    const b = (icon, label, cur, action) => '<button class="rail-btn" data-action="' + action + '" aria-current="' + cur + '"><span class="ico">' + ic(icon) + '</span>' + label + '</button>';
    return '<nav class="rail" aria-label="Main">' +
      b('grid', 'Workspace', ui.panel && ui.panelMode === 'ws', 'rail-ws') +
      b('mywork', 'My work', ui.section === 'mywork', 'nav-mywork') +
      '<div class="rail-sep"></div>' +
      b('star', 'Favorites', ui.panel && ui.panelMode === 'fav', 'rail-fav') +
      b('users', 'Team', ui.section === 'workspace', 'nav-ws') +
      '</nav>';
  }
  function navRow(id) {
    const cur = ui.id === id && (ui.section === 'board' || ui.section === 'dash');
    if (boards[id]) return '<button class="nav-item" data-action="nav-board" data-id="' + esc(id) + '" aria-current="' + cur + '" data-tip="' + esc(boards[id].name) + '">' + ic('board', 'sm') + '<span class="n">' + esc(boards[id].name) + '</span>' + (ui.favs.has(id) ? '<span class="star">' + ic('star', 'sm') + '</span>' : '') + '</button>';
    const d = dashboard(id);
    return '<button class="nav-item" data-action="nav-dash" data-id="' + esc(id) + '" aria-current="' + cur + '" data-tip="' + esc(d.name) + '">' + ic('dash', 'sm') + '<span class="n">' + esc(d.name) + '</span></button>';
  }
  function renderPanel() {
    if (!ui.panel) return '<aside class="panel collapsed"><button class="icon-btn" data-action="panel-open" aria-label="Expand panel">' + ic('expandR', 'sm') + '</button></aside>';
    let h = '<aside class="panel" aria-label="Workspace">';
    if (ui.panelMode === 'fav') {
      const favs = navItems().filter((id) => ui.favs.has(id));
      h += '<div class="panel-head"><span class="title">Favorites</span><button class="icon-btn" data-action="panel-close" aria-label="Collapse panel">' + ic('collapse', 'sm') + '</button></div>';
      h += favs.length ? '<div class="nav">' + favs.map(navRow).join('') + '</div>' : '<p class="muted" style="margin:0 6px;font-size:13px">Star a board from its header to keep it here.</p>';
      return h + '</aside>';
    }
    h += '<div class="panel-head"><span class="title">Workspace</span><button class="icon-btn" data-action="focus-search" aria-label="Search">' + ic('search', 'sm') + '</button><button class="icon-btn" data-action="panel-close" aria-label="Collapse panel">' + ic('collapse', 'sm') + '</button></div>';
    h += '<div class="ws-row"><button class="ws-switch" data-action="ws-menu"><span class="ws-logo">' + esc(initials(ws.name).slice(0, 1)) + '</span><span class="n">' + esc(ws.name) + '</span>' + ic('down', 'sm') + '</button><button class="sq-btn" data-action="add-menu" aria-label="Add board or dashboard" data-tip="Add item">' + ic('plus', 'sm') + '</button></div>';
    h += '<div class="nav"><button class="nav-item" data-action="nav-mywork" aria-current="' + (ui.section === 'mywork') + '">' + ic('mywork', 'sm') + '<span class="n">My work</span></button></div>';
    h += '<div class="panel-label"><span>Content</span><button class="icon-btn" data-action="add-menu" aria-label="Add board or dashboard">' + ic('plus', 'sm') + '</button></div>';
    h += '<div class="nav"><button class="nav-item" data-action="nav-ws" aria-current="' + (ui.section === 'workspace') + '">' + ic('settings', 'sm') + '<span class="n">Manage workspace</span></button>' + navItems().map(navRow).join('') + '</div>';
    h += '<div class="panel-foot"><span class="dot' + (store.mode !== 'local' ? '' : ' local') + '"></span>' + (store.mode !== 'local' ? (readOnly ? 'View only' : 'Shared with your team') : 'Saved in this browser') + '</div>';
    return h + '</aside>';
  }

  // ---------- board page ----------
  function curView(b) { const v = ui.views[b.id]; return v && (b.views || []).includes(v) ? v : (b.views || ['table'])[0]; }
  function renderBoard(b) {
    const f = F(b.id);
    const view = curView(b);
    const activeFilters = f.status.length + f.priority.length + f.tags.length;
    let h = '<div class="board-top"><div class="board-head"><div class="bh-row">' +
      '<button class="board-name" data-action="board-menu">' + esc(b.name) + ic('down') + '</button>' +
      '<button class="icon-btn fav' + (ui.favs.has(b.id) ? ' on' : '') + '" data-action="fav" aria-label="Favorite" data-tip="' + (ui.favs.has(b.id) ? 'Remove from favorites' : 'Add to favorites') + '">' + ic('star', 'sm') + '</button>' +
      '<div class="bh-actions"><button class="outline-btn" data-action="invite">' + ic('userPlus', 'sm') + 'Invite / ' + people.length + '</button><button class="icon-btn" data-action="board-menu" aria-label="Board options">' + ic('dots') + '</button></div>' +
      '</div>';
    h += '<div class="tabs" role="tablist">' + (b.views || ['table']).map((v, i) => '<button class="tab" role="tab" data-action="view" data-v="' + v + '" aria-selected="' + (v === view) + '">' + (i === 0 ? '' : ic(VIEWS[v][1], 'sm')) + esc(VIEWS[v][0]) + (i > 0 ? '<span class="x" data-action="view-remove" data-v="' + v + '" aria-label="Remove view">×</span>' : '') + '</button>').join('') +
      '<button class="tab" data-action="view-add" aria-label="Add view" data-tip="Add view">' + ic('plus', 'sm') + '</button></div>';
    h += '</div>';
    h += '<div class="toolbar">' +
      '<span class="split"><button data-action="new-task">New task</button><button class="caret" data-action="new-menu" aria-label="More options">' + ic('down', 'sm') + '</button></span>' +
      (f.searchOpen || f.q ? '<input class="tool-search" id="tool-search" placeholder="Search this board" value="' + esc(f.q) + '" aria-label="Search this board">' : '<button class="tool" data-action="tb-search">' + ic('search', 'sm') + 'Search</button>') +
      '<button class="tool' + (f.person ? ' on' : '') + '" data-action="tb-person">' + (f.person ? av(f.person) : ic('person', 'sm')) + 'Person</button>' +
      '<button class="tool' + (activeFilters ? ' on' : '') + '" data-action="tb-filter">' + ic('filter', 'sm') + 'Filter' + (activeFilters ? '<span class="cnt">' + activeFilters + '</span>' : '') + ic('down', 'sm') + '</button>' +
      '<button class="tool' + (f.sort ? ' on' : '') + '" data-action="tb-sort">' + ic('sort', 'sm') + 'Sort</button>' +
      (view === 'table' ? '<button class="tool' + (f.hidden.length ? ' on' : '') + '" data-action="tb-hide">' + ic('hide', 'sm') + 'Hide' + (f.hidden.length ? '<span class="cnt">' + f.hidden.length + '</span>' : '') + '</button>' +
        '<button class="tool' + (f.groupBy ? ' on' : '') + '" data-action="tb-groupby">' + ic('groupby', 'sm') + 'Group by' + (f.groupBy ? ': ' + ({ status: 'Status', priority: 'Priority', owner: 'Person' })[f.groupBy] : '') + '</button>' : '') +
      '<button class="tool" data-action="tb-more" aria-label="More">' + ic('dots', 'sm') + '</button>' +
      '</div>';
    h += '</div>';
    if (view === 'table') h += renderTable(b);
    else if (view === 'cards') h += renderCards(b);
    else if (view === 'kanban') h += renderKanban(b);
    else if (view === 'calendar') h += renderCalendar(b);
    else h += renderTimeline(b);
    return h;
  }

  const colW = (c) => Math.max(70, Number(c.w) || COLS[c.type].w);
  function visibleCols(b) { const f = F(b.id); return (b.columns || []).filter((c) => !f.hidden.includes(c.type)); }
  function renderTable(b) {
    const cols = visibleCols(b);
    const tpl = '6px 40px 420px ' + cols.map((c) => colW(c) + 'px').join(' ') + ' 48px';
    const canDrag = !F(b.id).groupBy;
    if (!(b.groups || []).length) return '<div class="empty-state"><h2>This board has no groups</h2><p>Groups hold your tasks. Use them for phases, weeks or teams.</p><button class="primary-btn" data-action="new-group">Add new group</button></div>';
    const vg = viewGroups(b);
    const f = F(b.id);
    let h = '<div class="board-body">';
    if (!vg.length) h += '<div class="empty-state"><h2>No tasks match</h2><p>Nothing on this board matches your search or filters.</p><button class="outline-btn" data-action="clear-filters">Clear filters</button></div>';
    vg.forEach((x) => {
      const g = x.g;
      const closed = ui.collapsed.has(g.id);
      h += '<section class="group" style="--g:' + esc(g.color) + '">';
      h += '<div class="group-head"><button class="chev' + (closed ? ' closed' : '') + '" data-action="group-toggle" data-gid="' + esc(g.id) + '" aria-label="' + (closed ? 'Expand' : 'Collapse') + ' group">' + ic('down') + '</button>' +
        (x.real ? '<input class="group-name" data-edit="group-name" data-gid="' + esc(g.id) + '" value="' + esc(g.name) + '" aria-label="Group name">' : '<span class="group-name" style="border:0">' + esc(g.name) + '</span>') +
        '<span class="group-count">' + x.tasks.length + (x.tasks.length === 1 ? ' Task' : ' Tasks') + '</span>' +
        (x.real ? '<button class="icon-btn" data-action="group-menu" data-gid="' + esc(g.id) + '" aria-label="Group options">' + ic('dots', 'sm') + '</button>' : '') + '</div>';
      if (closed) { h += '</section>'; return; }
      h += '<div class="tbl" style="--tpl:' + tpl + '" role="table" aria-label="' + esc(g.name) + '">';
      const allSel = x.tasks.length && x.tasks.every((t) => ui.sel.has(t.id));
      h += '<div class="tr th" role="row"><div class="c-bar"></div><div class="c-check"><button class="cb' + (allSel ? ' on' : '') + '" data-action="sel-group" data-gid="' + esc(g.id) + '" aria-label="Select all in group"></button></div><div class="c-name">Task</div>' +
        cols.map((c) => '<div class="c-col"><div class="col-head"><span class="t">' + esc(c.title || COLS[c.type].title) + '</span>' + (f.sort && f.sort.type === c.type ? '<span class="muted">' + (f.sort.dir === 'asc' ? '↑' : '↓') + '</span>' : '') + '<button class="icon-btn" data-action="col-menu" data-col="' + c.type + '" aria-label="Column options">' + ic('dots', 'sm') + '</button></div><span class="col-resize" data-resize="' + c.type + '" title="Drag to resize"></span></div>').join('') +
        '<div class="c-plus"><button class="plus-col" data-action="col-add" aria-label="Add column" data-tip="Add column">' + ic('plus', 'sm') + '</button></div></div>';
      x.tasks.forEach((t) => { h += taskRow(t, cols, b, canDrag && x.real); });
      h += '<div class="tr add"><div class="c-bar"></div><div class="c-check"></div><div class="c-name" style="grid-column: 3 / -1"><input class="add-in" data-add-task="' + esc(x.real ? g.id : '') + '" data-vkey="' + esc(x.real ? '' : x.vkey) + '" data-focus-key="add-' + esc(g.id) + '" placeholder="+ Add task" aria-label="Add task"></div></div>';
      h += '<div class="tr summary"><div class="c-bar"></div><div class="c-check"></div><div class="c-name"></div>' + cols.map((c) => '<div class="c-col">' + summaryCell(c.type, x.tasks, b) + '</div>').join('') + '<div class="c-fill"></div></div>';
      h += '</div></section>';
    });
    h += '<button class="outline-btn add-group" data-action="new-group">' + ic('plus', 'sm') + 'Add new group</button>';
    return h + '</div>';
  }
  function summaryCell(type, list, b) {
    if (type === 'status') return statusBattery(list, b);
    if (type === 'priority') return prioBattery(list);
    if (type === 'due' || type === 'timeline') {
      const ds = list.flatMap((t) => [t.start, t.due]).filter(Boolean).sort();
      if (!ds.length) return '';
      const a = ds[0], z = ds[ds.length - 1];
      return '<span class="range-pill">' + esc(a === z ? fmtDate(a) : fmtDate(a) + ' - ' + fmtDate(z)) + '</span>';
    }
    if (type === 'progress') return progCell(list.length ? list.reduce((s, t) => s + progressOf(t), 0) / list.length : 0);
    if (type === 'number') { const vals = list.map((t) => Number(t.number)).filter((n) => Number.isFinite(n) && list.some((t) => t.number !== '' && t.number != null)); if (!vals.length) return ''; const sum = vals.reduce((a, n) => a + n, 0); return '<span class="num sum" data-tip="Sum of ' + vals.length + '">' + fmtNum(sum) + '</span>'; }
    if (type === 'checkbox') { const n = list.filter((t) => t.checked).length; return list.length ? '<span class="num muted" data-tip="Checked">' + n + '/' + list.length + '</span>' : ''; }
    return '';
  }
  function taskRow(t, cols, b, canDrag) {
    const at = A({ tid: t.id });
    const subs = t.subtasks || [];
    const open = ui.open.has(t.id);
    const nUp = (t.updates || []).length;
    // Like monday.com: the bubble turns blue with a count when there were updates in the last 7 days, grey otherwise.
    const recent = (t.updates || []).filter((u) => Date.now() - (u.at || 0) < 7 * 864e5).length;
    let h = '<div class="tr' + (ui.sel.has(t.id) ? ' sel' : '') + '" role="row" data-row="' + esc(t.id) + '" data-gid="' + esc(t.groupId) + '"><div class="c-bar"></div>' +
      '<div class="c-check">' + (canDrag ? '<span class="grip" draggable="true" data-drag="' + esc(t.id) + '" title="Drag to move">' + ic('grip', 'sm') + '</span>' : '') + '<button class="cb' + (ui.sel.has(t.id) ? ' on' : '') + '" data-action="sel" ' + at + ' aria-label="Select task"></button></div>' +
      '<div class="c-name"><div class="name-wrap">' +
      '<button class="expand' + (open ? ' open' : '') + (subs.length ? '' : ' none') + '" data-action="expand" ' + at + ' aria-label="Show subitems"' + (subs.length ? '' : ' tabindex="-1"') + '>' + ic('right', 'sm') + '</button>' +
      '<input class="name-in" data-edit="task-name" ' + at + ' value="' + esc(t.name) + '" aria-label="Task name">' +
      (subs.length ? '<button class="sub-count" data-action="expand" ' + at + ' data-tip="Subitems">' + subs.length + '</button>' : '<button class="sub-count" data-action="expand" ' + at + ' data-tip="Add subitem" style="opacity:.55">+</button>') +
      '<button class="open-btn" data-action="open-item" ' + at + ' tabindex="-1">Open</button>' +
      '</div><button class="upd-btn' + (recent ? ' on' : '') + '" data-action="open-item" ' + at + ' aria-label="Open updates" data-tip="' + (nUp ? nUp + ' update' + (nUp > 1 ? 's' : '') + (recent ? ', ' + recent + ' this week' : '') : 'Open task and updates') + '">' + ic(nUp ? 'bubble' : 'bubblePlus') + (recent ? '<span class="n">' + recent + '</span>' : '') + '</button></div>' +
      cols.map((c) => '<div class="c-col">' + cellFor(c.type, t, at, b) + '</div>').join('') +
      '<div class="c-fill"></div></div>';
    if (open) h += subBlock(t, b);
    return h;
  }
  function subBlock(t, b) {
    const tpl = '6px 40px 330px 100px 140px 130px 48px';
    let h = '<div class="subwrap"><div class="subwrap-spacer"></div><div class="tbl" style="--tpl:' + tpl + '">';
    h += '<div class="tr th"><div class="c-bar"></div><div class="c-check"></div><div class="c-name">Subitem</div><div class="c-col">Owner</div><div class="c-col">Status</div><div class="c-col">Date</div><div class="c-fill"></div></div>';
    (t.subtasks || []).forEach((s) => {
      const at = A({ tid: t.id, sid: s.id });
      h += '<div class="tr"><div class="c-bar"></div><div class="c-check"><button class="icon-btn" data-action="delete-sub" ' + at + ' aria-label="Delete subitem" data-tip="Delete subitem">' + ic('close', 'sm') + '</button></div>' +
        '<div class="c-name"><div class="name-wrap"><input class="name-in" data-edit="sub-name" ' + at + ' value="' + esc(s.name) + '" aria-label="Subitem name"></div></div>' +
        '<div class="c-col">' + cellOwners(s.owners, at) + '</div><div class="c-col">' + cellStatus(s.status, at, b) + '</div><div class="c-col">' + cellDate(s.due, s.status, at) + '</div><div class="c-fill"></div></div>';
    });
    h += '<div class="tr add"><div class="c-bar"></div><div class="c-check"></div><div class="c-name" style="grid-column:3 / -1"><input class="add-in" data-add-sub="' + esc(t.id) + '" data-focus-key="addsub-' + esc(t.id) + '" placeholder="+ Add subitem" aria-label="Add subitem"></div></div>';
    return h + '</div></div>';
  }

  function renderCards(b) {
    const gmap = Object.fromEntries((b.groups || []).map((g) => [g.id, g]));
    const f = F(b.id);
    const list = sortTasks((b.tasks || []).filter((t) => matches(t, f)), f.sort, b);
    if (!list.length) return '<div class="empty-state"><h2>No tasks to show</h2><p>Add a task from New task, or clear your filters.</p></div>';
    return '<div class="cards">' + list.map((t) => {
      const g = gmap[t.groupId] || { color: '#579bfc', name: '' };
      const at = A({ tid: t.id });
      return '<article class="card" style="--g:' + esc(g.color) + '"><button class="card-name" data-action="open-item" ' + at + '>' + esc(t.name) + '</button>' +
        (b.columns || []).map((c) => '<div class="card-row"><span>' + esc(c.title || COLS[c.type].title) + '</span>' + cardVal(c.type, t, at, b) + '</div>').join('') +
        '<div class="card-foot"><span>' + esc(g.name) + '</span>' + ((t.subtasks || []).length ? '<span>· ' + t.subtasks.filter((s) => s.status === 'done').length + '/' + t.subtasks.length + ' subitems</span>' : '') + ((t.updates || []).length ? '<span>· ' + t.updates.length + ' updates</span>' : '') + '</div></article>';
    }).join('') + '</div>';
  }
  function cardVal(type, t, at, b) {
    if (type === 'owners') return '<span>' + cellOwners(t.owners, at, 4) + '</span>';
    if (type === 'status') { const d = t.status ? sdef(b, t.status) : null; return '<button class="pill ' + (t.status ? 'st-' + esc(t.status) : '') + '" ' + (d ? stStyle(d) : '') + ' data-action="status" ' + at + '>' + (d ? esc(d.label) : '—') + '</button>'; }
    if (type === 'priority') return '<button class="pill ' + (t.priority ? 'pr-' + t.priority : '') + '" data-action="priority" ' + at + '>' + (t.priority ? PRIO[t.priority] : '—') + '</button>';
    if (type === 'due') return '<span class="' + (isLate(t.due, t.status) ? 'num bad' : '') + '">' + esc(fmtDate(t.due) || '—') + '</span>';
    if (type === 'timeline') return '<span>' + esc(t.start || t.due ? fmtDate(t.start || t.due) + ' - ' + fmtDate(t.due || t.start) : '—') + '</span>';
    if (type === 'tags') return '<span>' + ((t.tags || []).map((x) => '<span class="chip">' + esc(x) + '</span>').join(' ') || '—') + '</span>';
    if (type === 'notes') return '<span class="muted">' + esc(t.notes || '—') + '</span>';
    if (type === 'progress') return progCell(progressOf(t));
    if (type === 'text') return '<span class="muted">' + esc(t.text || '—') + '</span>';
    if (type === 'number') return '<span class="num">' + (t.number === '' || t.number == null ? '—' : esc(fmtNum(t.number))) + '</span>';
    if (type === 'checkbox') return '<button class="cb' + (t.checked ? ' on' : '') + '" data-action="check" ' + at + ' aria-label="Checkbox"></button>';
    if (type === 'link') return t.link ? '<a class="link" href="' + esc(safeUrl(t.link)) + '" target="_blank" rel="noopener">' + esc(t.link) + '</a>' : '<span class="muted">—</span>';
    return '';
  }
  function renderKanban(b) {
    const gmap = Object.fromEntries((b.groups || []).map((g) => [g.id, g]));
    const f = F(b.id);
    const list = sortTasks((b.tasks || []).filter((t) => matches(t, f)), f.sort, b);
    const defs = statuses(b);
    return '<div class="kanban-top"><span class="muted">' + list.length + (list.length === 1 ? ' task' : ' tasks') + '</span><div class="kb-battery" data-tip="Cards by status">' + statusBattery(list, b) + '</div></div>' +
      '<div class="kanban" style="--lanes:' + (defs.length + 1) + '">' + defs.map((s) => s.key).concat(['']).map((k) => {
      const items = list.filter((t) => (t.status || '') === k);
      const d = k ? sdef(b, k) : null;
      return '<section class="lane"><div class="lane-head ' + (k ? 'st-' + esc(k) : '') + '" ' + (d ? stStyle(d) : 'style="background:var(--empty-cell)"') + '>' + esc(d ? d.label : 'Blank') + '<span class="lane-n">' + items.length + '</span><button class="lane-add" data-action="kanban-add" data-v="' + esc(k) + '" aria-label="Add task here" data-tip="Add task">' + ic('plus', 'sm') + '</button></div>' +
        '<div class="lane-body" data-drop="' + (k || '__blank') + '">' + items.map((t) => {
          const g = gmap[t.groupId] || { color: '#579bfc' };
          return '<article class="kcard" draggable="true" data-card="' + esc(t.id) + '" style="--g:' + esc(g.color) + '"><button class="card-name" data-action="open-item" data-tid="' + esc(t.id) + '">' + esc(t.name) + '</button>' +
            '<div class="card-foot">' + stack(t.owners, 3) + (t.due ? '<span class="' + (isLate(t.due, t.status) ? 'num bad' : '') + '">' + esc(fmtDate(t.due)) + '</span>' : '') + ((t.tags || []).length ? '<span class="chip">' + esc(t.tags[0]) + '</span>' : '') + '</div></article>';
        }).join('') + '</div></section>';
    }).join('') + '</div>';
  }
  function renderTimeline(b) {
    const f = F(b.id);
    const t0 = today();
    const tasks = (b.tasks || []).filter((t) => matches(t, f));
    const dates = tasks.flatMap((t) => [t.start, t.due]).filter(Boolean).sort();
    let from = dates.length ? dates[0] : addDaysTo(t0, -7);
    let to = dates.length ? dates[dates.length - 1] : addDaysTo(t0, 21);
    if (t0 < from) from = t0; if (t0 > to) to = t0;
    from = addDaysTo(from, -3); to = addDaysTo(to, 10);
    const n = Math.min(150, daysBetween(from, to) + 1);
    const DW = 34;
    let days = '';
    for (let i = 0; i < n; i++) {
      const d = addDaysTo(from, i); const dt = new Date(d + 'T12:00'); const wd = dt.getDay();
      days += '<div class="tl-day' + (wd === 0 || wd === 6 ? ' wk' : '') + (d === t0 ? ' today' : '') + '"><span>' + (dt.getDate() === 1 || i === 0 ? MONTHS[dt.getMonth()] : 'SMTWTFS'[wd]) + '</span><b>' + dt.getDate() + '</b></div>';
    }
    let left = '<div class="tl-cell tl-head">Task</div>';
    let right = '<div class="tl-days">' + days + '</div><div class="tl-rows" style="width:' + n * DW + 'px">';
    (b.groups || []).forEach((g) => {
      const list = sortTasks(tasks.filter((t) => t.groupId === g.id), f.sort || { type: 'timeline', dir: 'asc' }, b);
      if (!list.length) return;
      left += '<div class="tl-cell grp" style="--g:' + esc(g.color) + '">' + esc(g.name) + '</div>';
      right += '<div class="tl-row"></div>';
      list.forEach((t) => {
        left += '<div class="tl-cell">' + stack(t.owners, 1) + '<button class="n link" data-action="open-item" data-tid="' + esc(t.id) + '">' + esc(t.name) + '</button></div>';
        const s = t.start || t.due, e = t.due || t.start;
        if (!s) { right += '<div class="tl-row"><button class="tl-nodate link" data-action="timeline" data-tid="' + esc(t.id) + '">No dates yet. Set dates</button></div>'; return; }
        const x = daysBetween(from, s) * DW + 2, w = (daysBetween(s, e) + 1) * DW - 4;
        right += '<div class="tl-row"><button class="tl-bar' + (t.status === 'done' ? ' done' : '') + (s === e ? ' point' : '') + '" style="--g:' + esc(g.color) + ';left:' + (s === e ? x + 4 : x) + 'px;' + (s === e ? '' : 'width:' + w + 'px') + '" data-action="timeline" data-tid="' + esc(t.id) + '" data-tip="' + esc(t.name + ' · ' + (s === e ? fmtDate(s) : fmtDate(s) + ' - ' + fmtDate(e)) + ' · ' + slabel(t.status, b)) + '">' + (w > 90 && s !== e ? esc(t.name) : '') + '</button></div>';
      });
    });
    const tx = daysBetween(from, t0) * DW + DW / 2;
    right += '<div class="tl-today" style="left:' + tx + 'px"></div></div>';
    return '<div class="timeline"><div class="tl"><div class="tl-left">' + left + '</div><div>' + right + '</div></div><p class="hint" style="margin-top:8px">Click a bar or “Set dates” to change a task’s start and end. A task with only a due date shows as a dot.</p></div>';
  }

  // ---------- calendar view ----------
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function calMonth(b) { return (ui.cal || (ui.cal = {}))[b.id] || today().slice(0, 7); }
  function renderCalendar(b) {
    const f = F(b.id);
    const ym = calMonth(b); const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1); const start = addDaysTo(isoDay(first), -first.getDay());
    const t0 = today();
    const gmap = Object.fromEntries((b.groups || []).map((g) => [g.id, g]));
    const tasks = (b.tasks || []).filter((t) => matches(t, f));
    const byDay = {};
    tasks.forEach((t) => {
      if (!t.due && !t.start) return;
      const s = t.start || t.due, e = t.due || t.start;
      for (let d = s; d <= e; d = addDaysTo(d, 1)) { (byDay[d] = byDay[d] || []).push({ t, first: d === s, last: d === e, span: s !== e }); if (daysBetween(s, d) > 400) break; }
    });
    let h = '<div class="calendar"><div class="cal-head"><button class="icon-btn" data-action="cal-prev" aria-label="Previous month">' + ic('right', 'sm') + '</button><button class="icon-btn" data-action="cal-next" aria-label="Next month">' + ic('right', 'sm') + '</button>' +
      '<button class="outline-btn" data-action="cal-today">Today</button><h2>' + MONTHS_LONG[m - 1] + ' ' + y + '</h2><span class="muted">' + tasks.filter((t) => t.due || t.start).length + ' scheduled</span></div>';
    h += '<div class="cal-grid"><div class="cal-wd">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => '<div>' + d + '</div>').join('') + '</div><div class="cal-days">';
    for (let i = 0; i < 42; i++) {
      const d = addDaysTo(start, i); const dt = new Date(d + 'T12:00'); const inMonth = dt.getMonth() === m - 1;
      const items = byDay[d] || [];
      h += '<div class="cal-day' + (inMonth ? '' : ' out') + (d === t0 ? ' today' : '') + '"><div class="cal-dn"><button class="cal-num" data-action="cal-add" data-v="' + d + '" data-tip="Add task on ' + esc(fmtDate(d)) + '">' + (dt.getDate() === 1 ? MONTHS[dt.getMonth()] + ' ' : '') + dt.getDate() + '</button></div>' +
        items.slice(0, 4).map((x) => { const g = gmap[x.t.groupId] || { color: '#579bfc' }; const late = isLate(x.t.due, x.t.status); return '<button class="cal-ev' + (x.span ? ' span' + (x.first ? ' first' : '') + (x.last ? ' last' : '') : '') + (x.t.status === 'done' ? ' done' : '') + '" style="--g:' + esc(g.color) + '" data-action="open-item" data-tid="' + esc(x.t.id) + '" data-tip="' + esc(x.t.name + ' · ' + slabel(x.t.status, b)) + '">' + (late ? '<span class="dot"></span>' : '') + esc(x.first || !x.span ? x.t.name : '') + '</button>'; }).join('') +
        (items.length > 4 ? '<span class="cal-more">+' + (items.length - 4) + ' more</span>' : '') + '</div>';
    }
    return h + '</div></div><p class="hint" style="margin-top:8px">Tasks appear on their due date; tasks with a start date stretch across the days. Click a day number to add a task there.</p></div>';
  }

  // ---------- dashboard ----------
  function renderDash(d) {
    const ids = (d.boardIds || []).filter((id) => boards[id]);
    const q = ui.dashF.q.trim().toLowerCase();
    const who = ui.dashF.person;
    const tasks = [];
    ids.forEach((id) => (boards[id].tasks || []).forEach((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return;
      if (who && !(t.owners || []).includes(who)) return;
      tasks.push({ b: boards[id], t });
    }));
    // Count by label. Boards can define their own labels, so segments are keyed by label text + color.
    const c = { working: 0, done: 0, stuck: 0, todo: 0, '': 0 };
    const segMap = new Map();
    tasks.forEach((x) => {
      const k = x.t.status || '';
      c[CORE_STATUS.has(k) || !k ? k : 'working'] += 1;
      const d = k ? sdef(x.b, k) : { label: 'Blank', color: '' };
      const sk = k ? d.label + '|' + d.color : '';
      const e = segMap.get(sk) || { key: k, label: d.label, color: d.color, n: 0 }; e.n += 1; segMap.set(sk, e);
    });
    let h = '<div class="dash-head"><div class="bh-row"><button class="board-name" data-action="dash-menu" data-id="' + esc(d.id) + '">' + esc(d.name) + ic('down') + '</button>' +
      '<div class="bh-actions"><button class="outline-btn" data-action="dash-boards" data-id="' + esc(d.id) + '">' + ic('board', 'sm') + ids.length + (ids.length === 1 ? ' board' : ' boards') + '</button><button class="outline-btn" data-action="invite">' + ic('userPlus', 'sm') + 'Invite</button></div></div>' +
      '<div class="dash-filters"><div class="filter-wrap">' + ic('search', 'sm') + '<input class="filter-in" id="dash-q" placeholder="Type to filter" value="' + esc(ui.dashF.q) + '" aria-label="Type to filter"></div>' +
      '<button class="tool' + (who ? ' on' : '') + '" data-action="dash-person">' + (who ? av(who) : ic('person', 'sm')) + 'People</button>' +
      ((q || who) ? '<button class="tool" data-action="dash-clear">Clear</button>' : '') + '</div></div>';
    const tile = (label, n) => '<section class="widget"><div class="w-head">' + label + '</div><div class="big-num" data-tip="' + esc(label + ': ' + n + ' of ' + tasks.length + ' tasks') + '">' + n + '</div></section>';
    h += '<div class="dash">' + tile('All Tasks', tasks.length) + tile('In progress', c.working) + tile('Stuck', c.stuck) + tile('Done', c.done);
    // Tasks by status (donut)
    const order = ['working', 'done', 'stuck', 'todo'];
    const segs = Array.from(segMap.values()).sort((a, z) => (a.key === '' ? 1 : z.key === '' ? -1 : (order.indexOf(a.key) + 1 || 9) - (order.indexOf(z.key) + 1 || 9)));
    const total = tasks.length || 1;
    const R = 70, CIRC = 2 * Math.PI * R;
    let off = 0;
    const colorOf = (s) => (s.key ? esc(s.color) : 'var(--empty-cell)');
    const arcs = segs.map((s) => {
      const n = s.n; const len = (n / total) * CIRC; const gap = segs.length > 1 ? 2 : 0;
      const a = '<circle cx="95" cy="95" r="' + R + '" fill="none" stroke="' + colorOf(s) + '" stroke-width="26" stroke-dasharray="' + Math.max(0.5, len - gap).toFixed(2) + ' ' + CIRC.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 95 95)" data-tip="' + esc(s.label + ': ' + n + ' (' + Math.round((n / total) * 100) + '%)') + '"/>';
      off += len; return a;
    }).join('');
    h += '<section class="widget w2"><div class="w-head">Tasks by status</div><div class="w-body"><div class="donut-wrap">' +
      (tasks.length ? '<svg class="donut" viewBox="0 0 190 190" role="img" aria-label="Tasks by status">' + arcs + '<text x="95" y="96" text-anchor="middle" font-size="28" font-weight="500">' + tasks.length + '</text><text x="95" y="116" text-anchor="middle" font-size="12" style="fill:var(--ink-2)">tasks</text></svg>' : '<p class="nothing">No tasks yet.</p>') +
      '<div class="legend">' + segs.map((s) => '<div class="legend-item"><span class="sw" style="background:' + colorOf(s) + '"></span><span>' + esc(s.label) + '</span><b>' + s.n + ' · ' + Math.round((s.n / total) * 100) + '%</b></div>').join('') + '</div></div></div></section>';
    // Tasks by owner (bars)
    const byOwner = people.map((p) => ({ id: p.id, name: p.name, n: tasks.filter((x) => (x.t.owners || []).includes(p.id)).length })).filter((x) => x.n);
    const unassigned = tasks.filter((x) => !(x.t.owners || []).some(person)).length;
    if (unassigned) byOwner.push({ id: '', name: 'Unassigned', n: unassigned });
    byOwner.sort((a, b) => b.n - a.n);
    const maxN = Math.max(1, ...byOwner.map((x) => x.n));
    h += '<section class="widget w2"><div class="w-head">Tasks by owner</div><div class="w-body">' + (byOwner.length ?
      '<div class="bars">' + byOwner.map((x) => '<div class="bar-col"><span class="v">' + x.n + '</span><div class="bar" style="height:' + Math.round((x.n / maxN) * 170) + 'px" data-tip="' + esc(x.name + ': ' + x.n + ' tasks') + '"></div></div>').join('') + '</div>' +
      '<div class="bar-labels">' + byOwner.map((x) => '<div>' + (x.id ? av(x.id) : '<span class="av-empty">' + ic('person') + '</span>') + '<span>' + esc(x.name.split(' ')[0]) + '</span></div>').join('') + '</div>' : '<p class="nothing">No tasks yet.</p>') + '</div></section>';
    // Overdue tasks
    const late = tasks.filter((x) => isLate(x.t.due, x.t.status)).sort((a, b) => a.t.due.localeCompare(b.t.due));
    h += '<section class="widget w2"><div class="w-head">Overdue tasks<span class="sub">' + late.length + '</span></div><div class="w-body">' + (late.length ?
      '<table class="mini-table"><thead><tr><th>Task</th><th>Board</th><th>Owner</th><th>Due</th></tr></thead><tbody>' + late.map((x) => '<tr><td><button class="link" data-action="open-item" data-tid="' + esc(x.t.id) + '">' + esc(x.t.name) + '</button></td><td class="muted">' + esc(x.b.name) + '</td><td>' + stack(x.t.owners, 3) + '</td><td class="late">' + esc(fmtDate(x.t.due)) + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="nothing">Nothing overdue.</p>') + '</div></section>';
    // Tasks by due date
    const t0 = today();
    const open = (x) => x.t.status !== 'done';
    const buckets = [
      ['Overdue', (x) => isLate(x.t.due, x.t.status)],
      ['This week', (x) => open(x) && x.t.due && x.t.due >= t0 && daysBetween(t0, x.t.due) <= 7],
      ['Next week', (x) => open(x) && x.t.due && daysBetween(t0, x.t.due) > 7 && daysBetween(t0, x.t.due) <= 14],
      ['Later', (x) => open(x) && x.t.due && daysBetween(t0, x.t.due) > 14],
      ['No date', (x) => open(x) && !x.t.due],
      ['Done', (x) => !open(x)],
    ].map(([l, fn]) => [l, tasks.filter(fn).length]);
    const maxB = Math.max(1, ...buckets.map((x) => x[1]));
    h += '<section class="widget w2"><div class="w-head">Tasks by due date</div><div class="w-body"><div class="bars">' + buckets.map(([l, n]) => '<div class="bar-col"><span class="v">' + n + '</span><div class="bar" style="height:' + Math.round((n / maxB) * 170) + 'px" data-tip="' + esc(l + ': ' + n + ' tasks') + '"></div></div>').join('') + '</div><div class="bar-labels">' + buckets.map(([l]) => '<div>' + esc(l) + '</div>').join('') + '</div></div></section>';
    return h + '</div>';
  }

  // ---------- my work ----------
  function myItems(pid) {
    const out = [];
    for (const b of allBoards()) {
      const gmap = Object.fromEntries((b.groups || []).map((g) => [g.id, g]));
      for (const t of b.tasks || []) {
        if ((t.owners || []).includes(pid)) out.push({ b, g: gmap[t.groupId], t, name: t.name, status: t.status, due: t.due });
        for (const s of t.subtasks || []) if ((s.owners || []).includes(pid)) out.push({ b, g: gmap[t.groupId], t, s, name: s.name, status: s.status, due: s.due || '' });
      }
    }
    return out;
  }
  function renderMyWork() {
    const pid = ui.mwPerson || ui.me;
    const p = person(pid);
    let h = '<div class="page"><div class="bh-row"><h1>My work</h1><div class="bh-actions"><label class="muted" for="mw-person">Showing work for</label><select class="field" id="mw-person">' + people.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === pid ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>' +
      '<button class="tool' + (ui.mwDone ? ' on' : '') + '" data-action="mw-done">' + ic('okCircle', 'sm') + (ui.mwDone ? 'Hide done' : 'Show done') + '</button></div></div>';
    if (!p) return h + '<div class="empty-state"><h2>Add yourself first</h2><p>Go to Team and add your name, then pick it here.</p><button class="primary-btn" data-action="nav-ws">Go to Team</button></div></div>';
    const all = myItems(pid);
    const items = all.filter((x) => ui.mwDone || x.status !== 'done');
    const t0 = today();
    const buckets = [
      ['Past dates', '#e2445c', (x) => x.due && x.due < t0],
      ['Today', '#00c875', (x) => x.due === t0],
      ['This week', '#579bfc', (x) => x.due > t0 && daysBetween(t0, x.due) <= 7],
      ['Next week', '#a25ddc', (x) => x.due && daysBetween(t0, x.due) > 7 && daysBetween(t0, x.due) <= 14],
      ['Later', '#fdab3d', (x) => x.due && daysBetween(t0, x.due) > 14],
      ['Without a date', '#797e93', (x) => !x.due],
    ];
    const openN = all.filter((x) => x.status !== 'done').length;
    h += '<p class="lede">' + esc(p.name) + ' has ' + openN + ' open ' + (openN === 1 ? 'item' : 'items') + ' across ' + allBoards().length + ' boards (' + all.filter((x) => x.status === 'done').length + ' done). Tasks and subitems both count. Tick the box to mark one done.</p>';
    let any = false;
    buckets.forEach(([title, color, test]) => {
      const list = items.filter(test).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
      if (!list.length) return; any = true;
      h += '<section class="mw-group" style="--g:' + color + '"><h2>' + title + '<span class="n">' + list.length + (list.length === 1 ? ' item' : ' items') + '</span></h2><div class="tbl mw-table" style="width:100%">' +
        '<div class="tr th"><div class="c-bar"></div><div class="c-check"></div><div class="c-name" style="justify-content:flex-start;padding-left:10px">Item</div><div class="c-col">Board</div><div class="c-col">Status</div><div class="c-col">Date</div></div>' +
        list.map((x) => {
          const at = A({ tid: x.t.id, sid: x.s ? x.s.id : '' });
          return '<div class="tr"><div class="c-bar"></div><div class="c-check"><button class="cb' + (x.status === 'done' ? ' on' : '') + '" data-action="quick-done" ' + at + ' aria-label="Mark done" data-tip="' + (x.status === 'done' ? 'Mark not done' : 'Mark done') + '"></button></div>' +
            '<div class="c-name" style="justify-content:flex-start;padding-left:10px;gap:8px;overflow:hidden"><button class="link" data-action="open-item" data-tid="' + esc(x.t.id) + '" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (x.status === 'done' ? 'text-decoration:line-through;color:var(--ink-3)' : '') + '">' + esc(x.name) + '</button>' + (x.s ? '<span class="muted" style="font-size:12.5px;white-space:nowrap">in ' + esc(x.t.name) + '</span>' : '') + '</div>' +
            '<div class="c-board">' + esc(x.b.name) + (x.g ? ' › ' + esc(x.g.name) : '') + '</div><div class="c-col">' + cellStatus(x.status, at, x.b) + '</div><div class="c-col">' + cellDate(x.due, x.status, at) + '</div></div>';
        }).join('') + '</div></section>';
    });
    if (!any) h += '<div class="empty-state"><h2>Nothing open right now</h2><p>When someone delegates a task or subitem to ' + esc(p.name) + ', it shows up here.</p></div>';
    return h + '</div>';
  }

  // ---------- manage workspace ----------
  function renderWorkspace() {
    let h = '<div class="page"><div class="bh-row"><h1>' + esc(ws.name) + '</h1></div>' +
      '<div class="ws-tabs"><button class="tab" data-action="ws-tab" data-v="members" aria-selected="' + (ui.wsTab === 'members') + '">Members <span class="muted">' + people.length + '</span></button><button class="tab" data-action="ws-tab" data-v="boards" aria-selected="' + (ui.wsTab === 'boards') + '">Boards and dashboards</button></div>';
    if (ui.wsTab === 'boards') {
      h += '<div class="form-row"><button class="primary-btn" data-action="new-board">' + ic('plus', 'sm') + 'New board</button><button class="outline-btn" data-action="new-dash">' + ic('dash', 'sm') + 'New dashboard</button></div>';
      h += '<div class="people-list"><table><thead><tr><th>Name</th><th>Type</th><th>Tasks</th><th>Done</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + navItems().map((id) => {
        const b = boards[id], d = dashboard(id);
        const tasks = b ? (b.tasks || []) : [];
        return '<tr><td><input class="name-in" data-edit="' + (b ? 'board-name' : 'dash-name') + '" data-id="' + esc(id) + '" value="' + esc((b || d).name) + '" aria-label="Name"></td><td class="muted">' + (b ? 'Board' : 'Dashboard') + '</td><td class="num">' + (b ? tasks.length : '—') + '</td><td class="num">' + (b ? tasks.filter((t) => t.status === 'done').length : '—') + '</td>' +
          '<td style="text-align:right;white-space:nowrap"><button class="ghost-btn" data-action="' + (b ? 'nav-board' : 'nav-dash') + '" data-id="' + esc(id) + '">Open</button><button class="ghost-btn danger-txt" data-action="delete-item-ws" data-id="' + esc(id) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
      return h + '</div>';
    }
    const stats = {};
    people.forEach((p) => { stats[p.id] = { working: 0, done: 0, stuck: 0, todo: 0, '': 0, late: 0 }; });
    const bucket = (st) => (CORE_STATUS.has(st) || !st ? st : 'working'); // custom labels count as open work
    allBoards().forEach((b) => (b.tasks || []).forEach((t) => [t].concat(t.subtasks || []).forEach((x) => (x.owners || []).forEach((id) => {
      if (!stats[id]) return; stats[id][bucket(x.status || '')] += 1; if (isLate(x.due || (x !== t ? t.due : ''), x.status)) stats[id].late += 1;
    }))));
    h += '<form class="form-row" data-form="add-person"><input class="field" id="np-name" placeholder="Full name" autocomplete="off" aria-label="Full name"><input class="field" id="np-role" placeholder="Role (optional)" autocomplete="off" aria-label="Role"><button class="primary-btn" type="submit">' + ic('userPlus', 'sm') + 'Add member</button></form>';
    h += '<div class="people-list"><table><thead><tr><th>Member</th><th>Role</th><th>Open</th><th>Stuck</th><th>Overdue</th><th>Workload</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + people.map((p) => {
      const s = stats[p.id];
      const list = []; ['done', 'working', 'stuck', 'todo', ''].forEach((k) => { for (let i = 0; i < s[k]; i++) list.push({ status: k }); });
      return '<tr><td><div class="person"><button data-action="person-color" data-pid="' + esc(p.id) + '" aria-label="Change color">' + av(p.id, 'lg') + '</button><input class="name-in" data-edit="person-name" data-pid="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="Name">' + (p.invited ? '<span class="tag-invited">Invited</span>' : '') + '</div></td>' +
        '<td><input class="name-in" data-edit="person-role" data-pid="' + esc(p.id) + '" value="' + esc(p.role || '') + '" placeholder="Add role" aria-label="Role"></td>' +
        '<td class="num">' + (s.working + s.stuck + s.todo + s['']) + '</td><td class="num' + (s.stuck ? ' bad' : '') + '">' + s.stuck + '</td><td class="num' + (s.late ? ' bad' : '') + '">' + s.late + '</td>' +
        '<td style="min-width:150px">' + (list.length ? statusBattery(list, null) : '<span class="muted">No work yet</span>') + '</td>' +
        '<td style="text-align:right;white-space:nowrap"><button class="ghost-btn" data-action="view-work" data-pid="' + esc(p.id) + '">View work</button><button class="ghost-btn danger-txt" data-action="remove-person" data-pid="' + esc(p.id) + '">Remove</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    return h + '</div>';
  }

  // ---------- task panel (drawer) ----------
  function renderDrawer() {
    const root = document.getElementById('drawer-root');
    const loc = ui.drawer && locate(ui.drawer);
    if (!loc) { root.innerHTML = ''; ui.drawer = null; ui.drawerShown = null; return; }
    const { b, t } = loc;
    const g = (b.groups || []).find((x) => x.id === t.groupId) || { name: '', color: '#579bfc' };
    const enter = ui.drawerShown !== t.id; ui.drawerShown = t.id;
    const at = A({ tid: t.id });
    const subs = t.subtasks || [];
    let h = '<div class="scrim' + (enter ? ' enter' : '') + '" data-action="close-drawer"></div><aside class="drawer' + (enter ? ' enter' : '') + '" role="dialog" aria-modal="true" aria-label="Task details" style="--g:' + esc(g.color) + '">';
    h += '<div class="d-top"><div class="d-top-row"><div class="crumb">' + esc(b.name) + ' › <span style="color:' + esc(g.color) + '">' + esc(g.name) + '</span></div>' +
      '<button class="icon-btn" data-action="item-menu" ' + at + ' aria-label="Task options">' + ic('dots', 'sm') + '</button><button class="icon-btn" data-action="close-drawer" aria-label="Close">' + ic('close', 'sm') + '</button></div>' +
      '<textarea class="d-title" rows="1" id="d-title" data-edit="task-name" ' + at + ' aria-label="Task name">' + esc(t.name) + '</textarea></div>';
    h += '<div class="d-body">';
    h += '<div class="props">' + (b.columns || []).map((c) => '<div class="k">' + esc(c.title || COLS[c.type].title) + '</div><div class="v">' + (c.type === 'owners' ? '<button class="owners-btn" data-action="owners" ' + at + '>' + stack(t.owners, 6) + '</button>' : cellFor(c.type, t, at, b)) + '</div>').join('') +
      '<div class="k">Group</div><div class="v"><select class="field" id="d-group" data-edit="task-group" ' + at + ' style="margin-left:8px">' + (b.groups || []).map((x) => '<option value="' + esc(x.id) + '"' + (x.id === t.groupId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' +
      '<div class="k">Progress</div><div class="v">' + progCell(progressOf(t)) + '</div></div>';
    h += '<section class="d-sec handoff"><h3>' + ic('handoff', 'sm') + 'Delegate</h3><div class="handoff-row"><select class="field" id="handoff-to" aria-label="Hand off to">' + people.map((p) => '<option value="' + esc(p.id) + '"' + ((t.owners || [])[0] === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
      '<input class="field" id="handoff-note" placeholder="Note for them (optional)" autocomplete="off"><button class="primary-btn" data-action="handoff" ' + at + '>Hand off</button></div>' +
      '<p class="hint">Makes them the owner and posts the hand-off in Updates. To share the task instead, add more people in the Owner field or split it into subitems.</p></section>';
    const tab = ui.dtab;
    h += '<div class="d-tabs"><button class="tab" data-action="dtab" data-v="updates" aria-selected="' + (tab === 'updates') + '">Updates <span class="muted">' + (t.updates || []).length + '</span></button><button class="tab" data-action="dtab" data-v="subitems" aria-selected="' + (tab === 'subitems') + '">Subitems <span class="muted">' + subs.length + '</span></button><button class="tab" data-action="dtab" data-v="activity" aria-selected="' + (tab === 'activity') + '">Activity Log</button></div>';
    if (tab === 'updates') {
      h += '<form class="composer" data-form="post-update" ' + at + '><textarea class="field" id="upd-text" placeholder="Write an update: progress, a question, or a blocker. Type @ to mention someone." aria-label="Write an update"></textarea>' +
        '<div class="composer-row"><button type="button" class="tool" data-action="mention-btn" data-tip="Mention a teammate">@ Mention</button><button class="primary-btn" type="submit">Update</button></div></form>';
      const ups = (t.updates || []).slice().sort((a, c) => c.at - a.at);
      const who = (id) => (person(id) ? pname(id) : 'Former member');
      const likeBtn = (u, rid) => { const likes = u.likes || []; const mine = likes.includes(ui.me); return '<button class="post-act' + (mine ? ' on' : '') + '" data-action="like-update" data-uid="' + esc(u.id) + '"' + (rid ? ' data-rid="' + esc(rid) + '"' : '') + ' data-tip="' + esc(likes.length ? likes.map(who).join(', ') : 'Like') + '">' + ic('thumb', 'sm') + (likes.length ? '<span>' + likes.length + '</span>' : '<span>Like</span>') + '</button>'; };
      h += ups.length ? '<ol class="posts">' + ups.map((u) => '<li class="post' + (u.kind === 'handoff' ? ' handoff-post' : '') + '"><div class="post-meta">' + (person(u.author) ? av(u.author) : '') + '<b>' + esc(who(u.author)) + '</b><span>' + esc(fmtAgo(u.at)) + '</span></div><p>' + richText(u.text) + '</p>' +
        '<div class="post-actions">' + likeBtn(u) + '<button class="post-act" data-action="reply-open" data-uid="' + esc(u.id) + '">' + ic('bubble', 'sm') + '<span>Reply</span></button></div>' +
        ((u.replies || []).length ? '<ol class="replies">' + u.replies.map((r) => '<li class="reply"><div class="post-meta">' + (person(r.author) ? av(r.author) : '') + '<b>' + esc(who(r.author)) + '</b><span>' + esc(fmtAgo(r.at)) + '</span></div><p>' + richText(r.text) + '</p></li>').join('') + '</ol>' : '') +
        (ui.replyTo === u.id ? '<form class="reply-form" data-form="post-reply" data-uid="' + esc(u.id) + '" ' + at + '><input class="field" id="reply-text" placeholder="Write a reply…" autocomplete="off" aria-label="Write a reply"><button class="primary-btn" type="submit">Reply</button></form>' : '') +
        '</li>').join('') + '</ol>' : '<p class="nothing">No updates yet.</p>';
    } else if (tab === 'subitems') {
      h += '<div class="sub-list"><div class="sub-row th"><span></span><span>Subitem</span><span>Owner</span><span>Status</span><span>Date</span><span></span></div>' + subs.map((s) => {
        const sa = A({ tid: t.id, sid: s.id });
        return '<div class="sub-row"><span><button class="cb' + (s.status === 'done' ? ' on' : '') + '" data-action="quick-done" ' + sa + ' aria-label="Mark done"></button></span><span><input class="name-in" data-edit="sub-name" ' + sa + ' value="' + esc(s.name) + '" aria-label="Subitem name"></span><span>' + cellOwners(s.owners, sa) + '</span><span>' + cellStatus(s.status, sa) + '</span><span>' + cellDate(s.due, s.status, sa) + '</span><span><button class="icon-btn" data-action="delete-sub" ' + sa + ' aria-label="Delete subitem">' + ic('close', 'sm') + '</button></span></div>';
      }).join('') + '<div class="sub-row add"><span></span><span><input class="add-in" data-add-sub="' + esc(t.id) + '" data-focus-key="d-addsub-' + esc(t.id) + '" placeholder="+ Add subitem" aria-label="Add subitem"></span></div></div>';
    } else {
      const acts = t.activity || [];
      h += acts.length ? '<ol class="acts">' + acts.map((a) => '<li><span class="t">' + esc(fmtAgo(a.at)) + ' ago</span>' + (person(a.by) ? av(a.by) : '<span></span>') + '<span>' + esc(a.text) + '</span></li>').join('') + '</ol>' : '<p class="nothing">Changes to status, owners and dates are logged here.</p>';
    }
    h += '</div></aside>';
    root.innerHTML = h;
  }

  // ---------- bulk bar, invite modal ----------
  function renderBulk() {
    const el = document.getElementById('bulk');
    const b = ui.section === 'board' && board(ui.id);
    if (b) { for (const id of Array.from(ui.sel)) if (!(b.tasks || []).some((t) => t.id === id)) ui.sel.delete(id); } else ui.sel.clear();
    if (!ui.sel.size) { el.hidden = true; el.innerHTML = ''; return; }
    const n = ui.sel.size;
    el.hidden = false;
    el.innerHTML = '<span class="count">' + n + '</span><span class="lbl">' + (n === 1 ? 'Task' : 'Tasks') + ' selected</span>' +
      '<button class="b" data-action="bulk-done">' + ic('okCircle') + 'Done</button>' +
      '<button class="b" data-action="bulk-status">' + ic('table') + 'Status</button>' +
      '<button class="b" data-action="bulk-assign">' + ic('userPlus') + 'Assign</button>' +
      '<button class="b" data-action="bulk-move">' + ic('move') + 'Move to</button>' +
      '<button class="b" data-action="bulk-dup">' + ic('copy') + 'Duplicate</button>' +
      '<button class="b" data-action="bulk-export">' + ic('download') + 'Export</button>' +
      '<button class="b" data-action="bulk-delete">' + ic('trash') + 'Delete</button>' +
      '<button class="x" data-action="bulk-clear" aria-label="Clear selection">×</button>';
  }
  function renderModal() {
    const root = document.getElementById('modal-root');
    if (ui.modal !== 'invite') { root.innerHTML = ''; return; }
    root.innerHTML = '<div class="modal-wrap" data-action="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Invite to workspace">' +
      '<h2>Invite to ' + esc(ws.name) + '</h2><p class="hint" style="margin:0">Everyone here can be assigned tasks, subitems and hand-offs on every board.</p>' +
      '<form class="form-row" data-form="add-person" style="padding:0;background:none"><input class="field" id="np-name" placeholder="Full name" autocomplete="off" aria-label="Full name"><input class="field" id="np-role" placeholder="Role (optional)" autocomplete="off" aria-label="Role"><button class="primary-btn" type="submit">Invite</button></form>' +
      '<div class="members">' + people.map((p) => '<div class="member">' + av(p.id, 'lg') + '<div><div>' + esc(p.name) + (p.invited ? ' <span class="tag-invited">Invited</span>' : '') + '</div><div class="role">' + esc(p.role || 'Member') + '</div></div></div>').join('') + '</div>' +
      '<div class="modal-actions"><button class="outline-btn" data-action="nav-ws-close">Manage members</button><button class="primary-btn" data-action="modal-close">Done</button></div></div></div>';
    if (!ui.modalFocused) { const n = document.getElementById('np-name'); if (n) n.focus(); ui.modalFocused = true; }
  }

  // ---------- render ----------
  function render() {
    if (!loaded) return;
    ui.dirty = false;
    const a = document.activeElement;
    const fkey = a && a.dataset ? a.dataset.focusKey : null;
    const fid = a && a.id && a.closest && a.closest('#app, #drawer-root, #modal-root') ? a.id : null;
    const selStart = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
    const mainEl = document.querySelector('.main');
    const scroll = mainEl ? [mainEl.scrollTop, mainEl.scrollLeft] : [0, 0];
    const dBody = document.querySelector('.d-body');
    const dScroll = dBody ? dBody.scrollTop : 0;
    let main = '';
    if (ui.section === 'mywork') main = renderMyWork();
    else if (ui.section === 'workspace') main = renderWorkspace();
    else if (ui.section === 'dash' && dashboard(ui.id)) main = renderDash(dashboard(ui.id));
    else if (board(ui.id)) main = renderBoard(board(ui.id));
    else main = '<div class="empty-state"><h2>Create your first board</h2><p>Boards hold groups of tasks. Add people, delegate work and track status as it moves.</p><button class="primary-btn" data-action="new-board">New board</button></div>';
    document.getElementById('app').innerHTML = '<div class="shell">' + renderTop() + renderRail() + renderPanel() + '<main class="main">' + main + '</main></div>';
    renderDrawer(); renderBulk(); renderModal();
    playCelebrations();
    const m2 = document.querySelector('.main'); if (m2 && (scroll[0] || scroll[1])) { ui.restoreUntil = performance.now() + 400; m2.scrollTop = scroll[0]; m2.scrollLeft = scroll[1]; }
    const d2 = document.querySelector('.d-body'); if (d2 && dScroll) { ui.restoreUntil = performance.now() + 400; d2.scrollTop = dScroll; }
    if (popCtx) refreshPop();
    let el = null;
    if (fkey) el = document.querySelector('[data-focus-key="' + CSS.escape(fkey) + '"]');
    else if (fid) el = document.getElementById(fid);
    if (el) { el.focus(); if (selStart != null && el.setSelectionRange && el.type !== 'date') { try { el.setSelectionRange(selStart, selStart); } catch (e) { /* not text */ } } }
  }
  function softRender() {
    const a = document.activeElement;
    if (a && a.matches && a.matches('input, textarea, select') && a.closest('#app, #drawer-root, #pop, #modal-root')) { ui.dirty = true; return; }
    render();
  }
  function boot() {
    if (!person(ui.me)) ui.me = people.length ? people[0].id : null;
    const th = lsGet('cb:theme'); if (th) document.documentElement.dataset.theme = th;
    if (!ui.id || (!board(ui.id) && !dashboard(ui.id))) {
      const items = navItems();
      const firstBoard = items.find((id) => boards[id]);
      if (firstBoard) { ui.section = 'board'; ui.id = firstBoard; } else if (items[0]) { ui.section = 'dash'; ui.id = items[0]; }
    }
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) ui.panel = false;
    render();
  }

  // ---------- popovers ----------
  const pop = document.getElementById('pop');
  let popCtx = null;
  function openPop(anchor, ctx) {
    popCtx = ctx; ctx.rect = anchor.getBoundingClientRect(); ctx.openedAt = performance.now();
    pop.hidden = false; refreshPop();
    if (!popCtx) return;
    const first = pop.querySelector('input:not([type=date])');
    if (first && ctx.focus !== false) first.focus();
  }
  function positionPop() {
    const r = popCtx.rect, w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(10, Math.min(r.left + (popCtx.center ? r.width / 2 - w / 2 : 0), window.innerWidth - w - 10));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function closePop() { popCtx = null; pop.hidden = true; pop.innerHTML = ''; }
  function target() {
    const loc = popCtx && popCtx.tid && locate(popCtx.tid); if (!loc) return null;
    const s = popCtx.sid ? subOf(loc.t, popCtx.sid) : null;
    if (popCtx.sid && !s) return null;
    return { b: loc.b, t: loc.t, s, item: s || loc.t };
  }
  const tickSvg = '<span class="tick">' + ic('ok', 'sm') + '</span>';
  // Copy what was typed in the label editor into the draft before the popup re-renders.
  function syncLabelDraft() { if (!ui.labelDraft) return; pop.querySelectorAll('[data-label-i]').forEach((inp) => { const s = ui.labelDraft[Number(inp.dataset.labelI)]; if (s) s.label = inp.value; }); }
  const checkOpt = (on, attrs, label, sw) => '<button class="check-opt" ' + attrs + '><span class="cb' + (on ? ' on' : '') + '"></span>' + (sw ? '<span class="sw" style="background:' + sw + '"></span>' : '') + '<span>' + label + '</span></button>';
  const personOpt = (p, action, on) => '<button class="opt" data-action="' + action + '" data-pid="' + esc(p.id) + '">' + av(p.id) + '<span class="who"><span>' + esc(p.name) + '</span>' + (p.role ? '<span class="role">' + esc(p.role) + '</span>' : '') + '</span>' + (on ? tickSvg : '') + '</button>';
  const colTitle = (c) => c.title || COLS[c.type].title;
  function refreshPop() {
    const c = popCtx; if (!c) return;
    let h = '';
    const b = board(ui.id);
    switch (c.kind) {
      case 'status': {
        const tg = target(); if (!tg) return closePop();
        h = '<div class="label-grid">' + statuses(tg.b).map((s) => '<button class="label-opt st-' + esc(s.key) + '" ' + stStyle(s) + ' data-action="set-status" data-v="' + esc(s.key) + '">' + esc(s.label) + '</button>').join('') + '<button class="label-opt clear" data-action="set-status" data-v="">Clear</button></div>' +
          '<div class="sep"></div><button class="opt" data-action="status-edit">' + ic('settings', 'sm') + 'Edit labels</button>';
        break;
      }
      case 'status-edit': {
        // Draft lives in ui.labelDraft until Apply; rows for the four built-in labels can be renamed and recolored but not removed.
        const d = ui.labelDraft || [];
        h = '<div class="pl">Edit labels</div><div class="label-edit">' + d.map((s, i) => '<div class="label-row"><button class="sw" style="background:' + esc(s.color) + '" data-action="label-color" data-i="' + i + '" aria-label="Change color" data-tip="Change color"></button>' +
          '<input class="field" data-label-i="' + i + '" value="' + esc(s.label) + '" aria-label="Label text" maxlength="40">' +
          (CORE_STATUS.has(s.key) ? '<span class="lock" data-tip="Built-in label: rename or recolor it, it can’t be removed"></span>' : '<button class="icon-btn" data-action="label-del" data-i="' + i + '" aria-label="Remove label">' + ic('close', 'sm') + '</button>') + '</div>' +
          (ui.labelColorRow === i ? '<div class="swatches">' + LABEL_COLORS.map((col) => '<button style="--c:' + col + '" data-action="set-label-color" data-i="' + i + '" data-v="' + col + '" aria-pressed="' + (s.color === col) + '" aria-label="Color ' + col + '"></button>').join('') + '</div>' : '')).join('') + '</div>' +
          '<button class="opt" data-action="label-add">' + ic('plus', 'sm') + 'New label</button><div class="sep"></div>' +
          '<div class="row-btns"><button class="outline-btn" data-action="labels-cancel">Cancel</button><button class="primary-btn" data-action="labels-apply">Apply</button></div>';
        break;
      }
      case 'priority': {
        if (!target()) return closePop();
        h = PRIO_ORDER.map((k) => '<button class="label-opt pr-' + k + '" data-action="set-priority" data-v="' + k + '">' + PRIO[k] + '</button>').join('') + '<button class="label-opt clear" data-action="set-priority" data-v="">Clear</button>';
        break;
      }
      case 'owners': {
        const tg = target(); if (!tg) return closePop();
        const o = tg.item.owners || [];
        h = '<div class="pl">Assign people</div>' + people.map((p) => personOpt(p, 'toggle-owner', o.includes(p.id))).join('') +
          '<div class="sep"></div><div class="pl">Invite someone new</div><form class="pop-form" data-form="pop-add-person"><input class="field" id="pop-person" placeholder="Name" autocomplete="off" aria-label="New person name"><button class="primary-btn" type="submit">Add</button></form>';
        break;
      }
      case 'date': {
        const tg = target(); if (!tg) return closePop();
        h = '<div class="date-pop"><label class="pl" for="pop-date">' + (tg.s ? 'Date' : 'Due date') + '</label><input class="field" type="date" id="pop-date" value="' + esc(tg.item.due || '') + '"><div class="row"><button class="outline-btn" data-action="date-quick" data-v="0">Today</button><button class="outline-btn" data-action="date-quick" data-v="1">Tomorrow</button><button class="outline-btn" data-action="date-quick" data-v="7">+1 week</button></div><button class="ghost-btn" data-action="date-quick" data-v="">Clear date</button></div>';
        break;
      }
      case 'timeline': {
        const tg = target(); if (!tg) return closePop();
        h = '<div class="date-pop"><label class="pl" for="pop-start">Start</label><input class="field" type="date" id="pop-start" value="' + esc(tg.t.start || '') + '"><label class="pl" for="pop-end">End (due date)</label><input class="field" type="date" id="pop-end" value="' + esc(tg.t.due || '') + '"><button class="ghost-btn" data-action="tl-clear">Clear dates</button></div>';
        break;
      }
      case 'tags': {
        const tg = target(); if (!tg) return closePop();
        const opts = tg.b.tagOptions || [];
        h = '<div class="pl">Tags</div>' + (opts.length ? opts.map((x) => checkOpt((tg.t.tags || []).includes(x), 'data-action="toggle-tag" data-v="' + esc(x) + '"', '<span class="chip">' + esc(x) + '</span>')).join('') : '<p class="nothing" style="padding:4px 8px">No tags yet.</p>') +
          '<div class="sep"></div><form class="pop-form" data-form="add-tag"><input class="field" id="pop-tag" placeholder="New tag" autocomplete="off" aria-label="New tag"><button class="primary-btn" type="submit">Add</button></form>';
        break;
      }
      case 'group-menu': {
        const g = b && (b.groups || []).find((x) => x.id === c.gid); if (!g) return closePop();
        h = '<div class="pl">Group color</div><div class="swatches">' + GROUP_COLORS.map((col) => '<button style="--c:' + col + '" data-action="group-color" data-v="' + col + '" aria-pressed="' + (g.color === col) + '" aria-label="Color ' + col + '"></button>').join('') + '</div><div class="sep"></div>' +
          '<button class="opt" data-action="group-add-below">' + ic('plus', 'sm') + 'Add group below</button><button class="opt" data-action="group-collapse-all">' + ic('collapse', 'sm') + 'Collapse all groups</button><button class="opt danger" data-action="group-delete">' + ic('trash', 'sm') + 'Delete group</button>';
        break;
      }
      case 'col-menu': {
        const col = b && (b.columns || []).find((x) => x.type === c.col); if (!col) return closePop();
        h = '<form class="pop-form" data-form="rename-col"><input class="field" id="pop-col" value="' + esc(colTitle(col)) + '" aria-label="Column title"><button class="primary-btn" type="submit">Save</button></form><div class="sep"></div>' +
          '<button class="opt" data-action="col-sort" data-v="asc">' + ic('sort', 'sm') + 'Sort ascending</button><button class="opt" data-action="col-sort" data-v="desc">' + ic('sort', 'sm') + 'Sort descending</button>' +
          '<button class="opt" data-action="col-hide">' + ic('hide', 'sm') + 'Hide for me</button><button class="opt danger" data-action="col-delete">' + ic('trash', 'sm') + 'Delete column</button>';
        break;
      }
      case 'col-add': {
        const missing = Object.keys(COLS).filter((k) => !hasCol(b, k));
        const icons = { owners: 'person', status: 'table', priority: 'alert', due: 'cal', timeline: 'timeline', tags: 'filter', notes: 'bubble', progress: 'okCircle', text: 'text', number: 'hash', checkbox: 'check', link: 'link' };
        h = '<div class="pl">Add column</div>' + (missing.length ? missing.map((k) => '<button class="opt" data-action="add-col" data-v="' + k + '">' + ic(icons[k], 'sm') + COLS[k].title + '</button>').join('') : '<p class="nothing" style="padding:4px 8px">Every column type is already on this board.</p>');
        break;
      }
      case 'view-add': {
        const missing = Object.keys(VIEWS).filter((k) => !(b.views || []).includes(k));
        h = '<div class="pl">Add view</div>' + (missing.length ? missing.map((k) => '<button class="opt" data-action="add-view" data-v="' + k + '">' + ic(VIEWS[k][1], 'sm') + VIEWS[k][0] + '</button>').join('') : '<p class="nothing" style="padding:4px 8px">All views are added.</p>');
        break;
      }
      case 'new-menu':
        h = '<button class="opt" data-action="new-task">' + ic('plus', 'sm') + 'New task</button><button class="opt" data-action="new-group">' + ic('groupby', 'sm') + 'New group of tasks</button>';
        break;
      case 'tb-person': {
        const f = F(b.id);
        h = '<div class="pl">Filter by person</div>' + people.map((p) => personOpt(p, 'set-fperson', f.person === p.id)).join('') + (f.person ? '<div class="sep"></div><button class="opt" data-action="set-fperson" data-pid="">Clear</button>' : '');
        break;
      }
      case 'tb-filter': {
        const f = F(b.id);
        h = '<div class="pl">Status</div>' + statuses(b).map((s) => s.key).concat(['']).map((k) => checkOpt(f.status.includes(k), 'data-action="fl" data-k="status" data-v="' + esc(k) + '"', k ? esc(sdef(b, k).label) : 'Blank', k ? esc(sdef(b, k).color) : 'var(--empty-cell)')).join('');
        if (hasCol(b, 'priority')) h += '<div class="sep"></div><div class="pl">Priority</div>' + PRIO_ORDER.concat(['']).map((k) => checkOpt(f.priority.includes(k), 'data-action="fl" data-k="priority" data-v="' + k + '"', k ? PRIO[k] : 'Blank')).join('');
        if (hasCol(b, 'tags') && (b.tagOptions || []).length) h += '<div class="sep"></div><div class="pl">Tags</div>' + b.tagOptions.map((k) => checkOpt(f.tags.includes(k), 'data-action="fl" data-k="tags" data-v="' + esc(k) + '"', esc(k))).join('');
        h += '<div class="sep"></div><button class="opt" data-action="clear-filters">Clear all</button>';
        break;
      }
      case 'tb-sort': {
        const f = F(b.id);
        h = '<div class="pl">Sort by (click again to reverse)</div>' + [{ type: 'name', title: 'Task name' }].concat(b.columns || []).map((c2) => '<button class="opt" data-action="set-sort" data-v="' + c2.type + '">' + esc(c2.title || COLS[c2.type].title) + (f.sort && f.sort.type === c2.type ? '<span class="tick">' + (f.sort.dir === 'asc' ? '↑' : '↓') + '</span>' : '') + '</button>').join('') + (f.sort ? '<div class="sep"></div><button class="opt" data-action="set-sort" data-v="">Clear sort</button>' : '');
        break;
      }
      case 'tb-hide': {
        const f = F(b.id);
        h = '<div class="pl">Show columns</div>' + (b.columns || []).map((c2) => checkOpt(!f.hidden.includes(c2.type), 'data-action="toggle-hide" data-v="' + c2.type + '"', esc(colTitle(c2)))).join('');
        break;
      }
      case 'tb-groupby': {
        const f = F(b.id);
        h = '<div class="pl">Group by</div>' + [['', 'Groups (default)'], ['status', 'Status'], ['owner', 'Person'], ['priority', 'Priority']].filter(([k]) => k !== 'priority' || hasCol(b, 'priority')).map(([k, l]) => '<button class="opt" data-action="set-groupby" data-v="' + k + '">' + l + (f.groupBy === k ? tickSvg : '') + '</button>').join('');
        break;
      }
      case 'tb-more':
        h = '<button class="opt" data-action="group-collapse-all">' + ic('collapse', 'sm') + 'Collapse all groups</button><button class="opt" data-action="group-expand-all">' + ic('expandR', 'sm') + 'Expand all groups</button><button class="opt" data-action="expand-all-subs">' + ic('right', 'sm') + 'Show all subitems</button>';
        break;
      case 'board-menu':
        h = '<div class="pl">Board name</div><form class="pop-form" data-form="rename-board"><input class="field" id="pop-bname" value="' + esc(b.name) + '" aria-label="Board name"><button class="primary-btn" type="submit">Save</button></form>' +
          '<div class="pl">Description</div><form class="pop-form" data-form="board-desc"><input class="field" id="pop-bdesc" value="' + esc(b.description || '') + '" placeholder="What is this board for?" aria-label="Board description"><button class="outline-btn" type="submit">Save</button></form><div class="sep"></div>' +
          '<button class="opt" data-action="dup-board">' + ic('copy', 'sm') + 'Duplicate board</button><button class="opt danger" data-action="delete-board">' + ic('trash', 'sm') + 'Delete board</button>';
        break;
      case 'dash-menu': {
        const d = dashboard(c.id); if (!d) return closePop();
        h = '<div class="pl">Dashboard name</div><form class="pop-form" data-form="rename-dash"><input class="field" id="pop-dname" value="' + esc(d.name) + '" aria-label="Dashboard name"><button class="primary-btn" type="submit">Save</button></form><div class="sep"></div><button class="opt danger" data-action="delete-dash">' + ic('trash', 'sm') + 'Delete dashboard</button>';
        break;
      }
      case 'dash-boards': {
        const d = dashboard(c.id); if (!d) return closePop();
        h = '<div class="pl">Boards in this dashboard</div>' + allBoards().map((x) => checkOpt((d.boardIds || []).includes(x.id), 'data-action="toggle-dash-board" data-v="' + esc(x.id) + '"', esc(x.name))).join('');
        break;
      }
      case 'dash-person':
        h = '<div class="pl">Filter by person</div>' + people.map((p) => personOpt(p, 'set-dperson', ui.dashF.person === p.id)).join('');
        break;
      case 'ws-menu':
        h = '<div class="pl">Workspace name</div><form class="pop-form" data-form="rename-ws"><input class="field" id="pop-wsname" value="' + esc(ws.name) + '" aria-label="Workspace name"><button class="primary-btn" type="submit">Save</button></form><div class="sep"></div><button class="opt" data-action="nav-ws">' + ic('settings', 'sm') + 'Manage workspace</button>';
        break;
      case 'add-menu':
        h = '<div class="pl">Add to ' + esc(ws.name) + '</div><button class="opt" data-action="new-board">' + ic('board', 'sm') + 'Board</button><button class="opt" data-action="new-dash">' + ic('dash', 'sm') + 'Dashboard</button>';
        break;
      case 'item-menu': {
        const tg = target(); if (!tg) return closePop();
        h = '<button class="opt" data-action="dup-item">' + ic('copy', 'sm') + 'Duplicate</button><div class="pl">Move to group</div>' + (tg.b.groups || []).filter((g) => g.id !== tg.t.groupId).map((g) => '<button class="opt" data-action="move-item" data-v="' + esc(g.id) + '"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:' + esc(g.color) + '"></span>' + esc(g.name) + '</button>').join('') +
          '<div class="sep"></div><button class="opt danger" data-action="delete-item">' + ic('trash', 'sm') + 'Delete task</button>';
        break;
      }
      case 'notif': {
        const me = ui.me; const list = [];
        allBoards().forEach((bb) => (bb.tasks || []).forEach((t) => {
          (t.updates || []).forEach((u) => {
            if (u.kind === 'handoff' && u.to === me && u.author !== me) list.push({ at: u.at, t, text: pname(u.author) + ' handed off “' + t.name + '” to you' });
            else if ((u.mentions || []).includes(me) && u.author !== me) list.push({ at: u.at, t, text: pname(u.author) + ' mentioned you in “' + t.name + '”' });
            (u.replies || []).forEach((r) => {
              if (r.author !== me && u.author === me) list.push({ at: r.at, t, text: pname(r.author) + ' replied to your update on “' + t.name + '”' });
              else if (r.author !== me && (r.mentions || []).includes(me)) list.push({ at: r.at, t, text: pname(r.author) + ' mentioned you in a reply on “' + t.name + '”' });
            });
          });
          if ((t.owners || []).includes(me) && isLate(t.due, t.status)) list.push({ at: 1e15, t, text: 'Overdue: “' + t.name + '” was due ' + fmtDate(t.due) });
          else if ((t.owners || []).includes(me) && t.status === 'stuck') list.push({ at: 1e15 - 1, t, text: 'Stuck: “' + t.name + '”' });
        }));
        list.sort((a, z) => z.at - a.at);
        h = '<div class="pl">Notifications for ' + esc(pname(me)) + '</div>' + (list.length ? list.slice(0, 12).map((x) => '<button class="opt" data-action="open-item" data-tid="' + esc(x.t.id) + '">' + esc(x.text) + '</button>').join('') : '<p class="nothing" style="padding:6px 8px">You’re all caught up.</p>');
        break;
      }
      case 'mention': {
        const q = (c.q || '').toLowerCase();
        const hits = people.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8);
        h = '<div class="pl">Mention</div>' + (hits.length ? hits.map((p) => personOpt(p, 'pick-mention', false)).join('') : '<p class="nothing" style="padding:6px 8px">No one matches.</p>');
        break;
      }
      case 'me-menu':
        h = '<div class="pl">Viewing as</div>' + people.map((p) => personOpt(p, 'set-me', ui.me === p.id)).join('') +
          '<div class="sep"></div><button class="opt" data-action="theme">' + ic('moon', 'sm') + (effectiveTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode') + '</button><button class="opt" data-action="nav-ws">' + ic('settings', 'sm') + 'Manage workspace</button>';
        break;
      case 'person-color': {
        const p = person(c.pid); if (!p) return closePop();
        h = '<div class="pl">Avatar color</div><div class="swatches">' + PERSON_COLORS.map((col) => '<button style="--c:' + col + '" data-action="set-person-color" data-v="' + col + '" aria-pressed="' + (p.color === col) + '" aria-label="Color ' + col + '"></button>').join('') + '</div>';
        break;
      }
      case 'bulk-status':
        h = '<div class="label-grid">' + statuses(b).map((s) => '<button class="label-opt st-' + esc(s.key) + '" ' + stStyle(s) + ' data-action="bulk-set-status" data-v="' + esc(s.key) + '">' + esc(s.label) + '</button>').join('') + '</div>';
        break;
      case 'bulk-assign':
        h = '<div class="pl">Assign selected to</div>' + people.map((p) => personOpt(p, 'bulk-set-owner', false)).join('');
        break;
      case 'bulk-move':
        h = '<div class="pl">Move to group</div>' + (b.groups || []).map((g) => '<button class="opt" data-action="bulk-set-group" data-v="' + esc(g.id) + '"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:' + esc(g.color) + '"></span>' + esc(g.name) + '</button>').join('');
        break;
      case 'gsearch': {
        const q = (document.getElementById('gsearch') || {}).value || '';
        const ql = q.trim().toLowerCase();
        if (!ql) return closePop();
        const hits = [];
        allBoards().forEach((bb) => { if (bb.name.toLowerCase().includes(ql)) hits.push('<button class="opt" data-action="nav-board" data-id="' + esc(bb.id) + '">' + ic('board', 'sm') + '<span class="who"><span>' + esc(bb.name) + '</span><span class="ctx">Board</span></span></button>'); });
        allBoards().forEach((bb) => (bb.tasks || []).forEach((t) => { if (t.name.toLowerCase().includes(ql)) hits.push('<button class="opt" data-action="open-item" data-tid="' + esc(t.id) + '">' + stack(t.owners, 1) + '<span class="who"><span>' + esc(t.name) + '</span><span class="ctx">' + esc(bb.name) + ' · ' + esc(slabel(t.status, bb)) + '</span></span></button>'); }));
        people.forEach((p) => { if (p.name.toLowerCase().includes(ql)) hits.push('<button class="opt" data-action="view-work" data-pid="' + esc(p.id) + '">' + av(p.id) + '<span class="who"><span>' + esc(p.name) + '</span><span class="ctx">Person · see their work</span></span></button>'); });
        h = '<div class="search-res">' + (hits.length ? hits.slice(0, 14).join('') : '<p class="nothing" style="padding:6px 8px">No matches for “' + esc(q) + '”.</p>') + '</div>';
        break;
      }
    }
    const keep = document.activeElement && pop.contains(document.activeElement) ? document.activeElement.id : null;
    pop.innerHTML = h;
    if (keep) { const e2 = document.getElementById(keep); if (e2) e2.focus(); }
    positionPop();
  }

  // ---------- tooltip ----------
  const tip = document.getElementById('tip');
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + 'px';
    tip.style.top = (r.top - th - 6 < 4 ? r.bottom + 6 : r.top - th - 6) + 'px';
  });

  // ---------- toast ----------
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg, undo) {
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" id="toast-undo">Undo</button>' : '') + '<button type="button" class="toast-x" id="toast-close" aria-label="Dismiss">×</button>';
    toastEl.hidden = false; toastEl.classList.remove('in'); void toastEl.offsetWidth; toastEl.classList.add('in');
    if (undo) toastEl.querySelector('#toast-undo').onclick = () => { undo(); toastEl.hidden = true; };
    toastEl.querySelector('#toast-close').onclick = () => { toastEl.hidden = true; if (undo) undoSnap = null; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; if (undo) undoSnap = null; }, undo ? 20000 : 3800);
  }

  // ---------- actions ----------
  function addPerson(name, role) {
    const used = new Set(people.map((p) => p.color));
    const color = PERSON_COLORS.find((c) => !used.has(c)) || PERSON_COLORS[people.length % PERSON_COLORS.length];
    const p = { id: uid('u_'), name: name.trim(), role: (role || '').trim(), color };
    people.push(p); return p;
  }
  function addTaskTo(b, gid, name, preset) {
    const t = { id: uid('t_'), groupId: gid, name, owners: [], status: '', priority: '', due: '', start: '', tags: [], notes: '', subtasks: [], updates: [], activity: [], createdAt: Date.now() };
    Object.assign(t, preset || {});
    logAct(t, 'Created in ' + (((b.groups || []).find((g) => g.id === gid) || {}).name || 'board'));
    b.tasks = b.tasks || [];
    b.tasks.push(t);
    return t;
  }
  function presetFromVkey(b, vkey) {
    const f = F(b.id); if (!f.groupBy || !vkey || vkey === '__none') return {};
    if (f.groupBy === 'owner') return { owners: [vkey] };
    return { [f.groupBy]: vkey };
  }
  const narrow = () => window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  function openBoard(id) { ui.section = 'board'; ui.id = id; ui.drawer = null; ui.sel.clear(); if (narrow()) ui.panel = false; render(); const m = document.querySelector('.main'); if (m) { m.scrollTop = 0; m.scrollLeft = 0; } }
  function curBoard() { return ui.section === 'board' ? board(ui.id) : null; }
  function dupTask(t) { const c = clone(t); c.id = uid('t_'); c.name += ' (copy)'; c.updates = []; c.activity = []; (c.subtasks || []).forEach((s) => { s.id = uid('s_'); }); return c; }

  const actions = {
    'rail-ws'() { if (ui.panel && ui.panelMode === 'ws') ui.panel = false; else { ui.panel = true; ui.panelMode = 'ws'; } render(); },
    'rail-fav'() { if (ui.panel && ui.panelMode === 'fav') ui.panel = false; else { ui.panel = true; ui.panelMode = 'fav'; } render(); },
    'panel-open'() { ui.panel = true; render(); },
    'panel-close'() { ui.panel = false; render(); },
    'focus-search'() { const g = document.getElementById('gsearch'); if (g) g.focus(); },
    'nav-board'(el) { closePop(); openBoard(el.dataset.id); },
    'nav-dash'(el) { closePop(); ui.section = 'dash'; ui.id = el.dataset.id; ui.drawer = null; if (narrow()) ui.panel = false; render(); },
    'nav-mywork'() { closePop(); ui.section = 'mywork'; ui.mwPerson = null; ui.drawer = null; if (narrow()) ui.panel = false; render(); },
    'nav-ws'() { closePop(); ui.section = 'workspace'; ui.drawer = null; ui.modal = null; if (narrow()) ui.panel = false; render(); },
    'nav-ws-close'() { ui.modal = null; ui.section = 'workspace'; ui.wsTab = 'members'; render(); },
    'ws-tab'(el) { ui.wsTab = el.dataset.v; render(); },
    'view-work'(el) { closePop(); ui.section = 'mywork'; ui.mwPerson = el.dataset.pid; ui.drawer = null; render(); },
    'mw-done'() { ui.mwDone = !ui.mwDone; render(); },
    'ws-menu'(el) { openPop(el, { kind: 'ws-menu' }); },
    'add-menu'(el) { openPop(el, { kind: 'add-menu' }); },
    'new-board'() {
      closePop(); if (!guard()) return;
      const b = newBoard('New board');
      boards[b.id] = b; ws.order = navItems().concat([b.id]);
      store.saveBoard(b.id); store.saveWs(); openBoard(b.id);
      const bn = document.querySelector('.board-name'); if (bn) openPop(bn, { kind: 'board-menu' });
    },
    'new-dash'() {
      closePop(); if (!guard()) return;
      const d = { id: uid('d_'), name: 'New dashboard', boardIds: allBoards().map((x) => x.id) };
      ws.dashboards = (ws.dashboards || []).concat([d]); ws.order = navItems().concat([d.id]);
      store.saveWs(); ui.section = 'dash'; ui.id = d.id; render();
    },
    fav() { const id = ui.id; if (ui.favs.has(id)) ui.favs.delete(id); else ui.favs.add(id); lsSet('cb:favs', JSON.stringify(Array.from(ui.favs))); render(); },
    invite() { closePop(); ui.modal = 'invite'; ui.modalFocused = false; render(); },
    'modal-close'() { ui.modal = null; render(); },
    'modal-bg'(el, e) { if (e.target === el) { ui.modal = null; render(); } },
    theme() {
      closePop();
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next; lsSet('cb:theme', next); render();
    },
    'me-menu'(el) { openPop(el, { kind: 'me-menu' }); },
    'set-me'(el) { ui.me = el.dataset.pid; lsSet('cb:me', ui.me); closePop(); render(); },
    notif(el) { openPop(el, { kind: 'notif' }); },
    'board-menu'(el) { openPop(el, { kind: 'board-menu' }); },
    'dup-board'() {
      const b = curBoard(); closePop(); if (!b || !guard()) return;
      const c = clone(b); c.id = uid('b_'); c.name = b.name + ' (copy)'; c.createdAt = Date.now();
      c.tasks = (c.tasks || []).map((t) => { const x = dupTask(t); x.name = t.name; return x; });
      boards[c.id] = c;
      const order = navItems(); order.splice(order.indexOf(b.id) + 1, 0, c.id); ws.order = order;
      store.saveBoard(c.id); store.saveWs(); openBoard(c.id);
    },
    'delete-board'() { const b = curBoard(); closePop(); if (b) deleteNavItem(b.id); },
    'delete-item-ws'(el) { deleteNavItem(el.dataset.id); },
    'dash-menu'(el) { openPop(el, { kind: 'dash-menu', id: el.dataset.id }); },
    'delete-dash'() { const id = popCtx.id; closePop(); deleteNavItem(id); },
    'dash-boards'(el) { openPop(el, { kind: 'dash-boards', id: el.dataset.id }); },
    'toggle-dash-board'(el) {
      const d = dashboard(popCtx.id); if (!d) return; const v = el.dataset.v;
      mutate(null, () => { d.boardIds = (d.boardIds || []).includes(v) ? d.boardIds.filter((x) => x !== v) : (d.boardIds || []).concat([v]); }, { ws: true });
    },
    'dash-person'(el) { openPop(el, { kind: 'dash-person' }); },
    'set-dperson'(el) { ui.dashF.person = ui.dashF.person === el.dataset.pid ? null : el.dataset.pid; closePop(); render(); },
    'dash-clear'() { ui.dashF = { q: '', person: null }; render(); },
    view(el) { ui.views[ui.id] = el.dataset.v; render(); },
    'view-remove'(el) { const b = curBoard(); const v = el.dataset.v; mutate(b, () => { b.views = b.views.filter((x) => x !== v); }); },
    'view-add'(el) { openPop(el, { kind: 'view-add' }); },
    'add-view'(el) { const b = curBoard(); const v = el.dataset.v; closePop(); ui.views[b.id] = v; mutate(b, () => { b.views = (b.views || ['table']).concat([v]); }); },
    'new-menu'(el) { openPop(el, { kind: 'new-menu' }); },
    'new-task'() {
      const b = curBoard(); closePop(); if (!b || !guard()) return;
      let t;
      mutate(b, () => {
        if (!(b.groups || []).length) b.groups = [{ id: uid('g_'), name: 'Group Title', color: GROUP_COLORS[0] }];
        t = addTaskTo(b, b.groups[0].id, 'New task', ui.me ? { owners: [ui.me] } : {});
        b.tasks.splice(b.tasks.indexOf(t), 1); b.tasks.unshift(t);
      });
      if (!t) return;
      ui.views[b.id] = 'table'; ui.collapsed.delete(b.groups[0].id); render();
      const inp = document.querySelector('[data-edit="task-name"][data-tid="' + t.id + '"]'); if (inp) { inp.focus(); inp.select(); inp.scrollIntoView({ block: 'nearest' }); }
    },
    'new-group'() {
      const b = curBoard(); closePop(); if (!b) return;
      const g = { id: uid('g_'), name: 'New Group', color: GROUP_COLORS[(b.groups || []).length % GROUP_COLORS.length] };
      mutate(b, () => { b.groups = [g].concat(b.groups || []); });
      F(b.id).groupBy = ''; ui.views[b.id] = 'table'; render();
      const inp = document.querySelector('[data-edit="group-name"][data-gid="' + g.id + '"]'); if (inp) { inp.focus(); inp.select(); }
    },
    'tb-search'() { const b = curBoard(); F(b.id).searchOpen = true; render(); const s = document.getElementById('tool-search'); if (s) s.focus(); },
    'tb-person'(el) { openPop(el, { kind: 'tb-person' }); },
    'set-fperson'(el) { const f = F(ui.id); f.person = el.dataset.pid && f.person !== el.dataset.pid ? el.dataset.pid : null; closePop(); render(); },
    'tb-filter'(el) { openPop(el, { kind: 'tb-filter' }); },
    fl(el) { const f = F(ui.id); const k = el.dataset.k, v = el.dataset.v; f[k] = f[k].includes(v) ? f[k].filter((x) => x !== v) : f[k].concat([v]); render(); },
    'clear-filters'() { const f = F(ui.id); f.q = ''; f.person = null; f.status = []; f.priority = []; f.tags = []; f.searchOpen = false; closePop(); render(); },
    'tb-sort'(el) { openPop(el, { kind: 'tb-sort' }); },
    'set-sort'(el) { const f = F(ui.id); const v = el.dataset.v; if (!v) f.sort = null; else if (f.sort && f.sort.type === v) f.sort = f.sort.dir === 'asc' ? { type: v, dir: 'desc' } : null; else f.sort = { type: v, dir: 'asc' }; render(); },
    'tb-hide'(el) { openPop(el, { kind: 'tb-hide' }); },
    'toggle-hide'(el) { const f = F(ui.id); const v = el.dataset.v; f.hidden = f.hidden.includes(v) ? f.hidden.filter((x) => x !== v) : f.hidden.concat([v]); render(); },
    'tb-groupby'(el) { openPop(el, { kind: 'tb-groupby' }); },
    'set-groupby'(el) { F(ui.id).groupBy = el.dataset.v; closePop(); render(); },
    'tb-more'(el) { openPop(el, { kind: 'tb-more' }); },
    'group-toggle'(el) { const id = el.dataset.gid; if (ui.collapsed.has(id)) ui.collapsed.delete(id); else ui.collapsed.add(id); render(); },
    'group-collapse-all'() { const b = curBoard(); closePop(); if (b) viewGroups(b).forEach((x) => ui.collapsed.add(x.g.id)); render(); },
    'group-expand-all'() { closePop(); ui.collapsed.clear(); render(); },
    'expand-all-subs'() { const b = curBoard(); closePop(); (b.tasks || []).forEach((t) => { if ((t.subtasks || []).length) ui.open.add(t.id); }); ui.views[b.id] = 'table'; render(); },
    'group-menu'(el) { openPop(el, { kind: 'group-menu', gid: el.dataset.gid }); },
    'group-color'(el) { const b = curBoard(); const g = b.groups.find((x) => x.id === popCtx.gid); closePop(); mutate(b, () => { g.color = el.dataset.v; }); },
    'group-add-below'() {
      const b = curBoard(); const i = b.groups.findIndex((x) => x.id === popCtx.gid); closePop();
      const g = { id: uid('g_'), name: 'New Group', color: GROUP_COLORS[(b.groups.length + 2) % GROUP_COLORS.length] };
      mutate(b, () => { b.groups.splice(i + 1, 0, g); });
      const inp = document.querySelector('[data-edit="group-name"][data-gid="' + g.id + '"]'); if (inp) { inp.focus(); inp.select(); }
    },
    'group-delete'() {
      const b = curBoard(); const gid = popCtx.gid; closePop(); if (!guard()) return;
      const g = b.groups.find((x) => x.id === gid); if (!g) return;
      snapshotUndo('Deleted group “' + g.name + '”');
      mutate(b, () => { b.groups = b.groups.filter((x) => x.id !== gid); b.tasks = b.tasks.filter((t) => t.groupId !== gid); });
    },
    'col-menu'(el) { openPop(el, { kind: 'col-menu', col: el.dataset.col }); },
    'col-sort'(el) { F(ui.id).sort = { type: popCtx.col, dir: el.dataset.v }; closePop(); render(); },
    'col-hide'() { const f = F(ui.id); f.hidden = f.hidden.concat([popCtx.col]); closePop(); render(); },
    'col-delete'() {
      const b = curBoard(); const col = popCtx.col; closePop(); if (!guard()) return;
      const c = b.columns.find((x) => x.type === col); if (!c) return;
      snapshotUndo('Deleted the ' + colTitle(c) + ' column');
      mutate(b, () => { b.columns = b.columns.filter((x) => x.type !== col); });
    },
    'col-add'(el) { openPop(el, { kind: 'col-add' }); },
    'add-col'(el) { const b = curBoard(); const v = el.dataset.v; closePop(); mutate(b, () => { b.columns = (b.columns || []).concat([{ type: v, title: COLS[v].title }]); }); },
    sel(el) { const id = el.dataset.tid; if (ui.sel.has(id)) ui.sel.delete(id); else ui.sel.add(id); render(); },
    'sel-group'(el) {
      const b = curBoard(); const x = viewGroups(b).find((v) => v.g.id === el.dataset.gid); if (!x) return;
      const all = x.tasks.every((t) => ui.sel.has(t.id));
      x.tasks.forEach((t) => (all ? ui.sel.delete(t.id) : ui.sel.add(t.id))); render();
    },
    'bulk-clear'() { ui.sel.clear(); render(); },
    'bulk-done'() { const b = curBoard(); const n = ui.sel.size; mutate(b, () => b.tasks.forEach((t) => { if (ui.sel.has(t.id)) setStatus(t, 'done'); })); ui.sel.clear(); render(); toast('Marked ' + n + ' done'); },
    'bulk-status'(el) { openPop(el, { kind: 'bulk-status' }); },
    'bulk-set-status'(el) { const b = curBoard(); closePop(); mutate(b, () => b.tasks.forEach((t) => { if (ui.sel.has(t.id)) setStatus(t, el.dataset.v); })); },
    'bulk-assign'(el) { openPop(el, { kind: 'bulk-assign' }); },
    'bulk-set-owner'(el) {
      const b = curBoard(); const pid = el.dataset.pid; closePop();
      mutate(b, () => b.tasks.forEach((t) => { if (ui.sel.has(t.id) && !(t.owners || []).includes(pid)) { t.owners = (t.owners || []).concat([pid]); logAct(t, 'Assigned ' + pname(pid)); } }));
      toast('Assigned ' + ui.sel.size + ' to ' + pname(pid));
    },
    'bulk-move'(el) { openPop(el, { kind: 'bulk-move' }); },
    'bulk-set-group'(el) { const b = curBoard(); closePop(); mutate(b, () => b.tasks.forEach((t) => { if (ui.sel.has(t.id)) t.groupId = el.dataset.v; })); },
    'bulk-dup'() {
      const b = curBoard();
      mutate(b, () => { b.tasks.filter((t) => ui.sel.has(t.id)).forEach((t) => { b.tasks.splice(b.tasks.indexOf(t) + 1, 0, dupTask(t)); }); });
      ui.sel.clear(); render();
    },
    'like-update'(el) {
      const loc = locate(popCtx && popCtx.tid) || locate(ui.drawer); if (!loc || !ui.me) return;
      const u = (loc.t.updates || []).find((x) => x.id === el.dataset.uid); if (!u) return;
      const target = el.dataset.rid ? (u.replies || []).find((r) => r.id === el.dataset.rid) : u; if (!target) return;
      mutate(loc.b, () => { target.likes = target.likes || []; const i = target.likes.indexOf(ui.me); if (i >= 0) target.likes.splice(i, 1); else target.likes.push(ui.me); });
    },
    'reply-open'(el) { ui.replyTo = ui.replyTo === el.dataset.uid ? null : el.dataset.uid; render(); const r = document.getElementById('reply-text'); if (r) r.focus(); },
    'mention-btn'() {
      const ta = document.getElementById('upd-text') || document.getElementById('reply-text'); if (!ta) return;
      const pos = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      const before = ta.value.slice(0, pos); const sep = before && !/\s$/.test(before) ? ' ' : '';
      ta.value = before + sep + '@' + ta.value.slice(pos); ta.focus(); ta.setSelectionRange(before.length + sep.length + 1, before.length + sep.length + 1);
      openPop(ta, { kind: 'mention', q: '', focus: false, field: ta.id });
    },
    'pick-mention'(el) {
      const p = person(el.dataset.pid); const ta = document.getElementById(popCtx && popCtx.field || 'upd-text'); closePop(); if (!p || !ta) return;
      const pos = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      const before = ta.value.slice(0, pos); const at = before.lastIndexOf('@');
      const head = at >= 0 ? before.slice(0, at) : before;
      ta.value = head + '@' + p.name + ' ' + ta.value.slice(pos); ta.focus(); const np = head.length + p.name.length + 2; ta.setSelectionRange(np, np);
    },
    'cal-prev'() { const b = curBoard(); const [y, m] = calMonth(b).split('-').map(Number); (ui.cal || (ui.cal = {}))[b.id] = isoDay(new Date(y, m - 2, 1)).slice(0, 7); render(); },
    'cal-next'() { const b = curBoard(); const [y, m] = calMonth(b).split('-').map(Number); (ui.cal || (ui.cal = {}))[b.id] = isoDay(new Date(y, m, 1)).slice(0, 7); render(); },
    'cal-today'() { const b = curBoard(); (ui.cal || (ui.cal = {}))[b.id] = today().slice(0, 7); render(); },
    'cal-add'(el) {
      const b = curBoard(); if (!b || !guard()) return; const d = el.dataset.v;
      let t;
      mutate(b, () => {
        if (!(b.groups || []).length) b.groups = [{ id: uid('g_'), name: 'Group Title', color: GROUP_COLORS[0] }];
        t = addTaskTo(b, b.groups[0].id, 'New task', Object.assign({ due: d }, ui.me ? { owners: [ui.me] } : {}));
      });
      if (!t) return;
      ui.drawer = t.id; ui.dtab = 'updates'; render();
      const ti = document.getElementById('d-title'); if (ti) { ti.focus(); ti.select(); }
    },
    'bulk-export'() {
      const b = curBoard(); if (!b) return;
      const rows = (b.tasks || []).filter((t) => ui.sel.has(t.id));
      const gname = (id) => (((b.groups || []).find((g) => g.id === id) || {}).name || '');
      const head = ['Task', 'Group', 'Owners', 'Status', 'Priority', 'Start', 'Due date', 'Tags', 'Notes', 'Text', 'Number', 'Checkbox', 'Link', 'Subitems done', 'Subitems'];
      const cell = (v) => { const x = String(v == null ? '' : v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
      const lines = [head.join(',')].concat(rows.map((t) => [t.name, gname(t.groupId), (t.owners || []).map(pname).join('; '), slabel(t.status, b) === 'Blank' ? '' : slabel(t.status, b), PRIO[t.priority] || '', t.start || '', t.due || '', (t.tags || []).join('; '), t.notes || '', t.text || '', t.number == null ? '' : t.number, t.checked ? 'yes' : 'no', t.link || '', (t.subtasks || []).filter((s) => s.status === 'done').length, (t.subtasks || []).length].map(cell).join(',')));
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.name.replace(/[^\w.-]+/g, '_') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Exported ' + rows.length + (rows.length === 1 ? ' task' : ' tasks') + ' to CSV');
    },
    check(el) { const loc = locate(el.dataset.tid); if (!loc) return; mutate(loc.b, () => { loc.t.checked = !loc.t.checked; logAct(loc.t, loc.t.checked ? 'Checked' : 'Unchecked'); }); },
    'kanban-add'(el) {
      const b = curBoard(); if (!b || !guard()) return;
      let t;
      mutate(b, () => {
        if (!(b.groups || []).length) b.groups = [{ id: uid('g_'), name: 'Group Title', color: GROUP_COLORS[0] }];
        t = addTaskTo(b, b.groups[0].id, 'New task', Object.assign(ui.me ? { owners: [ui.me] } : {}, el.dataset.v ? { status: el.dataset.v } : {}));
        b.tasks.splice(b.tasks.indexOf(t), 1); b.tasks.unshift(t);
      });
      if (!t) return;
      ui.drawer = t.id; ui.dtab = 'updates'; render();
      const ti = document.getElementById('d-title'); if (ti) { ti.focus(); ti.select(); }
    },
    'bulk-delete'() {
      const b = curBoard(); if (!guard()) return; const n = ui.sel.size;
      snapshotUndo('Deleted ' + n + (n === 1 ? ' task' : ' tasks'));
      mutate(b, () => { b.tasks = b.tasks.filter((t) => !ui.sel.has(t.id)); }); ui.sel.clear(); render();
    },
    expand(el) { const id = el.dataset.tid; if (ui.open.has(id)) ui.open.delete(id); else { ui.open.add(id); const l = locate(id); if (l && !(l.t.subtasks || []).length) ui.focusAfter = 'addsub-' + id; } render(); if (ui.focusAfter) { const f = document.querySelector('[data-focus-key="' + CSS.escape(ui.focusAfter) + '"]'); ui.focusAfter = null; if (f) f.focus(); } },
    'open-item'(el) { const loc = locate(el.dataset.tid); closePop(); if (!loc) return; ui.drawer = loc.t.id; ui.dtab = 'updates'; render(); },
    'close-drawer'() { ui.drawer = null; render(); },
    dtab(el) { ui.dtab = el.dataset.v; render(); },
    'item-menu'(el) { openPop(el, { kind: 'item-menu', tid: el.dataset.tid }); },
    'dup-item'() { const tg = target(); closePop(); if (!tg) return; mutate(tg.b, () => { tg.b.tasks.splice(tg.b.tasks.indexOf(tg.t) + 1, 0, dupTask(tg.t)); }); },
    'move-item'(el) { const tg = target(); closePop(); if (!tg) return; const g = tg.b.groups.find((x) => x.id === el.dataset.v); mutate(tg.b, () => { tg.t.groupId = el.dataset.v; logAct(tg.t, 'Moved to ' + g.name); }); },
    'delete-item'() {
      const tg = target(); closePop(); if (!tg || !guard()) return;
      snapshotUndo('Deleted “' + tg.t.name + '”'); ui.drawer = null;
      mutate(tg.b, () => { tg.b.tasks = tg.b.tasks.filter((x) => x.id !== tg.t.id); });
    },
    'delete-sub'(el) {
      const loc = locate(el.dataset.tid); if (!loc) return;
      const s = subOf(loc.t, el.dataset.sid); if (!s) return;
      mutate(loc.b, () => {
        loc.t.subtasks = loc.t.subtasks.filter((x) => x.id !== s.id); logAct(loc.t, 'Deleted subitem “' + s.name + '”');
        if (loc.t.subtasks.length && loc.t.subtasks.every((x) => x.status === 'done') && loc.t.status !== 'done') { logAct(loc.t, 'Status: ' + slabel(loc.t.status) + ' → Done (all subitems done)'); loc.t.status = 'done'; }
      });
    },
    'quick-done'(el) {
      const loc = locate(el.dataset.tid); if (!loc) return;
      const s = el.dataset.sid ? subOf(loc.t, el.dataset.sid) : null;
      const item = s || loc.t;
      const next = item.status === 'done' ? 'working' : 'done';
      mutate(loc.b, () => setStatus(loc.t, next, s));
      if (next === 'done' && !readOnly) toast('Marked “' + item.name + '” done');
    },
    owners(el) { openPop(el, { kind: 'owners', tid: el.dataset.tid, sid: el.dataset.sid, focus: false }); },
    'toggle-owner'(el) {
      const tg = target(); if (!tg) return closePop();
      const id = el.dataset.pid;
      mutate(tg.b, () => {
        const o = tg.item.owners || (tg.item.owners = []);
        const i = o.indexOf(id);
        if (i >= 0) { o.splice(i, 1); logAct(tg.t, (tg.s ? 'Subitem “' + tg.s.name + '”: removed ' : 'Removed ') + pname(id)); }
        else { o.push(id); logAct(tg.t, (tg.s ? 'Subitem “' + tg.s.name + '”: assigned ' : 'Assigned ') + pname(id)); }
      });
    },
    status(el) { openPop(el, { kind: 'status', tid: el.dataset.tid, sid: el.dataset.sid, center: true }); },
    'set-status'(el) { const tg = target(); closePop(); if (!tg) return; mutate(tg.b, () => setStatus(tg.t, el.dataset.v, tg.s)); },
    'status-edit'() {
      const tg = target(); if (!tg) return closePop();
      ui.labelDraft = clone(statuses(tg.b)); ui.labelColorRow = null;
      popCtx.kind = 'status-edit'; popCtx.bid = tg.b.id; popCtx.center = false; refreshPop();
      const first = pop.querySelector('[data-label-i]'); if (first) first.focus();
    },
    'label-color'(el) { syncLabelDraft(); const i = Number(el.dataset.i); ui.labelColorRow = ui.labelColorRow === i ? null : i; refreshPop(); },
    'set-label-color'(el) { syncLabelDraft(); ui.labelDraft[Number(el.dataset.i)].color = el.dataset.v; ui.labelColorRow = null; refreshPop(); },
    'label-add'() { syncLabelDraft(); const used = new Set(ui.labelDraft.map((s) => s.color)); ui.labelDraft.push({ key: uid('st_'), label: 'New label', color: LABEL_COLORS.find((c) => !used.has(c)) || LABEL_COLORS[ui.labelDraft.length % LABEL_COLORS.length] }); refreshPop(); const rows = pop.querySelectorAll('[data-label-i]'); const last = rows[rows.length - 1]; if (last) { last.focus(); last.select(); } },
    'label-del'(el) { syncLabelDraft(); ui.labelDraft.splice(Number(el.dataset.i), 1); ui.labelColorRow = null; refreshPop(); },
    'labels-cancel'() { ui.labelDraft = null; closePop(); },
    'labels-apply'() {
      syncLabelDraft();
      const b = board(popCtx.bid); const draft = (ui.labelDraft || []).map((s) => ({ key: s.key, label: (s.label || '').trim() || 'Label', color: s.color })); ui.labelDraft = null; closePop();
      if (!b) return;
      const keep = new Set(draft.map((s) => s.key));
      mutate(b, () => {
        b.statuses = draft;
        (b.tasks || []).forEach((t) => { if (t.status && !keep.has(t.status)) t.status = ''; (t.subtasks || []).forEach((s) => { if (s.status && !keep.has(s.status)) s.status = ''; }); });
      });
    },
    priority(el) { openPop(el, { kind: 'priority', tid: el.dataset.tid, center: true }); },
    'set-priority'(el) { const tg = target(); closePop(); if (!tg) return; mutate(tg.b, () => { logAct(tg.t, 'Priority: ' + (PRIO[tg.t.priority] || 'Blank') + ' → ' + (PRIO[el.dataset.v] || 'Blank')); tg.t.priority = el.dataset.v; }); },
    date(el) { openPop(el, { kind: 'date', tid: el.dataset.tid, sid: el.dataset.sid, focus: false }); },
    'date-quick'(el) {
      const tg = target(); closePop(); if (!tg) return;
      const v = el.dataset.v === '' ? '' : addDaysTo(today(), Number(el.dataset.v));
      mutate(tg.b, () => { tg.item.due = v; logAct(tg.t, (tg.s ? 'Subitem “' + tg.s.name + '” date: ' : 'Due date: ') + (v ? fmtDate(v) : 'cleared')); });
    },
    timeline(el) { openPop(el, { kind: 'timeline', tid: el.dataset.tid, focus: false }); },
    'tl-clear'() { const tg = target(); closePop(); if (!tg) return; mutate(tg.b, () => { tg.t.start = ''; tg.t.due = ''; logAct(tg.t, 'Timeline cleared'); }); },
    tags(el) { openPop(el, { kind: 'tags', tid: el.dataset.tid, focus: false }); },
    'toggle-tag'(el) {
      const tg = target(); if (!tg) return; const v = el.dataset.v;
      mutate(tg.b, () => { const t = tg.t; t.tags = (t.tags || []).includes(v) ? t.tags.filter((x) => x !== v) : (t.tags || []).concat([v]); });
    },
    handoff(el) {
      const loc = locate(el.dataset.tid); if (!loc) return;
      const to = document.getElementById('handoff-to').value;
      const note = document.getElementById('handoff-note').value.trim();
      const p = person(to); if (!p) return toast('Add people with Invite first.');
      mutate(loc.b, () => {
        const from = (loc.t.owners || []).map(pname).join(', ') || 'Unassigned';
        loc.t.owners = [to];
        loc.t.updates = loc.t.updates || [];
        loc.t.updates.push({ id: uid('u_'), author: ui.me, to, text: 'Handed off to ' + p.name + (note ? ': ' + note : '.'), at: Date.now(), kind: 'handoff' });
        logAct(loc.t, 'Delegated: ' + from + ' → ' + p.name);
        if (!loc.t.status) loc.t.status = 'todo';
      });
      if (!readOnly) toast('Handed off to ' + p.name + '. It’s now in their My work.');
    },
    'remove-person'(el) {
      const p = person(el.dataset.pid); if (!p || !guard()) return;
      snapshotUndo('Removed ' + p.name + ' and unassigned their work');
      people = people.filter((x) => x.id !== p.id);
      Object.values(boards).forEach((b) => {
        let touched = false;
        (b.tasks || []).forEach((t) => [t].concat(t.subtasks || []).forEach((x) => { if ((x.owners || []).includes(p.id)) { x.owners = x.owners.filter((i) => i !== p.id); touched = true; } }));
        if (touched) store.saveBoard(b.id);
      });
      if (ui.me === p.id) ui.me = people.length ? people[0].id : null;
      mutate(null, () => {}, { people: true });
    },
    'person-color'(el) { openPop(el, { kind: 'person-color', pid: el.dataset.pid }); },
    'set-person-color'(el) { const p = person(popCtx.pid); closePop(); if (p) mutate(null, () => { p.color = el.dataset.v; }, { people: true }); },
  };
  function deleteNavItem(id) {
    if (!guard()) return;
    if (boards[id]) {
      const b = boards[id];
      snapshotUndo('Deleted board “' + b.name + '”');
      delete boards[id]; store.deleteBoard(id);
      (ws.dashboards || []).forEach((d) => { d.boardIds = (d.boardIds || []).filter((x) => x !== id); });
    } else {
      const d = dashboard(id); if (!d) return;
      snapshotUndo('Deleted dashboard “' + d.name + '”');
      ws.dashboards = ws.dashboards.filter((x) => x.id !== id);
    }
    ws.order = (ws.order || []).filter((x) => x !== id);
    store.saveWs();
    if (ui.id === id) { ui.id = null; boot(); } else render();
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    const inPop = e.target.closest('#pop');
    if (popCtx && !inPop && e.target.id !== 'gsearch') {
      const r = el && el.getBoundingClientRect();
      const same = r && popCtx.rect && Math.abs(r.top - popCtx.rect.top) < 1 && Math.abs(r.left - popCtx.rect.left) < 1;
      closePop();
      if (same) return;
    }
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'mw-person') { ui.mwPerson = el.value; render(); return; }
    if (el.id === 'pop-date') {
      const tg = target(); if (!tg) return;
      const v = el.value; closePop();
      mutate(tg.b, () => { tg.item.due = v; logAct(tg.t, (tg.s ? 'Subitem “' + tg.s.name + '” date: ' : 'Due date: ') + (v ? fmtDate(v) : 'cleared')); });
      return;
    }
    if (el.id === 'pop-start' || el.id === 'pop-end') {
      const tg = target(); if (!tg) return;
      const s = document.getElementById('pop-start').value, en = document.getElementById('pop-end').value;
      mutate(tg.b, () => {
        tg.t.start = s; tg.t.due = en;
        if (s && en && s > en) { tg.t.due = s; tg.t.start = en; }
        logAct(tg.t, 'Timeline: ' + (tg.t.start ? fmtDate(tg.t.start) : '—') + ' → ' + (tg.t.due ? fmtDate(tg.t.due) : '—'));
      });
      return;
    }
    const kind = el.dataset.edit; if (!kind) return;
    const val = el.value;
    if (kind === 'group-name') { const b = curBoard(); const g = b && b.groups.find((x) => x.id === el.dataset.gid); if (g) mutate(b, () => { g.name = val.trim() || 'Untitled group'; }); return; }
    if (kind === 'person-name' || kind === 'person-role') { const p = person(el.dataset.pid); if (p) mutate(null, () => { if (kind === 'person-name') p.name = val.trim() || p.name; else p.role = val.trim(); }, { people: true }); return; }
    if (kind === 'board-name') { const b = board(el.dataset.id); if (b) mutate(b, () => { b.name = val.trim() || b.name; }); return; }
    if (kind === 'dash-name') { const d = dashboard(el.dataset.id); if (d) mutate(null, () => { d.name = val.trim() || d.name; }, { ws: true }); return; }
    const loc = locate(el.dataset.tid); if (!loc) return;
    const s = el.dataset.sid ? subOf(loc.t, el.dataset.sid) : null;
    mutate(loc.b, () => {
      if (kind === 'task-name') loc.t.name = val.trim() || loc.t.name;
      else if (kind === 'notes') loc.t.notes = val;
      else if (kind === 'text') loc.t.text = val;
      else if (kind === 'link') loc.t.link = val.trim();
      else if (kind === 'number') { const n = val.trim() === '' ? '' : Number(val.replace(/[^0-9.\-]/g, '')); loc.t.number = Number.isFinite(n) ? n : ''; }
      else if (kind === 'task-group') { loc.t.groupId = val; logAct(loc.t, 'Moved to ' + ((loc.b.groups.find((g) => g.id === val) || {}).name || 'group')); }
      else if (kind === 'sub-name' && s) s.name = val.trim() || s.name;
    });
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'tool-search') { F(ui.id).q = el.value; clearTimeout(ui.st); ui.st = setTimeout(render, 160); }
    else if (el.id === 'dash-q') { ui.dashF.q = el.value; clearTimeout(ui.st); ui.st = setTimeout(render, 160); }
    else if (el.id === 'upd-text' || el.id === 'reply-text') {
      const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
      const before = el.value.slice(0, pos); const at = before.lastIndexOf('@');
      const q = at >= 0 && (at === 0 || /\s/.test(before[at - 1])) && !/\s.*\s/.test(before.slice(at + 1)) ? before.slice(at + 1) : null;
      if (q == null || q.length > 24) { if (popCtx && popCtx.kind === 'mention') closePop(); return; }
      if (!popCtx || popCtx.kind !== 'mention') openPop(el, { kind: 'mention', q, focus: false, field: el.id }); else { popCtx.q = q; refreshPop(); }
    }
    else if (el.id === 'gsearch') {
      if (!el.value.trim()) { closePop(); return; }
      if (!popCtx || popCtx.kind !== 'gsearch') openPop(el, { kind: 'gsearch', focus: false, center: true }); else refreshPop();
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.id === 'tool-search') { const f = F(ui.id); if (!f.q) { f.searchOpen = false; setTimeout(render, 150); } }
    if (ui.dirty) setTimeout(() => { if (ui.dirty) softRender(); }, 0);
  });

  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      if (popCtx) { closePop(); return; }
      if (ui.modal) { ui.modal = null; render(); return; }
      if (ui.drawer) { ui.drawer = null; render(); return; }
      if (ui.sel.size) { ui.sel.clear(); render(); return; }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === '.') { e.preventDefault(); ui.panel = !ui.panel; render(); return; }
    if (e.ctrlKey && !e.metaKey && (e.key === 'g' || e.key === 'G') && curBoard() && !(el.matches && el.matches('input, textarea'))) {
      e.preventDefault(); const b = curBoard(); const groups = viewGroups(b);
      if (groups.every((x) => ui.collapsed.has(x.g.id))) ui.collapsed.clear(); else groups.forEach((x) => ui.collapsed.add(x.g.id));
      render(); return;
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    if (el.id === 'gsearch') { const first = pop.querySelector('.opt'); if (first) first.click(); return; }
    if ((el.id === 'upd-text' || el.id === 'reply-text') && popCtx && popCtx.kind === 'mention') { const first = pop.querySelector('.opt'); if (first) { e.preventDefault(); first.click(); return; } }
    if (el.dataset && el.dataset.addTask !== undefined) {
      e.preventDefault();
      const name = el.value.trim(); if (!name) return;
      const b = curBoard(); if (!b || !(b.groups || []).length) return;
      const gid = el.dataset.addTask || b.groups[0].id;
      mutate(b, () => addTaskTo(b, gid, name, Object.assign(ui.me ? { owners: [ui.me] } : {}, presetFromVkey(b, el.dataset.vkey))));
      return;
    }
    if (el.dataset && el.dataset.addSub !== undefined) {
      e.preventDefault();
      const name = el.value.trim(); if (!name) return;
      const loc = locate(el.dataset.addSub); if (!loc) return;
      ui.open.add(loc.t.id);
      mutate(loc.b, () => {
        loc.t.subtasks = loc.t.subtasks || [];
        loc.t.subtasks.push({ id: uid('s_'), name, owners: [], status: '', due: '' });
        logAct(loc.t, 'Added subitem “' + name + '”');
        if (loc.t.status === 'done') loc.t.status = 'working';
      });
      return;
    }
    if (el.matches && el.matches('.name-in, .group-name, .notes-in, textarea.d-title')) { e.preventDefault(); el.blur(); }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target; const k = f.dataset.form;
    const val = (id) => (document.getElementById(id) || {}).value || '';
    if (k === 'add-person') {
      const n = val('np-name').trim(); if (!n) { toast('Enter a name to add someone.'); return; }
      if (!guard()) return;
      const p = addPerson(n, val('np-role'));
      if (!ui.me) { ui.me = p.id; lsSet('cb:me', p.id); }
      mutate(null, () => {}, { people: true });
      toast('Added ' + p.name + '. You can assign them work now.');
      const again = document.getElementById('np-name'); if (again) { again.value = ''; again.focus(); }
      const r = document.getElementById('np-role'); if (r) r.value = '';
    } else if (k === 'pop-add-person') {
      const n = val('pop-person').trim(); if (!n) return;
      const tg = target(); if (!tg || !guard()) return;
      const p = addPerson(n, ''); store.savePeople();
      mutate(tg.b, () => { const o = tg.item.owners || (tg.item.owners = []); o.push(p.id); logAct(tg.t, 'Assigned ' + p.name); });
      toast('Added ' + p.name + ' to the workspace and assigned them');
    } else if (k === 'post-update') {
      const text = val('upd-text').trim(); if (!text) return;
      const loc = locate(f.dataset.tid); if (!loc) return;
      mutate(loc.b, () => { loc.t.updates = loc.t.updates || []; loc.t.updates.push({ id: uid('u_'), author: ui.me, text, at: Date.now(), kind: 'note', mentions: mentionsIn(text), likes: [], replies: [] }); });
      const ta = document.getElementById('upd-text'); if (ta) ta.value = '';
    } else if (k === 'post-reply') {
      const text = val('reply-text').trim(); if (!text) return;
      const loc = locate(f.dataset.tid); if (!loc) return;
      const u = (loc.t.updates || []).find((x) => x.id === f.dataset.uid); if (!u) return;
      ui.replyTo = null;
      mutate(loc.b, () => { u.replies = u.replies || []; u.replies.push({ id: uid('r_'), author: ui.me, text, at: Date.now(), mentions: mentionsIn(text), likes: [] }); });
    } else if (k === 'add-tag') {
      const v = val('pop-tag').trim(); if (!v) return;
      const tg = target(); if (!tg) return;
      mutate(tg.b, () => { tg.b.tagOptions = tg.b.tagOptions || []; if (!tg.b.tagOptions.includes(v)) tg.b.tagOptions.push(v); if (!(tg.t.tags || []).includes(v)) tg.t.tags = (tg.t.tags || []).concat([v]); });
      const i = document.getElementById('pop-tag'); if (i) i.value = '';
    } else if (k === 'rename-col') {
      const b = curBoard(); const c = b && b.columns.find((x) => x.type === popCtx.col); const v = val('pop-col').trim(); closePop();
      if (c && v) mutate(b, () => { c.title = v; });
    } else if (k === 'rename-board') {
      const b = curBoard(); const v = val('pop-bname').trim(); closePop(); if (b && v) mutate(b, () => { b.name = v; });
    } else if (k === 'board-desc') {
      const b = curBoard(); const v = val('pop-bdesc').trim(); closePop(); if (b) mutate(b, () => { b.description = v; });
    } else if (k === 'rename-dash') {
      const d = dashboard(popCtx.id); const v = val('pop-dname').trim(); closePop(); if (d && v) mutate(null, () => { d.name = v; }, { ws: true });
    } else if (k === 'rename-ws') {
      const v = val('pop-wsname').trim(); closePop(); if (v) mutate(null, () => { ws.name = v; }, { ws: true });
    }
  });

  window.addEventListener('scroll', (e) => {
    tip.hidden = true;
    if (ui.restoreUntil && performance.now() < ui.restoreUntil) return;
    if (popCtx && performance.now() - popCtx.openedAt < 300) return;
    if (popCtx && popCtx.kind !== 'gsearch' && !(e.target && e.target.closest && e.target.closest('#pop'))) closePop();
  }, true);
  window.addEventListener('resize', () => { if (popCtx) closePop(); });

  // Drag and drop: Kanban cards between lanes, and table rows within or between groups.
  let dragId = null; let rowDragId = null;
  document.addEventListener('dragstart', (e) => {
    const g = e.target.closest && e.target.closest('[data-drag]');
    if (g) { rowDragId = g.dataset.drag; const row = g.closest('.tr'); if (row) row.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', rowDragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ } return; }
    const c = e.target.closest && e.target.closest('[data-card]'); if (!c) return; dragId = c.dataset.card; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('dragend', () => { dragId = null; rowDragId = null; document.querySelectorAll('.dragging, .over, .drop-before, .drop-after').forEach((x) => x.classList.remove('dragging', 'over', 'drop-before', 'drop-after')); });
  const clearRowMarks = () => document.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  function rowDropTarget(e) {
    const row = e.target.closest && e.target.closest('.tr[data-row], .tr.add');
    if (!row || !rowDragId) return null;
    if (row.classList.contains('add')) { const inp = row.querySelector('[data-add-task]'); return inp && inp.dataset.addTask ? { row, gid: inp.dataset.addTask, tid: null, after: true } : null; }
    if (row.dataset.row === rowDragId) return null;
    const r = row.getBoundingClientRect();
    return { row, gid: row.dataset.gid, tid: row.dataset.row, after: e.clientY > r.top + r.height / 2 };
  }
  document.addEventListener('dragover', (e) => {
    if (rowDragId) { const tg = rowDropTarget(e); clearRowMarks(); if (!tg) return; e.preventDefault(); tg.row.classList.add(tg.after ? 'drop-after' : 'drop-before'); return; }
    const l = e.target.closest && e.target.closest('[data-drop]'); if (!l || !dragId) return; e.preventDefault(); document.querySelectorAll('.lane-body.over').forEach((x) => { if (x !== l) x.classList.remove('over'); }); l.classList.add('over');
  });
  function moveTaskTo(b, tid, gid, targetTid, after) {
    const t = (b.tasks || []).find((x) => x.id === tid); if (!t) return;
    const fromG = t.groupId;
    mutate(b, () => {
      b.tasks = b.tasks.filter((x) => x !== t);
      t.groupId = gid;
      let idx = targetTid ? b.tasks.findIndex((x) => x.id === targetTid) : -1;
      if (idx < 0) { let last = -1; b.tasks.forEach((x, i) => { if (x.groupId === gid) last = i; }); idx = last < 0 ? b.tasks.length : last + 1; } else if (after) idx += 1;
      b.tasks.splice(idx, 0, t);
      if (fromG !== gid) logAct(t, 'Moved to ' + ((b.groups.find((g) => g.id === gid) || {}).name || 'group'));
    });
  }
  document.addEventListener('dragover', (e) => { const l = e.target.closest && e.target.closest('[data-drop]'); if (!l || !dragId) return; e.preventDefault(); document.querySelectorAll('.lane-body.over').forEach((x) => { if (x !== l) x.classList.remove('over'); }); l.classList.add('over'); });
  document.addEventListener('drop', (e) => {
    if (rowDragId) { const tg = rowDropTarget(e); const id = rowDragId; rowDragId = null; clearRowMarks(); if (!tg) return; e.preventDefault(); const b = curBoard(); if (b) moveTaskTo(b, id, tg.gid, tg.tid, tg.after); return; }
    const l = e.target.closest && e.target.closest('[data-drop]'); if (!l || !dragId) return; e.preventDefault();
    const loc = locate(dragId); dragId = null; if (!loc) return;
    const s = l.dataset.drop === '__blank' ? '' : l.dataset.drop;
    if ((loc.t.status || '') !== s) mutate(loc.b, () => setStatus(loc.t, s)); else render();
  });

  // Column resize: drag the handle at the right edge of a column header. Width is saved on the board.
  let resizing = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest && e.target.closest('[data-resize]'); if (!h) return;
    const b = curBoard(); if (!b) return; const c = (b.columns || []).find((x) => x.type === h.dataset.resize); if (!c) return;
    e.preventDefault(); resizing = { b, c, x0: e.clientX, w0: colW(c), w: colW(c) };
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    document.body.classList.add('resizing');
  });
  document.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    resizing.w = Math.max(70, Math.min(600, resizing.w0 + (e.clientX - resizing.x0)));
    const cols = visibleCols(resizing.b);
    const tpl = '6px 40px 420px ' + cols.map((c) => (c === resizing.c ? resizing.w : colW(c)) + 'px').join(' ') + ' 48px';
    document.querySelectorAll('.board-body .tbl').forEach((t) => { if (!t.closest('.subwrap')) t.style.setProperty('--tpl', tpl); });
  });
  const endResize = () => { if (!resizing) return; const r = resizing; resizing = null; document.body.classList.remove('resizing'); if (r.w !== r.w0) mutate(r.b, () => { r.c.w = Math.round(r.w); }); };
  document.addEventListener('pointerup', endResize); document.addEventListener('pointercancel', endResize);

  store.init();
})();
