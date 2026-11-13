# 匯出／匯入設定檔（v1.0.32）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定視窗的「設定檔」頁：〔匯出設定…〕把程式設定存成一個 `.json`，〔匯入設定…〕讀回來後重新載入程式。

**Architecture:** 全部在 `app/index.html`。設定都在 localStorage 的 `pdfeditor.` 鍵：匯出原樣收進 JSON，匯入檢查後原樣寫回，再 `location.reload()`（原本的「尚未儲存」保護照常）。另存走 `DESK.saveAs`（瀏覽器版用下載），開檔用隱藏的 `<input type="file">`。

**Tech Stack:** Electron 45、`app/index.html`（`openSettings`、`openModal`、`toast`）、playwright-core e2e（另存對話框在主程序由測試接管，同 `save-as-only.mjs`）。

**Spec:** `docs/superpowers/specs/2026-11-13-settings-file-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/settingsfile`，給使用者看預覽後才發佈。
- 檔案格式：`{"app":"PDF 工作台","kind":"settings","version":"<程式版本>","exported":"<ISO 時間>","settings":{"pdfeditor.…":"<原本的文字>"}}`。
- 不匯出、不匯入：`pdfeditor.fontcat.v2`、`pdfeditor.seenversion.v1`。
- 文案：分頁「設定檔」；〔匯出設定…〕〔匯入設定…〕；預設檔名「PDF工作台-設定-YYYYMMDD.json」；完成提示「已匯出設定：<檔名>」；錯誤「這不是 PDF 工作台的設定檔」；確認視窗標題「匯入設定」，按鈕〔取消〕〔匯入並重新載入〕。

## Review Focus

1. 另存對話框按取消：不顯示「已匯出」，沒有寫出檔案。→ Task 1 測試。
2. 設定檔裡有不是本程式的鍵（如 `evil`）或不是文字的值：忽略，只匯入可用的。→ Task 2 測試。
3. 設定檔裡有字型快取或版本記錄的鍵：不匯入（版本記錄不被蓋掉）。→ Task 2 測試。
4. 檔案裡一項可用的設定都沒有（`"settings":{}`）：當作不是設定檔。→ Task 2 測試。
5. 匯入後重新載入：人員名單、外觀在新載入的畫面就生效，不只是存進去。→ Task 2 測試。

---

### Task 1: 「設定檔」頁與匯出

**Files:**
- Modify: `app/index.html`（`openSettings` 的分頁與 `panes`、點擊處理；新增 `SETTINGS_SKIP`、`settingsSnapshot`、`exportSettings`；`window.__pdfapp` 加 `settingsSnapshot`）
- Test: `tests/e2e/settings-file.mjs`（新檔，第 1 部分；`check()` 寫法同 `sticky-notes.mjs`）

**Interfaces:**
- Produces:
  - `SETTINGS_SKIP: Set<string>`（上面兩個鍵）。
  - `settingsSnapshot(): {app, kind, version, exported, settings}`：`version` 用 `UPD.info.version`（沒有時空字串）；`settings` 是所有 `pdfeditor.` 開頭、不在 `SETTINGS_SKIP` 的 localStorage 項目。
  - `async exportSettings(): Promise<string | null>`：檔名「PDF工作台-設定-YYYYMMDD.json」（本地日期）；桌面版 `DESK.saveAs(name, bytes)`，取消回 `null`、不提示；成功提示「已匯出設定：<檔名>」並回傳路徑。瀏覽器版用 `<a download>`。
  - 設定分頁 `['file', '設定檔']`（「人員」之後）：一句說明、`<button class="btn" data-sf="export">匯出設定…</button>`、`<button class="btn" data-sf="import">匯入設定…</button>`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 測試先在 localStorage 放：theme='dark'、people.v1={names:['root','王小明'],def:'王小明'}、fontcat.v2='{"x":1}'（seenversion.v1 啟動時就有）
// 主程序接管 dialog.showSaveDialog → 回傳 TMP/settings.json，記下 defaultPath
// 設定 → 設定檔 →〔匯出設定…〕
// check: 檔案 app === 'PDF 工作台' && kind === 'settings' && version === PKG.version
// check: settings['pdfeditor.theme'] === 'dark'、people.v1 原文相同；沒有 fontcat.v2、seenversion.v1
// check: defaultPath 的檔名符合 /^PDF工作台-設定-\d{8}\.json$/；提示含「已匯出設定」
// 接管成取消 → 再按匯出：沒有新的「已匯出」提示、檔案沒有被改寫（Review Focus 1）
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/settings-file.mjs`，確認失敗（找不到「設定檔」分頁）。**
- [ ] **Step 3: 實作分頁、`settingsSnapshot`、`exportSettings`。**
- [ ] **Step 4: 測試通過。**
- [ ] **Step 5: Commit**（`Settings file: export`）

### Task 2: 匯入、文件

**Files:**
- Modify: `app/index.html`（新增 `parseSettingsFile`、`importSettings`；〔匯入設定…〕接上隱藏的檔案選擇）、`HANDOFF.md`（設定檔一節、測試表）
- Test: `tests/e2e/settings-file.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 `SETTINGS_SKIP`、分頁的 `[data-sf="import"]`。
- Produces:
  - `parseSettingsFile(text: string): {ok:true, version, exported, entries:[key, value][]} | {ok:false}`：不是 JSON、`app`／`kind` 不對、`settings` 不是物件、或沒有可用項目 → `{ok:false}`；可用項目＝`pdfeditor.` 開頭、不在 `SETTINGS_SKIP`、值是字串。
  - `async importSettings(file: File): Promise<boolean>`：`{ok:false}` → 錯誤提示「這不是 PDF 工作台的設定檔」、回 `false`；否則確認視窗「匯入設定」（檔名、匯出時的版本與日期、會取代 N 項、「匯入後程式會重新載入；有還沒另存的修改會先提醒你」），〔取消〕回 `false`；〔匯入並重新載入〕寫入每一項後 `location.reload()`。
  - `__pdfapp.parseSettingsFile`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 匯出後把 theme 改 'light'、people 改回 {names:['root'],def:'root'}、新增 pdfeditor.extra.test='keep'
// 檔案選擇器選 Task 1 的檔案 → 確認視窗標題「匯入設定」、內容有檔名與 N 項 → 按〔匯入並重新載入〕→ 等重新載入
// check: theme === 'dark'、people() 的 def === '王小明' 且 names 含 '王小明'（新載入的畫面上就生效，Review Focus 5）
// check: pdfeditor.extra.test 仍是 'keep'；seenversion.v1 沒有被改
// 一般 JSON {"a":1}、壞檔 'x{'、{"app":"PDF 工作台","kind":"settings","settings":{}} → 錯誤提示、沒有確認視窗、theme 不變（Review Focus 4）
// {"app":"PDF 工作台","kind":"settings","settings":{"pdfeditor.theme":"light","evil":"x","pdfeditor.people.v1":5,"pdfeditor.seenversion.v1":"0.0.1","pdfeditor.fontcat.v2":"{}"}}
//   → parseSettingsFile 的 entries 只有 theme（Review Focus 2、3）
// 確認視窗按〔取消〕→ theme 不變、window.__marker 還在（沒有重新載入）
```

- [ ] **Step 2: 跑測試，確認失敗（按〔匯入設定…〕沒有檔案選擇器）。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Settings file: import`）
