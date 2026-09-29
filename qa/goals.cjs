// Goal checker: each goal is a real project-management workflow with explicit pass/fail checks,
// verified both on screen and in the saved server data.
'use strict';
const { chromium, startServer, reset, getState, openPage } = require('./lib.cjs');

class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const window_w = 1440;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = async (srv) => { await wait(700); return getState(srv.port); };
const hack = (s) => s.boards.b_hackathon;
const gen = (s) => s.boards.b_general;
const findTask = (b, name) => b.tasks.find((t) => t.name === name);
const rowName = (p, name) => p.locator(`[data-edit="task-name"][value="${name.replace(/"/g, '\\"')}"]`);
const tidOf = async (p, name) => (await rowName(p, name).first().getAttribute('data-tid'));
const nav = async (p, id) => { await p.click(`.nav-item[data-id="${id}"]`); await p.waitForTimeout(80); };
const texts = (p, sel) => p.$$eval(sel, (els) => els.map((e) => e.value || e.textContent.trim()));

const GOALS = [
  ['Boards load with the imported data', async (p, srv) => {
    await nav(p, 'b_hackathon');
    expect(await p.locator('.board-name').innerText() === 'Community Hackathon', 'board title wrong');
    expect(await p.locator('[data-edit="task-name"]').count() === 26, 'expected 26 hackathon tasks on screen');
    await nav(p, 'b_general');
    const heads = await p.$$eval('.tr.th .col-head .t', (e) => e.map((x) => x.textContent));
    expect(['Assignees', 'Priority', 'Deadline', 'Status', 'Tags', 'Notes'].every((h) => heads.includes(h)), 'general board columns missing: ' + heads.join(','));
  }],
  ['Add a task from the "+ Add task" row', async (p, srv) => {
    await nav(p, 'b_general');
    await p.fill('[data-add-task]', 'QA new task'); await p.keyboard.press('Enter');
    expect(await rowName(p, 'QA new task').count() === 1, 'new task not shown');
    expect(await p.locator('[data-add-task]').first().evaluate((e) => e === document.activeElement && e.value === ''), 'add row should be cleared and keep focus for the next task');
    expect(findTask(gen(await saved(srv)), 'QA new task'), 'new task not saved');
  }],
  ['"New task" button creates a task at the top, ready to rename', async (p, srv) => {
    await nav(p, 'b_general');
    await p.click('.split [data-action="new-task"]');
    expect(await p.evaluate(() => document.activeElement && document.activeElement.value === 'New task'), 'new task name not focused');
    await p.keyboard.type('Renamed via New task'); await p.keyboard.press('Enter');
    const first = (await texts(p, '[data-edit="task-name"]'))[0];
    expect(first === 'Renamed via New task', 'first row is ' + first);
    expect(findTask(gen(await saved(srv)), 'Renamed via New task'), 'rename not saved');
  }],
  ['Rename a task inline', async (p, srv) => {
    await nav(p, 'b_general');
    const inp = rowName(p, 'Grants'); await inp.fill('Grants and funding'); await inp.press('Enter');
    expect(findTask(gen(await saved(srv)), 'Grants and funding'), 'rename not saved');
  }],
  ['Set status from the status cell', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="status"][data-tid="${tid}"]`); await p.click('#pop [data-action="set-status"][data-v="working"]');
    expect(await p.locator(`[data-action="status"][data-tid="${tid}"]`).getAttribute('class').then((c) => c.includes('st-working')), 'cell not orange');
    expect(findTask(gen(await saved(srv)), 'Grants').status === 'working', 'status not saved');
  }],
  ['Set priority', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="priority"][data-tid="${tid}"]`); await p.click('#pop [data-v="high"]');
    expect(findTask(gen(await saved(srv)), 'Grants').priority === 'high', 'priority not saved');
  }],
  ['Assign and unassign a person', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="owners"][data-tid="${tid}"]`);
    await p.click('#pop [data-action="toggle-owner"][data-pid="u_riley"]');
    expect(await p.locator('#pop').isVisible(), 'people menu should stay open for multi-assign');
    await p.click('#pop [data-action="toggle-owner"][data-pid="u_casey"]');
    let t = findTask(gen(await saved(srv)), 'Grants');
    expect(t.owners.includes('u_riley') && t.owners.includes('u_casey'), 'owners not saved: ' + t.owners);
    await p.click('#pop [data-action="toggle-owner"][data-pid="u_casey"]');
    t = findTask(gen(await saved(srv)), 'Grants');
    expect(!t.owners.includes('u_casey'), 'unassign not saved');
  }],
  ['Invite a new person straight from an Owner cell', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="owners"][data-tid="${tid}"]`);
    await p.fill('#pop-person', 'Dana QA'); await p.press('#pop-person', 'Enter');
    const s = await saved(srv);
    const dana = s.people.find((x) => x.name === 'Dana QA');
    expect(dana, 'new person not in team');
    expect(findTask(gen(s), 'Grants').owners.includes(dana.id), 'new person not assigned');
  }],
  ['Set and clear a due date', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="date"][data-tid="${tid}"]`); await p.click('#pop [data-action="date-quick"][data-v="1"]');
    let t = findTask(gen(await saved(srv)), 'Grants');
    expect(/^\d{4}-\d\d-\d\d$/.test(t.due), 'due not saved');
    expect((await p.locator(`[data-action="date"][data-tid="${tid}"]`).innerText()).trim().length > 0, 'date not shown');
    await p.click(`[data-action="date"][data-tid="${tid}"]`);
    await p.fill('#pop-date', '2026-10-20'); // fill fires change, which saves and closes the menu
    t = findTask(gen(await saved(srv)), 'Grants');
    expect(t.due === '2026-10-20', 'typed date not saved: ' + t.due);
    await p.click(`[data-action="date"][data-tid="${tid}"]`); await p.click('#pop [data-action="date-quick"][data-v=""]');
    expect(findTask(gen(await saved(srv)), 'Grants').due === '', 'clear date failed');
  }],
  ['Subitems: add, finish all, parent becomes Done', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`.sub-count[data-tid="${tid}"]`);
    await p.fill(`[data-add-sub="${tid}"]`, 'Find funders'); await p.press(`[data-add-sub="${tid}"]`, 'Enter');
    await p.fill(`[data-add-sub="${tid}"]`, 'Write application'); await p.press(`[data-add-sub="${tid}"]`, 'Enter');
    expect(await p.locator('[data-edit="sub-name"]').count() === 2, 'subitems not shown');
    for (let i = 0; i < 2; i++) { await p.locator(`[data-action="status"][data-sid]`).nth(i).click(); await p.click('#pop [data-v="done"]'); }
    const t = findTask(gen(await saved(srv)), 'Grants');
    expect(t.subtasks.length === 2 && t.subtasks.every((x) => x.status === 'done'), 'subitems not saved done');
    expect(t.status === 'done', 'parent did not roll up to Done: ' + t.status);
    await p.click(`.expand[data-tid="${tid}"]`);
    expect(await p.locator('[data-edit="sub-name"]').count() === 0, 'subitems did not collapse');
  }],
  ['Collapse and expand a group', async (p) => {
    await nav(p, 'b_hackathon');
    await p.click('.chev >> nth=0');
    expect(await p.locator('[data-edit="task-name"]').count() === 0, 'group did not collapse');
    await p.click('.chev >> nth=0');
    expect(await p.locator('[data-edit="task-name"]').count() === 26, 'group did not expand');
  }],
  ['Delegate (hand off) a task', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Partnerships');
    await p.click(`.upd-btn[data-tid="${tid}"]`);
    await p.selectOption('#handoff-to', 'u_sam'); await p.fill('#handoff-note', 'You lead this now');
    await p.click('[data-action="handoff"]');
    const t = findTask(gen(await saved(srv)), 'Partnerships');
    expect(t.owners.length === 1 && t.owners[0] === 'u_sam', 'owner not replaced');
    expect(t.updates.some((u) => u.kind === 'handoff' && u.to === 'u_sam' && u.text.includes('You lead this now')), 'hand-off update missing');
    expect(t.activity.some((a) => a.text.startsWith('Delegated')), 'activity log missing hand-off');
    await p.keyboard.press('Escape');
    await p.click('.rail [data-action="nav-mywork"]'); await p.selectOption('#mw-person', 'u_sam');
    expect(await p.locator('.mw-table button.link', { hasText: 'Partnerships' }).count() === 1, 'not in recipient My work');
    await p.click('[data-action="me-menu"]'); await p.click('#pop [data-action="set-me"][data-pid="u_sam"]');
    await p.click('[data-action="notif"]');
    expect(await p.locator('#pop', { hasText: 'handed off “Partnerships” to you' }).count() === 1, 'recipient notification missing');
  }],
  ['Post an update; row shows the count', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`.upd-btn[data-tid="${tid}"]`);
    await p.fill('#upd-text', 'Kickoff call booked'); await p.click('.composer button[type=submit]');
    expect(await p.locator('.post', { hasText: 'Kickoff call booked' }).count() === 1, 'update not shown');
    expect(await p.locator('#upd-text').inputValue() === '', 'composer not cleared');
    await p.keyboard.press('Escape');
    expect((await p.locator(`.upd-btn[data-tid="${tid}"] .n`).innerText()) === '1', 'row count not shown');
    expect(findTask(gen(await saved(srv)), 'Grants').updates.length === 1, 'update not saved');
  }],
  ['Search, person and status filters', async (p) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="tb-search"]'); await p.fill('#tool-search', 'registration'); await p.waitForTimeout(350);
    const n = await p.locator('[data-edit="task-name"]').count();
    expect(n >= 1 && n < 26, 'search did not filter: ' + n);
    await p.fill('#tool-search', ''); await p.waitForTimeout(350);
    await p.click('[data-action="tb-person"]'); await p.click('#pop [data-pid="u_riley"]');
    const r = await p.locator('[data-edit="task-name"]').count();
    expect(r > 0 && r < 26, 'person filter did not filter: ' + r);
    await p.click('[data-action="tb-person"]'); await p.click('#pop [data-action="set-fperson"][data-pid=""]');
    await p.click('[data-action="tb-filter"]'); await p.click('#pop [data-action="fl"][data-k="status"][data-v="working"]');
    await p.keyboard.press('Escape');
    expect(await p.locator('[data-edit="task-name"]').count() === 2, 'status filter should leave 2 working tasks');
    await p.click('[data-action="tb-filter"]'); await p.click('#pop [data-action="clear-filters"]');
    expect(await p.locator('[data-edit="task-name"]').count() === 26, 'clear filters failed');
  }],
  ['Sort and group by', async (p) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="tb-sort"]'); await p.click('#pop [data-action="set-sort"][data-v="name"]');
    await p.keyboard.press('Escape');
    const names = await texts(p, '[data-edit="task-name"]');
    const sorted = names.slice().sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
    expect(JSON.stringify(names) === JSON.stringify(sorted), 'not sorted by name');
    await p.click('[data-action="tb-groupby"]'); await p.click('#pop [data-v="status"]');
    const groups = await p.$$eval('.group-name', (e) => e.map((x) => x.textContent || x.value));
    expect(groups.includes('Working on it') && groups.includes('Done'), 'group by status failed: ' + groups);
  }],
  ['Add a task inside a "group by status" group sets that status', async (p, srv) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="tb-groupby"]'); await p.click('#pop [data-v="status"]');
    await p.fill('[data-vkey="stuck"]', 'QA blocked task').catch(async () => {
      // no Stuck group yet: use Working on it
      await p.fill('[data-vkey="working"]', 'QA blocked task');
    });
    await p.keyboard.press('Enter');
    const t = findTask(hack(await saved(srv)), 'QA blocked task');
    expect(t && (t.status === 'stuck' || t.status === 'working'), 'status not taken from group: ' + (t && t.status));
  }],
  ['Hide and show a column', async (p) => {
    await nav(p, 'b_general');
    await p.click('[data-action="tb-hide"]'); await p.click('#pop [data-action="toggle-hide"][data-v="notes"]');
    expect(!(await p.$$eval('.col-head .t', (e) => e.map((x) => x.textContent))).includes('Notes'), 'Notes still visible');
    await p.click('#pop [data-action="toggle-hide"][data-v="notes"]');
    expect((await p.$$eval('.col-head .t', (e) => e.map((x) => x.textContent))).includes('Notes'), 'Notes not shown again');
  }],
  ['Add a column, delete it, undo', async (p, srv) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="col-add"] >> nth=0'); await p.click('#pop [data-v="priority"]');
    expect(hack(await saved(srv)).columns.some((c) => c.type === 'priority'), 'column not added');
    await p.click('[data-action="col-menu"][data-col="priority"] >> nth=0'); await p.click('#pop [data-action="col-delete"]');
    expect(!hack(await saved(srv)).columns.some((c) => c.type === 'priority'), 'column not deleted');
    await p.click('#toast-undo');
    expect(hack(await saved(srv)).columns.some((c) => c.type === 'priority'), 'undo did not restore column');
  }],
  ['Rename a column', async (p, srv) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="col-menu"][data-col="due"] >> nth=0');
    await p.fill('#pop-col', 'Deadline'); await p.press('#pop-col', 'Enter');
    expect(hack(await saved(srv)).columns.find((c) => c.type === 'due').title === 'Deadline', 'rename not saved');
  }],
  ['Kanban: add view, drag a card to Done', async (p, srv) => {
    await nav(p, 'b_general');
    await p.click('[data-action="view-add"]'); await p.click('#pop [data-v="kanban"]');
    const lanes = await p.$$eval('.lane', (ls) => ls.map((l) => l.getBoundingClientRect().right));
    expect(lanes.length === 5 && lanes.every((r) => r <= window_w + 1), 'Kanban lanes run off screen: ' + lanes.map(Math.round));
    const card = p.locator('.kcard', { hasText: 'Grants' });
    await card.dragTo(p.locator('[data-drop="done"]'));
    expect(findTask(gen(await saved(srv)), 'Grants').status === 'done', 'drag to Done not saved');
    expect(gen(await getState(srv.port)).views.includes('kanban'), 'view not saved');
  }],
  ['Timeline: set dates, bar appears', async (p, srv) => {
    await nav(p, 'b_general');
    await p.click('[data-action="view"][data-v="timeline"]');
    const before = await p.locator('.tl-bar').count();
    await p.locator('.tl-nodate').first().click();
    await p.fill('#pop-start', '2026-10-01'); await p.dispatchEvent('#pop-start', 'change');
    await p.fill('#pop-end', '2026-10-09'); await p.dispatchEvent('#pop-end', 'change');
    await p.keyboard.press('Escape');
    expect(await p.locator('.tl-bar').count() === before + 1, 'bar not drawn');
    const s = await saved(srv);
    expect(gen(s).tasks.some((t) => t.start === '2026-10-01' && t.due === '2026-10-09'), 'dates not saved');
  }],
  ['Cards view opens menus and the task panel', async (p) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="view"][data-v="cards"]');
    await p.locator('.card .pill[data-action="status"]').first().click();
    expect(await p.locator('#pop .label-opt').count() >= 4, 'status menu missing');
    await p.keyboard.press('Escape');
    await p.locator('.card-name').first().click();
    expect(await p.locator('.drawer').count() === 1, 'panel did not open');
  }],
  ['Dashboard numbers match the data and react to filters', async (p, srv) => {
    const s = await getState(srv.port);
    const all = Object.values(s.boards).flatMap((b) => b.tasks);
    await p.click('[data-action="nav-dash"]');
    const nums = await p.$$eval('.big-num', (e) => e.map((x) => Number(x.textContent)));
    const want = [all.length, all.filter((t) => t.status === 'working').length, all.filter((t) => t.status === 'stuck').length, all.filter((t) => t.status === 'done').length];
    expect(JSON.stringify(nums) === JSON.stringify(want), 'tiles ' + nums + ' vs data ' + want);
    await p.click('[data-action="dash-person"]'); await p.click('#pop [data-pid="u_riley"]');
    const n2 = Number(await p.locator('.big-num').first().innerText());
    expect(n2 === all.filter((t) => t.owners.includes('u_riley')).length, 'person filter count wrong: ' + n2);
    await p.click('[data-action="dash-clear"]');
    await p.click('[data-action="dash-boards"]'); await p.click('#pop [data-v="b_general"]');
    await p.keyboard.press('Escape');
    const n3 = Number(await p.locator('.big-num').first().innerText());
    expect(n3 === s.boards.b_hackathon.tasks.length, 'board toggle count wrong: ' + n3);
  }],
  ['My work: tick an item done', async (p, srv) => {
    await p.click('.rail [data-action="nav-mywork"]');
    await p.selectOption('#mw-person', 'u_taylor');
    const before = await p.locator('.mw-table [data-action="quick-done"]').count();
    expect(before > 0, 'Taylor should have open items');
    await p.locator('.mw-table [data-action="quick-done"]').first().click();
    expect(await p.locator('.mw-table [data-action="quick-done"]').count() === before - 1, 'item did not leave the open list');
    await p.click('[data-action="mw-done"]');
    expect(await p.locator('.mw-table .cb.on').count() >= 1, 'Show done did not show done items');
  }],
  ['Team: add, rename, recolor, remove and undo', async (p, srv) => {
    await p.click('.rail [data-action="nav-ws"]');
    await p.fill('#np-name', 'Lee QA'); await p.fill('#np-role', 'Tester'); await p.press('#np-role', 'Enter');
    let s = await saved(srv); const lee = s.people.find((x) => x.name === 'Lee QA');
    expect(lee && lee.role === 'Tester', 'member not added');
    const inp = p.locator(`[data-edit="person-name"][data-pid="${lee.id}"]`); await inp.fill('Lee Q. Tester'); await inp.press('Enter');
    await p.click(`[data-action="person-color"][data-pid="${lee.id}"]`); await p.locator('#pop .swatches button').nth(3).click();
    s = await saved(srv);
    expect(s.people.find((x) => x.id === lee.id).name === 'Lee Q. Tester', 'rename not saved');
    await p.click('[data-action="remove-person"][data-pid="u_taylor"]');
    s = await saved(srv);
    expect(!s.people.some((x) => x.id === 'u_taylor'), 'remove failed');
    expect(!Object.values(s.boards).some((b) => b.tasks.some((t) => t.owners.includes('u_taylor'))), 'removed person still assigned');
    await p.click('#toast-undo');
    s = await saved(srv);
    expect(s.people.some((x) => x.id === 'u_taylor') && hack(s).tasks.some((t) => t.owners.includes('u_taylor')), 'undo did not restore Taylor and their tasks');
  }],
  ['Boards: new, rename, duplicate, delete and undo; new dashboard', async (p, srv) => {
    await p.click('.panel-head ~ .ws-row [data-action="add-menu"]'); await p.click('#pop [data-action="new-board"]');
    await p.fill('#pop-bname', 'QA Board'); await p.press('#pop-bname', 'Enter');
    let s = await saved(srv);
    const qb = Object.values(s.boards).find((b) => b.name === 'QA Board');
    expect(qb, 'new board not saved');
    expect(s.workspace.order.includes(qb.id), 'new board not in workspace list');
    await p.click('.board-name'); await p.click('#pop [data-action="dup-board"]');
    s = await saved(srv);
    expect(Object.values(s.boards).some((b) => b.name === 'QA Board (copy)'), 'duplicate failed');
    await p.click('.board-name'); await p.click('#pop [data-action="delete-board"]');
    s = await saved(srv);
    expect(!Object.values(s.boards).some((b) => b.name === 'QA Board (copy)'), 'delete failed');
    await p.click('#toast-undo');
    s = await saved(srv);
    expect(Object.values(s.boards).some((b) => b.name === 'QA Board (copy)'), 'undo board delete failed');
    await p.click('.ws-row [data-action="add-menu"]'); await p.click('#pop [data-action="new-dash"]');
    s = await saved(srv);
    expect(s.workspace.dashboards.length === 2, 'new dashboard not saved');
  }],
  ['Groups: new, rename, recolor, delete and undo', async (p, srv) => {
    await nav(p, 'b_general');
    await p.click('[data-action="new-group"] >> nth=0');
    await p.keyboard.type('Phase 2'); await p.keyboard.press('Enter');
    let s = await saved(srv);
    const g = gen(s).groups.find((x) => x.name === 'Phase 2');
    expect(g, 'group not created/renamed');
    await p.click(`[data-action="group-menu"][data-gid="${g.id}"]`); await p.locator('#pop .swatches button').nth(4).click();
    await p.click(`[data-action="group-menu"][data-gid="${g.id}"]`); await p.click('#pop [data-action="group-delete"]');
    s = await saved(srv);
    expect(!gen(s).groups.some((x) => x.id === g.id), 'group delete failed');
    await p.click('#toast-undo');
    expect(gen(await saved(srv)).groups.some((x) => x.id === g.id), 'undo group delete failed');
  }],
  ['Tags: create a new tag and toggle it', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="tags"][data-tid="${tid}"]`);
    await p.fill('#pop-tag', 'Funding'); await p.press('#pop-tag', 'Enter');
    let t = findTask(gen(await saved(srv)), 'Grants');
    expect(t.tags.includes('Funding'), 'new tag not applied');
    await p.click('#pop [data-action="toggle-tag"][data-v="Funding"]');
    t = findTask(gen(await saved(srv)), 'Grants');
    expect(!t.tags.includes('Funding'), 'toggle off failed');
  }],
  ['Bulk actions: assign, move, duplicate, delete + undo', async (p, srv) => {
    await nav(p, 'b_hackathon');
    const cbs = p.locator('[data-action="sel"]'); await cbs.nth(0).click(); await cbs.nth(1).click();
    expect(await p.locator('#bulk .count').innerText() === '2', 'bulk bar count wrong');
    await p.click('[data-action="bulk-assign"]'); await p.click('#pop [data-pid="u_sam"]');
    let s = await saved(srv);
    expect(hack(s).tasks.slice(0, 2).every((t) => t.owners.includes('u_sam')), 'bulk assign failed');
    await p.click('[data-action="bulk-move"]'); await p.click('#pop [data-v="g_hack_done"]');
    s = await saved(srv);
    expect(hack(s).tasks.filter((t) => t.groupId === 'g_hack_done').length === 2, 'bulk move failed');
    await p.click('[data-action="bulk-dup"]');
    s = await saved(srv);
    expect(hack(s).tasks.length === 28, 'bulk duplicate failed: ' + hack(s).tasks.length);
    const cb2 = p.locator('[data-action="sel"]'); await cb2.nth(0).click();
    await p.click('[data-action="bulk-delete"]');
    s = await saved(srv);
    expect(hack(s).tasks.length === 27, 'bulk delete failed');
    await p.click('#toast-undo');
    expect(hack(await saved(srv)).tasks.length === 28, 'undo bulk delete failed');
  }],
  ['Favorites and theme', async (p) => {
    await nav(p, 'b_general');
    await p.click('[data-action="fav"]');
    await p.click('[data-action="rail-fav"]');
    expect(await p.locator('.panel .nav-item', { hasText: 'Club general' }).count() === 1, 'favorite not listed');
    const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.top-actions [data-action="theme"]');
    const after = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(before !== after, 'theme did not change');
  }],
  ['Global search finds a task and opens it', async (p) => {
    await p.fill('#gsearch', 'Judging');
    await p.waitForSelector('#pop .opt');
    await p.press('#gsearch', 'Enter');
    expect(await p.locator('#d-title').inputValue() === 'Judging criteria', 'did not open the task');
  }],
  ['Escape closes menus, panel and dialog', async (p) => {
    await nav(p, 'b_general');
    await p.locator('[data-action="status"]').first().click(); await p.keyboard.press('Escape');
    expect(!(await p.locator('#pop').isVisible()), 'menu stayed open');
    await p.locator('.upd-btn').first().click(); await p.keyboard.press('Escape');
    expect(await p.locator('.drawer').count() === 0, 'panel stayed open');
    await p.click('.bh-actions [data-action="invite"]'); await p.keyboard.press('Escape');
    expect(await p.locator('.modal').count() === 0, 'dialog stayed open');
  }],
  ['Changes survive a reload and reach a second teammate', async (p, srv, browser) => {
    await nav(p, 'b_general');
    await p.fill('[data-add-task]', 'Seen by teammate'); await p.keyboard.press('Enter');
    await wait(700);
    await p.reload(); await p.waitForSelector('.shell');
    await nav(p, 'b_general');
    expect(await rowName(p, 'Seen by teammate').count() === 1, 'lost after reload');
    const q = await openPage(browser, srv);
    await nav(q, 'b_general');
    const tid = await tidOf(q, 'Seen by teammate');
    expect(tid, 'second teammate cannot see the task');
    await q.click(`[data-action="status"][data-tid="${tid}"]`); await q.click('#pop [data-v="stuck"]');
    await wait(5500);
    expect(await p.locator(`[data-action="status"][data-tid="${tid}"].st-stuck`).count() === 1, 'first teammate did not receive the change');
    await q.ctx.close();
  }],
  ['Edge: blank names are ignored, odd characters are shown safely', async (p, srv) => {
    await nav(p, 'b_general');
    await p.fill('[data-add-task]', '    '); await p.keyboard.press('Enter');
    expect(gen(await saved(srv)).tasks.length === 6, 'blank task was created');
    const nasty = '<img src=x onerror="window.__xss=1"> & "quotes" — émoji-free ✓';
    await p.fill('[data-add-task]', nasty); await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    expect(!(await p.evaluate(() => window.__xss)), 'HTML in a task name was executed');
    expect(await p.locator('[data-edit="task-name"]').evaluateAll((els, n) => els.some((e) => e.value === n), nasty), 'odd name not shown as typed');
    const inp = rowName(p, 'Grants'); await inp.fill('   '); await inp.press('Enter');
    expect(findTask(gen(await saved(srv)), 'Grants'), 'blank rename wiped the name');
  }],
  ['Edge: group by person, add task there, it is assigned to that person', async (p, srv) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="tb-groupby"]'); await p.click('#pop [data-v="owner"]');
    await p.fill('[data-vkey="u_riley"]', 'For Riley'); await p.keyboard.press('Enter');
    const t = findTask(hack(await saved(srv)), 'For Riley');
    expect(t && t.owners.includes('u_riley'), 'not assigned to Riley: ' + (t && t.owners));
  }],
  ['Edge: timeline end before start is swapped, deleting a subitem updates the parent', async (p, srv) => {
    await nav(p, 'b_general');
    await p.click('[data-action="view"][data-v="timeline"]');
    await p.locator('.tl-nodate').first().click();
    await p.fill('#pop-start', '2026-10-10'); await p.fill('#pop-end', '2026-10-02');
    await p.keyboard.press('Escape');
    const s = await saved(srv);
    expect(gen(s).tasks.some((t) => t.start === '2026-10-02' && t.due === '2026-10-10'), 'dates not put in order');
    await nav(p, 'b_hackathon');
    const tid = await tidOf(p, 'Update materials for closing ceremony');
    await p.click(`.sub-count[data-tid="${tid}"]`);
    // the only unfinished subitem is "slides": delete it and the task should become Done
    const slides = p.locator('[data-edit="sub-name"][value="slides"]');
    const sid = await slides.getAttribute('data-sid');
    await p.click(`[data-action="delete-sub"][data-sid="${sid}"]`);
    const t = findTask(hack(await saved(srv)), 'Update materials for closing ceremony');
    expect(t.subtasks.length === 4, 'subitem not deleted');
    expect(t.status === 'done', 'parent should be Done once every remaining subitem is done, is ' + t.status);
  }],
  ['Edge: removing the person you are viewing as, and a board you are on', async (p, srv) => {
    await p.click('.rail [data-action="nav-ws"]');
    await p.click('[data-action="remove-person"][data-pid="u_jordan"]');
    expect(await p.locator('.me-btn .av').count() === 1, 'no profile after removing yourself');
    await p.click('.nav-item[data-id="b_general"]');
    await p.click('.board-name'); await p.click('#pop [data-action="delete-board"]');
    expect(await p.locator('.board-name').innerText() === 'Community Hackathon', 'did not move to another board');
    expect(p.errors.length === 0, 'errors: ' + p.errors.join(';'));
  }],
  ['Edge: long task names wrap in Cards and Kanban without widening the page', async (p) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="view"][data-v="cards"]');
    const over = await p.$$eval('.card', (cs) => cs.filter((c) => c.scrollWidth > c.clientWidth + 1).length);
    expect(over === 0, over + ' cards overflow');
    await p.click('[data-action="view-add"]'); await p.click('#pop [data-v="kanban"]');
    const lanes = await p.$$eval('.lane', (ls) => ls.map((l) => Math.round(l.getBoundingClientRect().width)));
    expect(lanes.every((w) => w < 320), 'lanes too wide: ' + lanes);
  }],
  ['Status labels: rename, add a custom label, use it, it shows in Kanban and the dashboard', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="status"][data-tid="${tid}"]`); await p.click('#pop [data-action="status-edit"]');
    await p.fill('#pop [data-label-i="0"]', 'In progress');
    await p.click('#pop [data-action="label-add"]');
    const rows = p.locator('#pop [data-label-i]'); await rows.last().fill('Waiting for review');
    await p.click('#pop [data-action="label-color"][data-i="4"]'); await p.click('#pop [data-action="set-label-color"][data-i="4"][data-v="#9d50dd"]');
    await p.click('#pop [data-action="labels-apply"]');
    let s = await saved(srv);
    const st = gen(s).statuses;
    expect(st && st[0].label === 'In progress' && st[4].label === 'Waiting for review' && st[4].color === '#9d50dd', 'labels not saved: ' + JSON.stringify(st));
    await p.click(`[data-action="status"][data-tid="${tid}"]`); await p.click(`#pop [data-action="set-status"][data-v="${st[4].key}"]`);
    expect((await p.locator(`[data-action="status"][data-tid="${tid}"]`).innerText()).trim() === 'Waiting for review', 'cell does not show the custom label');
    expect(findTask(gen(await saved(srv)), 'Grants').status === st[4].key, 'custom status not saved');
    await p.click('[data-action="view-add"]'); await p.click('#pop [data-v="kanban"]');
    const lanes = await p.$$eval('.lane-head', (e) => e.map((x) => x.textContent.replace(/\d+$/, '').trim()));
    expect(lanes.includes('Waiting for review') && lanes.includes('In progress'), 'kanban lanes missing custom labels: ' + lanes);
    await p.click('[data-action="nav-dash"]');
    expect(await p.locator('.legend-item', { hasText: 'Waiting for review' }).count() === 1, 'dashboard legend missing the custom label');
  }],
  ['Marking Done plays the celebration on the label', async (p) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`[data-action="status"][data-tid="${tid}"]`); await p.click('#pop [data-action="set-status"][data-v="done"]');
    expect(await p.locator(`[data-action="status"][data-tid="${tid}"].celebrate`).count() === 1, 'no celebration class on the Done label');
  }],
  ['Drag a task row to another group and back into order', async (p, srv) => {
    await nav(p, 'b_hackathon');
    const tid = await tidOf(p, 'Judging criteria');
    await p.hover(`.tr[data-row="${tid}"]`);
    await p.locator(`.grip[data-drag="${tid}"]`).dragTo(p.locator('[data-add-task="g_hack_done"]'), { targetPosition: { x: 120, y: 20 } });
    let t = findTask(hack(await saved(srv)), 'Judging criteria');
    expect(t.groupId === 'g_hack_done', 'row did not move to the Completed group: ' + t.groupId);
    // Drag it back: drop just above "Train mentors", the last Hackathon row, which sits right above the Completed group.
    const lastId = await tidOf(p, 'Train mentors');
    await p.hover(`.tr[data-row="${tid}"]`);
    await p.locator(`.grip[data-drag="${tid}"]`).dragTo(p.locator(`.tr[data-row="${lastId}"]`), { targetPosition: { x: 200, y: 6 } });
    const s = await saved(srv); const ts = hack(s).tasks; const i = ts.findIndex((x) => x.id === tid);
    expect(ts[i].groupId === 'g_hack' && ts[i + 1] && ts[i + 1].id === lastId, 'row did not land above Train mentors in Hackathon: index ' + i + ', group ' + ts[i].groupId);
  }],
  ['Numbers, Checkbox, Link and Text columns: enter values, footer sums, link opens', async (p, srv) => {
    await nav(p, 'b_general');
    for (const v of ['number', 'checkbox', 'link', 'text']) { await p.click('[data-action="col-add"] >> nth=0'); await p.click(`#pop [data-action="add-col"][data-v="${v}"]`); }
    const num = p.locator('[data-edit="number"]');
    await num.nth(0).fill('1200'); await num.nth(0).press('Enter'); await num.nth(1).fill('300.5'); await num.nth(1).press('Enter');
    await wait(500);
    expect((await p.locator('.num.sum').first().innerText()) === '1,500.5', 'footer sum wrong: ' + (await p.locator('.num.sum').first().innerText()));
    await p.locator('[data-action="check"]').first().click();
    const link = p.locator('[data-edit="link"]').first(); await link.fill('example.com/docs'); await link.press('Enter');
    const txt = p.locator('[data-edit="text"]').first(); await txt.fill('Owner note'); await txt.press('Enter');
    const g = gen(await saved(srv));
    expect(g.tasks[0].number === 1200 && g.tasks[1].number === 300.5, 'numbers not saved');
    expect(g.tasks[0].checked === true, 'checkbox not saved');
    expect(g.tasks[0].link === 'example.com/docs' && (await p.locator('.link-cell a').first().getAttribute('href')) === 'https://example.com/docs', 'link not saved or not linked');
    expect(g.tasks[0].text === 'Owner note', 'text not saved');
  }],
  ['Resize a column by dragging its edge; width is saved', async (p, srv) => {
    await nav(p, 'b_general');
    const h = p.locator('[data-resize="priority"]').first(); const hb = await h.boundingBox();
    await p.mouse.move(hb.x + 4, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + 80, hb.y + hb.height / 2, { steps: 5 }); await p.mouse.up();
    const w = gen(await saved(srv)).columns.find((c) => c.type === 'priority').w;
    expect(w >= 180 && w <= 210, 'width not saved as expected: ' + w);
  }],
  ['Bulk export downloads a CSV of the selected tasks', async (p) => {
    await nav(p, 'b_hackathon');
    const cbs = p.locator('[data-action="sel"]'); await cbs.nth(0).click(); await cbs.nth(1).click();
    const dl = p.waitForEvent('download', { timeout: 4000 });
    await p.click('[data-action="bulk-export"]');
    const d = await dl;
    expect(/\.csv$/.test(d.suggestedFilename()), 'no csv download: ' + d.suggestedFilename());
    const text = require('fs').readFileSync(await d.path(), 'utf8');
    expect(text.split(/\r?\n/).filter(Boolean).length === 3 && text.includes('Task,Group,Owners,Status'), 'csv content wrong');
  }],
  ['Updates: @mention with the picker, like, reply; the mentioned person is notified', async (p, srv) => {
    await nav(p, 'b_general');
    const tid = await tidOf(p, 'Grants');
    await p.click(`.upd-btn[data-tid="${tid}"]`);
    await p.fill('#upd-text', 'Can you review this @Ri'); await wait(200);
    await p.keyboard.press('Enter');
    expect((await p.locator('#upd-text').inputValue()) === 'Can you review this @Riley Brooks ', 'mention not inserted');
    await p.click('.composer button[type=submit]');
    expect(await p.locator('.post .mention', { hasText: '@Riley Brooks' }).count() === 1, 'mention not highlighted');
    await p.click('[data-action="like-update"]');
    await p.click('[data-action="reply-open"]'); await p.fill('#reply-text', 'On it'); await p.press('#reply-text', 'Enter');
    expect(await p.locator('.reply p', { hasText: 'On it' }).count() === 1, 'reply not shown');
    const u = findTask(gen(await saved(srv)), 'Grants').updates[0];
    expect(u.mentions.includes('u_riley') && u.likes.includes('u_jordan') && u.replies.length === 1, 'mention/like/reply not saved: ' + JSON.stringify(u));
    await p.keyboard.press('Escape');
    await p.click('[data-action="me-menu"]'); await p.click('#pop [data-action="set-me"][data-pid="u_riley"]');
    await p.click('[data-action="notif"]');
    expect(await p.locator('#pop', { hasText: 'mentioned you in “Grants”' }).count() === 1, 'mention notification missing');
  }],
  ['Calendar view: tasks on their dates, add a task from a day, month navigation', async (p, srv) => {
    await nav(p, 'b_hackathon');
    await p.click('[data-action="view-add"]'); await p.click('#pop [data-action="add-view"][data-v="calendar"]');
    expect(await p.locator('.cal-day').count() === 42, 'calendar grid missing');
    await p.click('[data-action="cal-next"]'); const h2 = await p.locator('.cal-head h2').innerText();
    await p.click('[data-action="cal-today"]');
    expect((await p.locator('.cal-head h2').innerText()) !== h2, 'month navigation did not change the month');
    const dueCount = hack(await getState(srv.port)).tasks.filter((t) => t.due).length;
    expect(dueCount > 0 && (await p.locator('.cal-ev').count()) >= 1, 'no events drawn');
    const day = p.locator('.cal-day:not(.out) .cal-num').nth(10); const d = await day.getAttribute('data-v');
    await day.click();
    expect(await p.locator('.drawer').count() === 1, 'add from day did not open the task');
    await p.fill('#d-title', 'Calendar task'); await p.keyboard.press('Enter');
    const t = findTask(hack(await saved(srv)), 'Calendar task');
    expect(t && t.due === d, 'task not created on that day: ' + (t && t.due));
    expect(hack(await getState(srv.port)).views.includes('calendar'), 'calendar view not saved');
  }],
  ['Phone width: no sideways page scroll; panel opens and closes', async (p) => {
    await p.setViewportSize({ width: 390, height: 844 }); await p.reload(); await p.waitForSelector('.shell');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    expect(sw <= 390, 'page scrolls sideways: ' + sw);
    await p.click('[data-action="rail-ws"]');
    expect(await p.locator('.panel:not(.collapsed)').count() === 1, 'panel did not open');
    await p.click('.nav-item[data-id="b_general"]');
    expect(await p.locator('.panel:not(.collapsed)').count() === 0, 'panel did not close after choosing a board');
  }],
];

async function runGoals({ port = 4300, only } = {}) {
  const srv = startServer(port); await srv.ready;
  const browser = await chromium.launch();
  const results = [];
  for (const [name, fn] of GOALS) {
    if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
    await reset(port);
    const page = await openPage(browser, srv);
    const r = { goal: name, ok: true, error: '' };
    const t0 = Date.now();
    try { await fn(page, srv, browser); } catch (e) { r.ok = false; r.error = (e instanceof Fail ? '' : 'CRASH: ') + e.message.split('\n')[0]; }
    if (page.errors.length) { r.ok = false; r.error += (r.error ? ' ; ' : '') + page.errors.join(' ; '); }
    r.ms = Date.now() - t0;
    if (!r.ok) { try { await page.screenshot({ path: require('path').join(__dirname, 'failures', name.replace(/[^a-z0-9]+/gi, '_').slice(0, 60) + '.png') }); } catch (e) { /* ignore */ } }
    await page.ctx.close().catch(() => {});
    results.push(r);
    console.log((r.ok ? '✓ ' : '✗ ') + name + (r.ok ? '' : '  →  ' + r.error));
  }
  await browser.close(); srv.stop();
  return results;
}
module.exports = { runGoals, GOALS };
if (require.main === module) {
  require('fs').mkdirSync(require('path').join(__dirname, 'failures'), { recursive: true });
  runGoals({ only: process.argv[2] }).then((r) => { const bad = r.filter((x) => !x.ok); console.log(`\n${r.length - bad.length}/${r.length} goals met`); process.exit(bad.length ? 1 : 0); });
}
