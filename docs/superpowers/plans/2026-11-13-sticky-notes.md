# 便利貼功能增強（v1.0.30）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定裡的人員名單（預設名字＝所有新註解的作者）、便利貼標題可換作者、明顯的刪除鈕、右鍵便利貼〔編輯〕〔複製〕〔刪除〕、複製後 Ctrl+V 貼在滑鼠位置。

**Architecture:** 全部在 `app/index.html`。人員名單存在 localStorage，`AUTHOR` 改由名單的預設名字決定。便利貼視窗與右鍵選單共用現有的 `#ctx` 選單元件（外觀、暗色模式現成）。便利貼的剪貼簿與頁面剪貼簿並存，Ctrl+V 貼「最後複製的東西」。

**Tech Stack:** Electron 45、`app/index.html` 單檔渲染端（pdf-lib、pdf.js、`mutate()`、`openModal`）、playwright-core e2e。

**Spec:** `docs/superpowers/specs/2026-11-13-sticky-notes-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/notes`，給使用者看預覽後才發佈。
- 文件的每個變更走 `mutate()`；新註解走 `addAnnot()`；可點的東西用 `getAnns()`（略過隱藏／鎖定圖層）。
- localStorage `pdfeditor.people.v1`：`{names:[…], def:'…'}`。
- 文案：設定分頁「人員」；標題「人員名單」；說明「新加的便利貼和其他註解，作者會用「預設」的名字。」；〔新增〕；重複「名單裡已經有「X」」；作者選單最後一列「其他名字…」；刪除鈕提示「刪除這張便利貼」；右鍵選單標題「便利貼 · 作者」，項目〔編輯〕〔複製〕〔刪除〕；複製提示「已複製便利貼，按 Ctrl+V 貼到滑鼠所在的位置」；貼上的復原標籤「已貼上便利貼」；狀態列「📋 剪貼簿：便利貼「…」」。
- 便利貼視窗在暗色模式也維持黃色；選單跟著主題（用 `.ctx`）。

## Review Focus

1. 打開的便利貼正在打字（還沒存）時，右鍵另一張便利貼按〔編輯〕〔複製〕〔刪除〕：打的字要存下來。→ Task 3 測試。
2. 在便利貼的文字框裡按 Ctrl+V：貼的是文字，不會多一張便利貼。→ Task 3 測試。
3. 滑鼠在頁面右下角貼上：整個圖示留在頁面裡。→ Task 3 測試。
4. 名字含 `<`、`>`、`&`：設定、標題、選單都照原文字顯示，不變成 HTML。→ Task 1、Task 2 測試。
5. 名單資料壞掉或是空的（`{"names":[]}`、不是 JSON）：重新用電腦帳號建立，不出錯。→ Task 1 測試。

---

### Task 1: 人員名單與預設作者

**Files:**
- Modify: `app/index.html`（`let AUTHOR = '使用者';` 附近新增名單；`openSettings` 加分頁；啟動時 `DESK.info()` 的 `if (info.user) AUTHOR = info.user` 改為 `seedPeople(info.user)`，沒有 `DESK` 時 `seedPeople('')`；`window.__pdfapp` 加 `people`）
- Test: `tests/e2e/sticky-notes.mjs`（新檔，第 1 部分；`check()` 寫法同 `whats-new.mjs`）

**Interfaces:**
- Produces:
  - `PEOPLE: {names:string[], def:string} | null`：啟動時從 localStorage 讀；格式不對（不是 JSON、`names` 空、有空字串）就是 `null`。`def` 不在 `names` 時用 `names[0]`。
  - `seedPeople(user: string): void`：`PEOPLE` 是 `null` 時建立 `{names:[user || '使用者'], def:同}` 並存檔；最後 `AUTHOR = PEOPLE.def`。
  - `addPerson(name: string): {ok:boolean, msg?:string}`：去頭尾空白；空白 → `{ok:false}`；重複 → `{ok:false, msg:'名單裡已經有「X」'}`；成功存檔。
  - `removePerson(name: string): boolean`：只剩一個時 `false`；刪掉預設時 `def = names[0]`；同步 `AUTHOR`、存檔。
  - `setDefaultPerson(name: string): void`：同步 `AUTHOR`、存檔。
  - 設定分頁 `['people', '人員']`（放在「按鍵」後）：每列 `<label><input type="radio" name="pdef" value="名字">名字</label><button data-pdel="名字">`（只剩一個時 `disabled`），下方 `<input id="pName">` ＋ `<button data-padd>新增</button>`（Enter 也新增）；每次變更後重畫分頁；名字一律 `esc()`。
  - `__pdfapp.people(): {names, def, author}`。

- [ ] **Step 1: 寫失敗的測試**

```js
const user = await A(() => window.desktop.info().then(i => i.user || '使用者'));
check('first run: the computer user is the list and the default', JSON.stringify(await A(() => window.__pdfapp.people())) === JSON.stringify({names:[user], def:user, author:user}));
// 設定 → 人員：〔新增〕王小明、李大華（Enter）；'  王小明 ' → 名單不變、提示含「名單裡已經有「王小明」」；'   ' → 不變
// 選 李大華 為預設 → people().def === '李大華' && author === '李大華'
// 刪 李大華（預設）→ def === names[0] === user
// 新增 '<i>x</i>' → 該列文字 === '<i>x</i>'，列裡沒有 <i> 元素（Review Focus 4）
// 刪到剩一個 → 那列的 [data-pdel] disabled
// 重開程式（同一個使用者資料夾）→ people() 與關閉前相同
// localStorage 設成 '{"names":[]}' 重開 → names === [user]；設成 'x{' 重開 → 同（Review Focus 5）
// 預設改成 王小明：便利貼工具點頁面、輸入、Esc → getAnns(0) 的 Text author === '王小明'；setTool('rect') 拖一個矩形 → Square author === '王小明'
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/sticky-notes.mjs`，確認失敗（`people is not a function`）。**
- [ ] **Step 3: 實作上列名單函式、設定分頁、啟動時建立名單。**
- [ ] **Step 4: 測試通過。**
- [ ] **Step 5: Commit**（`Sticky notes: the people list and the default author`）

### Task 2: 便利貼視窗：換作者、刪除鈕

**Files:**
- Modify: `app/index.html`（`openNotePopup`、`closeNote`、`createNote`、`updateNote`、關閉便利貼的 `document` pointerdown（點在 `#ctx` 裡不關）、`.nhd` 的 CSS、`ICONS` 加 `trash`）
- Test: `tests/e2e/sticky-notes.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 `PEOPLE`、`addPerson`。
- Produces:
  - `createNote(i, icon, text, box, {author = AUTHOR, label = '已新增註解'} = {}): Promise`
  - `updateNote(i, id, text, box, author?: string): Promise`：有 `author` 時一起設 `/T`（同一個 `mutate`，一次復原）。
  - `NP.author`（開啟時＝便利貼的作者或 `AUTHOR`）、`NP.origAuthor`；`closeNote` 在文字、位置或作者有變時存。
  - 標題 `<button class="nau" title="換作者">名字 ▾</button>`：點了在 `#ctx` 開作者選單：目前作者在最上面打勾（不在名單裡也列出），接著名單其他名字（`[data-au]`），最後一列「其他名字…」＝ `<input id="nauOther">`（Enter 確定、Esc 只關選單）。選了 → `NP.author` 改、標題更新；輸入的新名字 `addPerson()`。
  - `.ndel`：每張便利貼都有（垃圾桶圖示 `icon('trash')`，滑過變紅，`title="刪除這張便利貼"`）；新便利貼按了 `closeNote(false)`；存好的照舊刪除。

- [ ] **Step 1: 寫失敗的測試**

```js
// 存好的便利貼：選取工具點圖示打開 → 點 .npop .nau → #ctx 顯示，第一列打勾是目前作者，有「其他名字…」
// 點 李大華 → .nau 文字以「李大華」開頭；Esc → getAnns(0) 該便利貼 author === '李大華'；Ctrl+Z → author 回到原本
// 其他名字…：輸入 '趙六' Enter → 關閉後 author === '趙六'，people().names 含 '趙六'
// 名單外的作者：預設改成 '臨時' 建一張便利貼、再從名單刪掉 '臨時' → 打開它 → 選單第一列 '臨時' 打勾；關閉後 names 不含 '臨時'
// 名字 '<i>x</i>' 當作者 → .nau 的 textContent 含 '<i>x</i>'（Review Focus 4）
// 新便利貼：選了作者 '李大華' 再輸入、Esc → 新的 Text author === '李大華'
// 新便利貼按 .ndel → Text 數量不變；存好的便利貼按 .ndel → 少一張，Ctrl+Z 回來
```

- [ ] **Step 2: 跑測試，確認失敗（找不到 `.npop .nau` 的選單／新便利貼沒有 `.ndel`）。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過（第 1、2 部分）。**
- [ ] **Step 5: Commit**（`Sticky notes: change the author in the note, a clear delete button`）

### Task 3: 右鍵選單、複製與貼上、文件

**Files:**
- Modify: `app/index.html`（`pagesEl` 的 contextmenu、`showPageMenu` 旁新增 `showNoteMenu`、`PAGE_CLIP` 旁新增便利貼剪貼簿、`updateClipUI`、keydown 的 Ctrl+C／Ctrl+V、記下滑鼠位置、`__pdfapp.clip`）、`HANDOFF.md`（便利貼一節、localStorage 鍵、測試表）
- Test: `tests/e2e/sticky-notes.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 2 的 `createNote(..., {author, label})`；現有 `openNoteById`、`closeNote`、`closeNoteDom`、`deleteAnnot`、`getAnns`、`pagePointXY`、`noteDefaults`。
- Produces:
  - contextmenu：點在 `.npop` 裡 → 不跳選單；否則先找滑鼠下的便利貼（`getAnns(i)` 的 `Text`，圖示區至少 20×20 pt），找到 → `showNoteMenu(e, i, a)`，任何工具都一樣；找不到 → 原本的行為（文字方塊工具插入、其他跳頁面選單）。
  - `showNoteMenu(e, i, a)`：`#ctx` 標題「便利貼 · 作者」，`[data-c="edit"|"copy"|"del"]`。動作前若有別張便利貼開著就 `await closeNote(true)`；刪的是開著的那張就 `closeNoteDom()`。
  - `NOTE_CLIP: {contents, author, i, x, y, pw, ph} | null`、`LAST_CLIP: 'pages' | 'note' | null`（`copySelected` 設 `'pages'`）。
  - `copyNote(i, a): void`：記下、`navigator.clipboard.writeText(contents)`、`updateClipUI()`、提示。選取工具選到便利貼（`AS.a.subtype === 'Text'`）時 Ctrl+C 也呼叫它。
  - `pasteNote(): Promise`：滑鼠（`window` pointermove 記下的位置）在某頁上 → 圖示中心在滑鼠點（夾在頁面內）；否則目前頁、原位置 +16 pt（夾在頁面內）。視窗位置 `noteDefaults` 、大小用 `pw/ph`。`createNote(..., {author:clip.author, label:'已貼上便利貼'})`。
  - Ctrl+V：`LAST_CLIP === 'note'` → `pasteNote()`，否則 `pasteClip()`；〔貼上頁〕只貼頁面；`showPageMenu` 的貼上項目在 `LAST_CLIP === 'note'` 時不顯示 `Ctrl+V` 提示。
  - `updateClipUI()`：`LAST_CLIP === 'note'` 時 `#stClip` 顯示「📋 剪貼簿：便利貼「前 12 字…」」。
  - `__pdfapp.clip(): {last, note:{contents, author} | null}`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 選取工具右鍵便利貼圖示 → #ctx 標題「便利貼 · 王小明」，有 編輯／複製／刪除
// setTool('pen') 右鍵同一個圖示 → 一樣的選單，而且沒有新增 Ink
// 〔編輯〕→ .npop textarea 的值＝便利貼文字；右鍵點在 .npop 裡 → #ctx 不顯示
// 便利貼 A 打開、多打幾個字（未存）、右鍵便利貼 B →〔刪除〕→ A 的文字已存、B 不見（Review Focus 1）
// 〔複製〕→ app.evaluate(({clipboard}) => clipboard.readText()) === 便利貼文字；#stClip 含「便利貼」
// 滑鼠移到第 2 頁某點 → Ctrl+V → 第 2 頁多一張，文字與作者相同，圖示中心離滑鼠點 < 2 pt；Ctrl+Z 一次就不見
// 滑鼠在第 1 頁右下角 → Ctrl+V → 圖示整個在頁面內（Review Focus 3）
// 滑鼠移到工具列 → Ctrl+V → 目前頁多一張，位置＝原位置 +16 pt
// 打開一張便利貼，在文字框按 Ctrl+V → 文字框多了剪貼簿的文字，Text 數量不變（Review Focus 2）
// 選取工具拖一下便利貼（選到它）→ Ctrl+C → clip().note.contents ＝ 它的文字
// makeSample() 開第二個分頁 → 滑鼠在它的第 1 頁 → Ctrl+V → 那份文件多一張便利貼
// 複製頁面（縮圖 Ctrl+C）→ Ctrl+V → 頁數 +1；再複製便利貼後按〔貼上頁〕→ 頁數 +1、便利貼數量不變
```

- [ ] **Step 2: 跑測試，確認失敗（右鍵出現的是頁面選單）。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`（便利貼一節：人員名單、換作者、右鍵、複製貼上；localStorage `people.v1`；測試表 `sticky-notes`）。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Sticky notes: right-click menu, copy and paste`）
