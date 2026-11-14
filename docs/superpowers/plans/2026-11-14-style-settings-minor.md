# 樣式列、設定檔、右鍵、便利貼、更新內容留下的小問題（v1.0.51）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.29～v1.0.34 與 v1.0.50 最後檢查留下的小問題。

**Architecture:** 幾乎都在 `app/index.html`，`main.js` 一處（更新內容的 `notesText`）。每個 Task 一個區塊：
- Task 1：v1.0.50 留下的（圖片、多選、鎖定的圖層）。
- Task 2：樣式列（v1.0.33、v1.0.34：`objChange`、`regenAP`、`refillStamp`、透明度清單、戳記選擇器）。
- Task 3：設定檔（v1.0.32：`parseSettingsFile`、匯入、匯出）。
- Task 4：右鍵（v1.0.31：viewer 的 contextmenu、便利貼視窗、拖曳中的右鍵）。
- Task 5：便利貼（v1.0.30：作者、貼上、人員名單）。
- Task 6：更新內容（v1.0.29：`notesHTML`、`notesText`、看過的版本）。

**Tech Stack:** Electron 45、pdf-lib 1.17.1、pdf.js 4.10.38、playwright-core e2e。

**Spec:** `docs/superpowers/deferred-minors.md` 的 v1.0.50、v1.0.34、v1.0.33、v1.0.32、v1.0.31、v1.0.30、v1.0.29 七段（使用者 2026-11-14：「接著修正再發佈」「先繼續接著做／有問題先略過再回頭修」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/style-settings-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.51；發佈時從 deferred-minors.md 刪掉這七段。
- 修改一律走 `mutate()`；新註解走 `addAnnot()`；可點的東西用 `getAnns()`；不覆蓋原檔。
- 卡住的項目先略過、記在 ledger，整批做完再回頭（使用者 2026-11-14）。

## Review Focus
1. 設定檔：格式對但內容形狀不對的值，不會弄壞工具、快捷鍵或選擇器；匯入失敗時不會只寫了一半。
2. 鎖定的圖層：面板不能刪除或隱藏它上面的物件；合併或刪除圖層時物件不會被移進鎖定的圖層。
3. 樣式列：選的值跟原本一樣時不留復原步驟；舊檔案的透明度顯示正確。
4. 右鍵：拖曳中按右鍵不會出錯；右鍵完成多邊形不會選到新的圖形。
5. 便利貼：沒有作者的便利貼、人員名單讀不到時，作者選單仍然正常。

---

### Task 1: v1.0.50 留下的
- `IMG_JOB`：等檔案選擇或對話框時不擋住；再按一次會提示。
- `usedElsewhere`：沒有自己 /Resources 的 Type3 字型（用畫它那一層的資源）、ExtGState 的軟遮罩群組（/SMask /G）。
- `cloneChain` 全部模式：同一個巢狀表單只複製一次。
- 方向鍵微調還沒寫入：Shift＋框選、Ctrl+]、面板操作之前先寫入。
- 鎖定的圖層：面板選單不能刪除或隱藏它的物件；合併或刪除圖層（保留物件）時不把物件移進鎖定的圖層。

### Task 2: 樣式列（v1.0.33、v1.0.34）
- 透明度清單：v1.0.34 以前的區塊填色（沒有 CA）、不在清單上的值（.6、.45）顯示實際的值。
- `refillStamp`：SMask 的長度與位元深度不對時不重填。
- 戳記：不能換色時說明；選了跟原本一樣的值不留復原步驟。
- 戳記選擇器：標準戳記換過顏色、沒有重選就按〔使用此戳記〕時用選擇器裡的顏色。
- 換樣式後的重新選取：只在原本還選著它時。
- 區域螢光筆第一次換樣式時外框不再變大。
- 折線套用方框樣式不寫 IC。
- 判斷：`regenAP` 沒用到的參數（清掉）；每次選取都讀幾何文件（效能，留著）；測試缺口補轉過的戳記／圖片透明度、淡化戳記的像素。

### Task 3: 設定檔（v1.0.32）
- 每個鍵檢查形狀（lasttool、lastact、bindings、stamp、colors…），形狀不對的略過並說明。
- 匯入：先全部檢查、再寫入；寫到一半失敗時還原。
- 檔案大小上限。
- 匯入前的問題：不關掉其他視窗；說明人員名單與預設作者也會換；「會取代目前的 N 項設定」只算這台電腦已有的。
- 匯出：讀不到設定時不說「已匯出」。
- HANDOFF：字型名稱跨電腦的說明。

### Task 4: 右鍵（v1.0.31）
- HANDOFF 3.9.3 的說法（viewer 的 contextmenu）。
- 便利貼 A 開著時右鍵便利貼 B 再取消：A 照常存好關上；右鍵在 .abar／.xbar 上也一樣。
- 右鍵完成多邊形或填色外框：不選到新的圖形。
- 拖曳選取的物件時按右鍵（或 Esc）：不出錯，回到原位。
- `selectAnnot` 在 `await annAt` 之後再確認頁面還在。
- 測試缺口：折線（2 點）、簽名／圖片／數位簽章工具、右鍵在選取的物件本身與 .xbar 上、隱藏／鎖定圖層的物件。

### Task 5: 便利貼（v1.0.30）
- 沒有作者的便利貼：作者選單不勾預設名稱；選那個名字會寫入；貼上的副本不加預設名稱。
- 滑鼠不在頁面上連按 Ctrl+V：每次往下錯開。
- `DESK.info()` 讀不到時仍建立人員名單。
- 作者按鈕再按一次會關掉清單。
- 讀進來時整理過的人員名單馬上存回。
- 測試缺口：編輯／複製也用到預設作者、便利貼選單的 < >、沒有 /T 或沒有外觀的便利貼。

### Task 6: 更新內容（v1.0.29）
- 段落裡的「##」：當成小標題。
- 巢狀清單：保留層次。
- 存不了「看過的版本」時，不會每次開都跳出來。
- `notesText`：只拿掉 HTML 標籤，不拿掉其他 `<…>` 文字。
- 測試缺口：設定裡「讀不到版本記錄」、用可見度判斷、不用魔術數字。
