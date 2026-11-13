// 便利貼功能增強: the people list (設定 → 人員) whose default name is the author of every new annotation, the author
// picker and the delete button in a note, the right-click menu on a placed note, copy and paste.
import { launch } from './_env.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${name}${detail !== '' ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); if (!ok) { failed++; process.exitCode = 1; } };
const open = async name => {
  const { app } = await launch(name);
  const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
  await win.waitForTimeout(3000);
  return { app, win, A:win.evaluate.bind(win) };
};
let { app, win, A } = await open('sn1.pdf');
const reopen = async name => { await app.close(); ({ app, win, A } = await open(name)); };
const people = () => A(() => window.__pdfapp.people());
const toasts = () => A(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// a point on page i (PDF-space points from the top left of the page) in window coordinates, the page scrolled into view
const P = async (i, x, y) => A(([i, x, y]) => { const r = window.__pdfapp.S.els[i].getBoundingClientRect(), s = window.__pdfapp.S.scale; return [r.left + x * s, r.top + y * s]; }, [i, x, y]);
const see = async (i, x, y) => {
  await A(([i, x, y]) => { const S = window.__pdfapp.S, vw = document.querySelector('#viewer'), vr = vw.getBoundingClientRect(), r = S.els[i].getBoundingClientRect();
    vw.scrollTop += r.top + y * S.scale - (vr.top + vr.height / 2); vw.scrollLeft += r.left + x * S.scale - (vr.left + vr.width / 2); }, [i, x, y]);
  await win.waitForTimeout(400); return P(i, x, y);
};
const onPage = (i, xy) => A(([i, x, y]) => { const e = document.elementFromPoint(x, y), pel = e && e.closest('.page'); return !!pel && +pel.dataset.i === i; }, [i, ...xy]);
const show = async i => { await A(i => window.__pdfapp.scrollToPage(i), i); await win.waitForTimeout(500); };
const anns = (i, sub) => A(async ([i, sub]) => (await window.__pdfapp.getAnns(i)).filter(a => !sub || a.subtype === sub).map(a => ({id:a.id, sub:a.subtype, author:a.author, contents:a.contents, x:a.x, y:a.y, w:a.w, h:a.h})), [i, sub]);
const settingsPeople = async () => { await win.click('#bSettings'); await win.waitForTimeout(400); await win.click('#modal [data-st="people"]'); await win.waitForTimeout(300); };
const closeSettings = async () => { await win.click('#modal .mf button:has-text("關閉")'); await win.waitForTimeout(300); };
const addName = async (v, enter = false) => { await win.fill('#modal #pName', v); if (enter) await win.press('#modal #pName', 'Enter'); else await win.click('#modal [data-padd]'); await win.waitForTimeout(250); };
const pickDefault = async v => { await win.check(`#modal input[name="pdef"][value="${v}"]`); await win.waitForTimeout(250); };
const delName = async v => { await win.click(`#modal [data-pdel="${v}"]`); await win.waitForTimeout(250); };

// ---- part 1: the people list and the default author --------------------------------------------------------------
const user = await A(() => window.desktop.info().then(i => i.user || '使用者'));
check('first run: the computer user is the list and the default', same(await people(), {names:[user], def:user, author:user}), await people());
await settingsPeople();
await addName('王小明'); await addName('李大華', true);
check('人員: 〔新增〕 and Enter add names', same((await people()).names, [user, '王小明', '李大華']), await people());
await addName('  王小明 ');
check('人員: a name already there is not added again, and says so', same((await people()).names, [user, '王小明', '李大華']) && (await toasts()).some(t => t.includes('名單裡已經有「王小明」')), {p:await people(), t:await toasts()});
await addName('   ');
check('人員: a blank name is not added', same((await people()).names, [user, '王小明', '李大華']));
await pickDefault('李大華');
check('人員: the chosen default is the author', (await people()).def === '李大華' && (await people()).author === '李大華', await people());
await delName('李大華');
check('人員: deleting the default makes the first name the default', same(await people(), {names:[user, '王小明'], def:user, author:user}), await people());
await addName('<i>x</i>');
const row = await A(() => { const l = [...document.querySelectorAll('#modal .set-pane label')].find(e => e.textContent.includes('x</i>')); return l ? {text:l.textContent.trim(), tag:!!l.querySelector('i')} : null; });
check('人員: a name with < > is shown as it was typed', !!row && row.text === '<i>x</i>' && !row.tag, row);
await delName('<i>x</i>'); await delName('王小明');
check('人員: the last name cannot be deleted', same((await people()).names, [user]) && await A(() => [...document.querySelectorAll('#modal [data-pdel]')].every(b => b.disabled)), await people());
await addName('王小明'); await addName('李大華'); await pickDefault('王小明');
await closeSettings();
const kept = await people();
await reopen('sn1b.pdf');
check('the list and the default survive a restart', same(await people(), kept) && kept.def === '王小明', {before:kept, after:await people()});
await A(() => localStorage.setItem('pdfeditor.people.v1', '{"names":[]}'));
await reopen('sn1c.pdf');
check('an empty list in storage: made again from the computer user', same(await people(), {names:[user], def:user, author:user}), await people());
await A(() => localStorage.setItem('pdfeditor.people.v1', 'x{'));
await reopen('sn1d.pdf');
check('a broken list in storage: made again from the computer user', same(await people(), {names:[user], def:user, author:user}), await people());
await settingsPeople(); await addName('王小明'); await addName('李大華'); await pickDefault('王小明'); await closeSettings();
// the default name is the author of new annotations: a sticky note and a rectangle
await show(0);
await win.click('[data-tool="note"]'); await win.waitForTimeout(200);
await win.mouse.click(...(await P(0, 120, 150))); await win.waitForTimeout(400);
await win.keyboard.type('請確認這裡的日期'); await win.keyboard.press('Escape'); await win.waitForTimeout(1500);
let notes = await anns(0, 'Text');
check('a new sticky note is written by the default name', notes.length === 1 && notes[0].author === '王小明' && notes[0].contents === '請確認這裡的日期', notes);
await A(() => window.__pdfapp.setTool('rect')); await win.waitForTimeout(200);
const r0 = await P(0, 200, 300), r1 = await P(0, 300, 360);
await win.mouse.move(...r0); await win.mouse.down(); await win.mouse.move(...r1, {steps:6}); await win.mouse.up(); await win.waitForTimeout(1500);
const rects = await anns(0, 'Square');
check('a new rectangle is written by the default name', rects.length === 1 && rects[0].author === '王小明', rects);
await A(() => window.__pdfapp.setTool('select'));


// ---- part 2: the author in the note, the delete button ----------------------------------------------------------------
const tool = async t => { await A(t => window.__pdfapp.setTool(t), t); await win.waitForTimeout(200); };
const openNote = async (i, a) => { await tool('select'); await win.mouse.click(...(await see(i, a.x + a.w / 2, a.y + a.h / 2))); await win.waitForTimeout(700); };
const author = () => A(() => { const b = document.querySelector('.npop .nau'); return b ? {text:b.textContent, tag:!!b.querySelector('i')} : null; });
const auMenu = () => A(() => { const c = document.querySelector('#ctx'); if (c.style.display !== 'block' || !c.querySelector('[data-au]')) return null;
  return {items:[...c.querySelectorAll('[data-au]')].map(b => ({name:b.dataset.au, on:b.classList.contains('on'), text:b.textContent.trim()})), other:!!c.querySelector('#nauOther')}; });
const noteText = async () => (await anns(0, 'Text')).sort((p, q) => p.id.localeCompare(q.id));
let n0 = (await noteText())[0];
await openNote(0, n0);
const ndt = await A(() => { const e = document.querySelector('.npop .ndt'); return e ? {text:e.textContent, full:e.scrollWidth <= e.clientWidth + 1, title:e.title} : null; });
check('the note shows its date and time in full (to the minute; the seconds in its tooltip)', !!ndt && ndt.full && /^\d{4}\/\d{1,2}\/\d{1,2} (上午|下午) \d\d:\d\d$/.test(ndt.text) && /:\d\d:\d\d$/.test(ndt.title), ndt);
await win.click('.npop .nau'); await win.waitForTimeout(300);
let m = await auMenu();
check('the name in the note opens the list: its author first and ticked, the others, 其他名字…', !!m && same(m.items.map(x => x.name), ['王小明', user, '李大華']) && m.items[0].on && !m.items[1].on && m.other, m);
await win.click('#ctx [data-au="李大華"]'); await win.waitForTimeout(200);
check('a name chosen: shown in the note', ((await author()) || {}).text?.startsWith('李大華'), await author());
await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
check('closed: the note is written by the chosen name', (await anns(0, 'Text')).find(x => x.id === n0.id)?.author === '李大華', await anns(0, 'Text'));
await win.keyboard.press('Control+z'); await win.waitForTimeout(1200);
check('one undo: the author it had', (await anns(0, 'Text')).find(x => x.id === n0.id)?.author === '王小明', await anns(0, 'Text'));
n0 = (await noteText())[0];
await openNote(0, n0); await win.click('.npop .nau'); await win.waitForTimeout(300);
await win.fill('#ctx #nauOther', '趙六'); await win.press('#ctx #nauOther', 'Enter'); await win.waitForTimeout(200);
check('其他名字…: the typed name is shown', ((await author()) || {}).text?.startsWith('趙六'), await author());
await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
check('其他名字…: the note is written by it, and it joins the list', (await anns(0, 'Text')).find(x => x.id === n0.id)?.author === '趙六' && (await people()).names.includes('趙六'), {a:await anns(0, 'Text'), p:await people()});
n0 = (await noteText())[0];
await openNote(0, n0); await win.click('.npop .nau'); await win.waitForTimeout(300);
await win.fill('#ctx #nauOther', '<i>x</i>'); await win.press('#ctx #nauOther', 'Enter'); await win.waitForTimeout(200);
check('a name with < > is shown in the note as it was typed', !!(await author()) && (await author()).text.includes('<i>x</i>') && !(await author()).tag, await author());
await win.click('.npop .nau'); await win.waitForTimeout(300);
m = await auMenu();
check('… and in the list', !!m && m.items[0].name === '<i>x</i>' && m.items[0].text.includes('<i>x</i>'), m);
await win.click('#ctx [data-au="王小明"]'); await win.waitForTimeout(200);
await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
// a note whose author is not in the list (another person's): shown first and ticked, not added to the list
await settingsPeople(); await addName('臨時'); await pickDefault('臨時'); await closeSettings();
await tool('note'); await win.mouse.click(...(await P(0, 300, 150))); await win.waitForTimeout(400);
await win.keyboard.type('臨時寫的'); await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
await settingsPeople(); await pickDefault('王小明'); await delName('臨時'); await closeSettings();
const tmpNote = (await anns(0, 'Text')).find(x => x.contents === '臨時寫的');
await openNote(0, tmpNote); await win.click('.npop .nau'); await win.waitForTimeout(300);
m = await auMenu();
check('an author not in the list: first and ticked', !!m && m.items[0].name === '臨時' && m.items[0].on && !(await people()).names.includes('臨時'), {m, p:await people()});
await win.click('#ctx [data-au="臨時"]'); await win.waitForTimeout(200); await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
check('… and it does not join the list', !(await people()).names.includes('臨時') && (await anns(0, 'Text')).find(x => x.id === tmpNote.id)?.author === '臨時', await people());
// a new note: the name chosen before it is written
await tool('note'); await win.mouse.click(...(await P(0, 120, 400))); await win.waitForTimeout(400);
await win.click('.npop .nau'); await win.waitForTimeout(300); await win.click('#ctx [data-au="李大華"]'); await win.waitForTimeout(200);
await win.keyboard.type('新的'); await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
const fresh = (await anns(0, 'Text')).find(x => x.contents === '新的');
check('a new note: written by the name chosen in it', fresh?.author === '李大華', fresh);
// the delete button: a new note is dropped, a saved one deleted (and undone)
const count = async () => (await anns(0, 'Text')).length;
let c0 = await count();
await tool('note'); await win.mouse.click(...(await P(0, 400, 500))); await win.waitForTimeout(400);
await win.keyboard.type('不要了');
const delBtn = await A(() => { const b = document.querySelector('.npop .ndel'); return b ? {title:b.title, svg:!!b.querySelector('svg')} : null; });
check('a new note has the delete button too', !!delBtn && delBtn.title === '刪除這張便利貼' && delBtn.svg, delBtn);
await win.click('.npop .ndel'); await win.waitForTimeout(1200);
check('a new note deleted: nothing is written', (await count()) === c0 && !(await A(() => !!document.querySelector('.npop'))), await count());
await openNote(0, fresh); await win.click('.npop .ndel'); await win.waitForTimeout(1200);
check('a saved note deleted', (await count()) === c0 - 1 && !(await anns(0, 'Text')).some(x => x.id === fresh.id), await count());
await win.keyboard.press('Control+z'); await win.waitForTimeout(1200);
check('… and back with undo', (await count()) === c0, await count());


// ---- part 3: the right-click menu on a placed note, copy and paste -------------------------------------------------------
const at = a => [a.x + a.w / 2, a.y + a.h / 2];
const rclick = async (i, a) => { await win.mouse.click(...(await see(i, ...at(a))), {button:'right'}); await win.waitForTimeout(400); };
const noteMenu = () => A(() => { const c = document.querySelector('#ctx'); if (c.style.display !== 'block') return null;
  return {hd:(c.querySelector('.hd') || {}).textContent || '', items:[...c.querySelectorAll('button[data-c]')].map(b => b.dataset.c + ':' + b.textContent.trim())}; });
const byText = async (i, t) => (await anns(i, 'Text')).find(x => x.contents === t);
const clipText = () => app.evaluate(({clipboard}) => clipboard.readText());
const stClip = () => A(() => document.querySelector('#stClip').textContent);
await tool('select'); await show(0);
let a1 = await byText(0, '請確認這裡的日期'), aT = await byText(0, '臨時寫的'), aF = await byText(0, '新的');
await rclick(0, a1);
let nm = await noteMenu();
check('right-click on a note (選取): its own menu, 編輯 複製 刪除', !!nm && nm.hd === '便利貼 · 王小明' && same(nm.items, ['edit:編輯', 'copy:複製', 'del:刪除']), nm);
await win.keyboard.press('Escape'); await win.waitForTimeout(200);
await tool('pen');
const inks = async () => (await anns(0, 'Ink')).length, ink0 = await inks();
await rclick(0, a1);
nm = await noteMenu();
check('right-click on a note with another tool (畫筆): the same menu, nothing drawn', !!nm && nm.hd === '便利貼 · 王小明' && nm.items.length === 3 && (await inks()) === ink0, nm);
await win.click('#ctx [data-c="edit"]'); await win.waitForTimeout(700);
check('〔編輯〕 opens the note', (await A(() => (document.querySelector('.npop textarea') || {}).value)) === '請確認這裡的日期');
await win.click('.npop textarea', {button:'right'}); await win.waitForTimeout(300);
check('right-click inside an open note: no menu', (await noteMenu()) === null, await noteMenu());
await win.keyboard.press('Escape'); await win.waitForTimeout(800);
// a note open and typed in (its window clear of the other note's icon), another note deleted from its menu
await openNote(0, aF); await win.keyboard.press('End'); await win.keyboard.type('（補充）');
await rclick(0, aT); await win.click('#ctx [data-c="del"]'); await win.waitForTimeout(1500);
check('a note being typed in, another one deleted from its menu: the typing is kept', !!(await byText(0, '新的（補充）')) && !(await byText(0, '臨時寫的')), await anns(0, 'Text'));
aF = await byText(0, '新的（補充）');
a1 = await byText(0, '請確認這裡的日期');
await rclick(0, a1); await win.click('#ctx [data-c="copy"]'); await win.waitForTimeout(500);
check('〔複製〕: the text goes to the clipboard, the status bar says 便利貼', (await clipText()) === '請確認這裡的日期' && (await stClip()).includes('便利貼') && (await A(() => window.__pdfapp.clip())).last === 'note', {clip:await clipText(), st:await stClip()});
// Ctrl+V: on the page under the mouse, at the mouse
await win.mouse.move(...(await see(1, 250, 300))); await win.waitForTimeout(200);
await win.keyboard.press('Control+v'); await win.waitForTimeout(1500);
let pasted = await anns(1, 'Text');
check('Ctrl+V: on the page under the mouse, at the mouse, same text and author', pasted.length === 1 && pasted[0].contents === a1.contents && pasted[0].author === a1.author && Math.abs(at(pasted[0])[0] - 250) < 2 && Math.abs(at(pasted[0])[1] - 300) < 2, pasted);
await win.keyboard.press('Control+z'); await win.waitForTimeout(1200);
check('one undo takes the pasted note away', (await anns(1, 'Text')).length === 0, await anns(1, 'Text'));
const pg = await A(() => ({w:window.__pdfapp.S.pages[0].w, h:window.__pdfapp.S.pages[0].h}));
const cornerXY = await see(0, pg.w - 1, pg.h - 1);
const cornerOn = await onPage(0, cornerXY);
await win.mouse.move(...cornerXY); await win.waitForTimeout(200);
const before = (await anns(0, 'Text')).map(x => x.id);
await win.keyboard.press('Control+v'); await win.waitForTimeout(1500);
const corner = (await anns(0, 'Text')).find(x => !before.includes(x.id));
check('pasted at the corner of a page: in the corner, the whole note on the page', cornerOn && !!corner && corner.x > pg.w - 25 && corner.y > pg.h - 25 && corner.x + corner.w <= pg.w + 0.5 && corner.y + corner.h <= pg.h + 0.5, {cornerOn, corner, pg});
const cur = await A(() => window.__pdfapp.S.current);
const beforeCur = (await anns(cur, 'Text')).map(x => x.id);
await win.mouse.move(20, 20); await win.waitForTimeout(200);
await win.keyboard.press('Control+v'); await win.waitForTimeout(1500);
const off = (await anns(cur, 'Text')).find(x => !beforeCur.includes(x.id));
check('the mouse not on a page: on the current page, a little right of and below the copied note', !!off && Math.abs(off.x - (a1.x + 16)) < 1 && Math.abs(off.y - (a1.y + 16)) < 1, {off, a1});
// Ctrl+V while typing in a note pastes text into it, not another note
const nBefore = (await anns(0, 'Text')).length;
await openNote(0, a1); await win.keyboard.press('End'); await win.keyboard.press('Control+v'); await win.waitForTimeout(300);
const typed = await A(() => document.querySelector('.npop textarea').value);
await win.keyboard.press('Escape'); await win.waitForTimeout(1200);
check('Ctrl+V while typing in a note: the text goes into the note, no new note', typed === a1.contents + a1.contents && (await anns(0, 'Text')).length === nBefore, {typed, n:(await anns(0, 'Text')).length});
// Ctrl+C on a selected note (選取工具, dragged a little)
await rclick(0, aF); await win.click('#ctx [data-c="copy"]'); await win.waitForTimeout(300);
a1 = await byText(0, a1.contents + a1.contents);
const p1 = await P(0, ...at(a1));
await win.mouse.move(...p1); await win.mouse.down(); await win.mouse.move(p1[0] + 12, p1[1] + 8, {steps:4}); await win.mouse.up(); await win.waitForTimeout(1500);
await win.keyboard.press('Control+c'); await win.waitForTimeout(400);
check('Ctrl+C on a selected note copies that note', ((await A(() => window.__pdfapp.clip())).note || {}).contents === a1.contents, await A(() => window.__pdfapp.clip()));
// Ctrl+X on a selected note cuts the note, not the page
const clipNow = () => A(() => window.__pdfapp.clip()), selNow = () => A(() => window.__pdfapp.sel()), pagesNow = () => A(() => window.__pdfapp.S.pages.length);
const pc0 = await pagesNow(), sx = await selNow();
await win.keyboard.press('Control+x'); await win.waitForTimeout(1500);
check('Ctrl+X on a selected note cuts the note (the pages stay)', sx?.sub === 'Text' && sx.id === a1.id && (await pagesNow()) === pc0 && !(await anns(0, 'Text')).some(x => x.id === a1.id) && (await clipNow()).last === 'note' && (await clipNow()).note?.contents === a1.contents, {sx, pages:await pagesNow(), pc0, clip:await clipNow()});
await win.keyboard.press('Control+z'); await win.waitForTimeout(1200);
check('… and back with one undo', (await anns(0, 'Text')).some(x => x.id === a1.id), await anns(0, 'Text'));
// a note still selected while pages are chosen in the thumbnails: Ctrl+C copies the pages
a1 = (await anns(0, 'Text')).find(x => x.id === a1.id);
const p2 = await see(0, ...at(a1));
await tool('select'); await win.mouse.move(...p2); await win.mouse.down(); await win.mouse.move(p2[0] + 10, p2[1] + 6, {steps:4}); await win.mouse.up(); await win.waitForTimeout(1500);
const sx2 = await selNow();
await win.click('.thumb[data-i="0"]'); await win.waitForTimeout(300);
await win.keyboard.press('Control+c'); await win.waitForTimeout(1500);
check('a note selected, then pages chosen in the thumbnails: Ctrl+C copies the pages', sx2?.sub === 'Text' && (await clipNow()).last === 'pages', {sx2, clip:await clipNow()});
aF = (await anns(0, 'Text')).find(x => x.id === aF.id);   // a note with nothing else on top of it
await rclick(0, aF); await win.click('#ctx [data-c="copy"]'); await win.waitForTimeout(300);
const copied = ((await clipNow()).note || {}).contents;
// paste into another open document
await A(() => window.__pdfapp.makeSample()); await win.waitForTimeout(2500);
await win.mouse.move(...(await see(0, 200, 200))); await win.waitForTimeout(200);
await win.keyboard.press('Control+v'); await win.waitForTimeout(1500);
check('Ctrl+V in another open document', copied === aF.contents && (await anns(0, 'Text')).some(x => x.contents === copied), {copied, anns:await anns(0, 'Text')});
// the last thing copied is what Ctrl+V pastes; 〔貼上頁〕 always pastes pages
const nPages = () => A(() => window.__pdfapp.S.pages.length);
let np0 = await nPages();
await win.click('.thumb[data-i="0"]'); await win.waitForTimeout(200);
await win.keyboard.press('Control+c'); await win.waitForTimeout(1500);
await win.keyboard.press('Control+v'); await win.waitForTimeout(2500);
check('pages copied last: Ctrl+V pastes pages', (await nPages()) === np0 + 1 && (await A(() => window.__pdfapp.clip())).last === 'pages', {n:await nPages(), np0});
const t0 = (await anns(0, 'Text')).length; np0 = await nPages();
await rclick(0, (await anns(0, 'Text'))[0]); await win.click('#ctx [data-c="copy"]'); await win.waitForTimeout(300);
await win.click('#bPaste'); await win.waitForTimeout(2500);
check('〔貼上頁〕 pastes pages even when a note was copied last', (await nPages()) === np0 + 1 && (await anns(0, 'Text')).length === t0, {n:await nPages(), np0});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});   // the document has unsaved changes: no asking
