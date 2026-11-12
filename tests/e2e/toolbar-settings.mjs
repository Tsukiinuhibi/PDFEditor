// The slimmer toolbar: 加頁 ▾ / 旋轉 ▾ / 簽署 ▾ menus (the button keeps the last one used), small 復原 / 重做,
// one 設定 window (外觀, 工具列 with "icons only", 按鍵, 軟體更新), and the mouse wheel scrolls the toolbar sideways.
import { launch, TMP } from './_env.mjs';
const { app } = await launch('tb.pdf');
const win = await app.firstWindow(); win.on('pageerror', e => console.log('PAGEERR', e.message)); win.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 300)); });
await win.waitForTimeout(3000);
const A = win.evaluate.bind(win);
const size = (w, h) => app.evaluate(({BrowserWindow}, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
const ribbon = () => A(() => { const r = document.querySelector('#ribbon'), kids = [...r.children].filter(c => c.offsetParent); return {need:Math.round(kids.reduce((t, c) => t + c.getBoundingClientRect().width, 0)), shown:r.clientWidth, scrolls:r.scrollWidth > r.clientWidth + 1, groups:[...r.querySelectorAll('.grp')].map(g => g.querySelector('.cap').textContent + ' ' + Math.round(g.getBoundingClientRect().width))}; });
const label = m => A(m => document.querySelector(`[data-amenu="${m}"] .sp-lab`).textContent, m);
const rot = () => A(() => window.__pdfapp.S.pages[0].rot);

await size(1900, 900); await win.waitForTimeout(1200);
console.log('toolbar at 1900  ', JSON.stringify(await ribbon()));
await win.screenshot({path:TMP + '/tb_wide.png', clip:{x:0, y:0, width:1900, height:80}});

// 旋轉 ▾: the button does the last one used; the menu offers both
await A(() => { window.__pdfapp.S.thumbSel = new Set([0]); });
console.log('rotate button    ', await label('rotate'), '| page', await rot());
await win.click('[data-amenu="rotate"] .sp-main'); await win.waitForTimeout(2000);
console.log('after click      ', await rot());
await win.click('[data-amenu="rotate"] .sp-arr'); await win.waitForTimeout(300);
console.log('menu             ', JSON.stringify(await A(() => [...document.querySelectorAll('#toolMenu button')].map(b => b.textContent))));
await win.click('#toolMenu button:has-text("向右轉")'); await win.waitForTimeout(2000);
console.log('after 向右轉      ', await rot(), '| button now', await label('rotate'));
// small 復原 / 重做
await win.click('#bUndo'); await win.waitForTimeout(1500); console.log('after 復原        ', await rot());
await win.click('#bRedo'); await win.waitForTimeout(1500); console.log('after 重做        ', await rot());
// 加頁 ▾ and 簽署 ▾ menus
await win.click('[data-amenu="pageAdd"] .sp-arr'); await win.waitForTimeout(300);
console.log('加頁 menu         ', JSON.stringify(await A(() => [...document.querySelectorAll('#toolMenu button')].map(b => b.textContent))));
await win.keyboard.press('Escape'); await win.mouse.click(900, 600); await win.waitForTimeout(300);
await win.click('[data-amenu="sign"] .sp-arr'); await win.waitForTimeout(300);
console.log('簽署 menu         ', JSON.stringify(await A(() => [...document.querySelectorAll('#toolMenu button')].map(b => b.textContent))));
await win.click('#toolMenu button:has-text("數位簽章")'); await win.waitForTimeout(500);
console.log('tool             ', await A(() => window.__pdfapp.S.tool), '| button', await label('sign'), '| lit', await A(() => document.querySelector('[data-amenu="sign"]').classList.contains('on')));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// 設定
await win.click('#bSettings'); await win.waitForTimeout(500);
console.log('settings tabs    ', JSON.stringify(await A(() => [...document.querySelectorAll('.set-tabs button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')))));
await win.click('.set-opt:has(input[value="dark"])'); await win.waitForTimeout(400);
await win.click('.set-opt:has(input[value="sepia"])'); await win.waitForTimeout(400);
console.log('theme / page     ', await A(() => document.documentElement.dataset.theme + ' / ' + document.documentElement.dataset.page));
await win.screenshot({path:TMP + '/set_look.png'});
await win.click('.set-tabs button:has-text("工具列")'); await win.waitForTimeout(300);
await win.click('.set-opt:has(input[name="iconsOnly"])'); await win.waitForTimeout(500);
console.log('icons only       ', await A(() => document.querySelector('#ribbon').classList.contains('icons-only')), JSON.stringify((await ribbon()).need));
await win.screenshot({path:TMP + '/set_bar.png'});
await win.click('.set-tabs button:has-text("按鍵")'); await win.waitForTimeout(300);
await win.click('.kcell[data-a="nextTab"][data-k="0"]'); await win.waitForTimeout(200); await win.keyboard.press('F8'); await win.waitForTimeout(300);
console.log('key saved        ', await A(() => JSON.stringify(JSON.parse(localStorage.getItem('pdfeditor.bindings.v1')).nextTab)), '|', await A(() => document.querySelector('#kbMsg').textContent));
await win.click('.set-tabs button:has-text("軟體更新")'); await win.waitForTimeout(300);
console.log('update tab       ', await A(() => document.querySelector('.set-pane').innerText.replace(/\s+/g, ' ').slice(0, 120)));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);
console.log('closed           ', await A(() => !document.querySelector('#mask').classList.contains('show')));
// the version in the status bar opens 設定 → 軟體更新
await win.click('#stVer'); await win.waitForTimeout(400);
console.log('from status bar  ', await A(() => (document.querySelector('.set-tabs button.on') || {}).textContent));
await win.keyboard.press('Escape'); await win.waitForTimeout(300);

// narrow window: the wheel scrolls the toolbar sideways
await A(() => { localStorage.setItem('pdfeditor.ribbon.v1', '{}'); }); await win.click('#bSettings'); await win.click('.set-tabs button:has-text("工具列")'); await win.click('.set-opt:has(input[name="iconsOnly"])'); await win.keyboard.press('Escape');
await size(1366, 768); await win.waitForTimeout(1200);
console.log('toolbar at 1366  ', JSON.stringify(await ribbon()));
await size(1100, 760); await win.waitForTimeout(1200);
console.log('toolbar at 1100  ', JSON.stringify(await ribbon()));
const rb = await win.locator('#ribbon').boundingBox();
await win.mouse.move(rb.x + 600, rb.y + 30);
const before = await A(() => document.querySelector('#ribbon').scrollLeft);
await win.mouse.wheel(0, 240); await win.waitForTimeout(300);
console.log('wheel scroll     ', before, '->', await A(() => document.querySelector('#ribbon').scrollLeft));
await A(() => window.__pdfapp.setTheme('system')); await A(() => window.__pdfapp.setPageColor('original'));
await app.evaluate(({app}) => app.exit(0)).catch(() => {});
