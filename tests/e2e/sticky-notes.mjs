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
const openNote = async (i, a) => { await tool('select'); await win.mouse.click(...(await P(i, a.x + a.w / 2, a.y + a.h / 2))); await win.waitForTimeout(700); };
const author = () => A(() => { const b = document.querySelector('.npop .nau'); return b ? {text:b.textContent, tag:!!b.querySelector('i')} : null; });
const auMenu = () => A(() => { const c = document.querySelector('#ctx'); if (c.style.display !== 'block' || !c.querySelector('[data-au]')) return null;
  return {items:[...c.querySelectorAll('[data-au]')].map(b => ({name:b.dataset.au, on:b.classList.contains('on'), text:b.textContent.trim()})), other:!!c.querySelector('#nauOther')}; });
const noteText = async () => (await anns(0, 'Text')).sort((p, q) => p.id.localeCompare(q.id));
let n0 = (await noteText())[0];
await openNote(0, n0);
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

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
await app.evaluate(({app}) => app.exit(0)).catch(() => {});   // the document has unsaved changes: no asking
