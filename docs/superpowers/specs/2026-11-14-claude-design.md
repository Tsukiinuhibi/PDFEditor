# Claude 增益集（v1.0.43）設計

日期：2026-11-14　狀態：使用者說「不用先問我，有問題可以先以你的判斷先做」，以下都是我的決定

## 目的
使用者：想在 Claude 裡用自己的帳號下指令，由 Claude 用 PDF 工作台的功能修改 PDF。已選做法 A：Claude 桌面版擴充功能（`.mcpb`，MCP Bundle）。第三方程式不能用 Claude 訂閱帳號登入，所以不在程式裡放對話面板。

## 做法
- **PDF 工作台**：「設定」多一頁「Claude」。開啟〔允許 Claude 使用 PDF 工作台〕後，主程式在本機（127.0.0.1，只有這台電腦能連）開一個連接埠，並產生一組連線金鑰（存在程式的資料夾，重開程式不變）。〔儲存 Claude 擴充功能…〕會存出 `PDF 工作台.mcpb`，連接埠和金鑰已經寫在裡面。
- **Claude 桌面版**：使用者雙擊 `.mcpb`（或在 Claude 的「設定 → 擴充功能 → 進階設定 → 安裝擴充功能…」選它）安裝。Claude 需要時會用自己內建的 Node 執行擴充功能裡的小程式（MCP 伺服器，透過 stdio 溝通）；它把 Claude 的工具呼叫轉成 HTTP 請求送到 PDF 工作台，PDF 工作台在目前的文件上執行，把結果回給 Claude。
- **安全**：只接受本機連線；每個請求都要帶正確的金鑰（比對時不洩漏時間）；帶有 `Origin` 標頭的請求（網頁發出的）一律拒絕；關掉「允許」就不再接受；〔重新產生金鑰〕讓舊的擴充功能失效。Claude 做的修改都走 `mutate()`，可以復原，不會覆蓋原檔；存檔一定跳出另存新檔視窗，由使用者決定位置。PDF 工作台右下角顯示「Claude：…」說明正在做什麼。
- 不採用：在 PDF 工作台裡放對話面板（只能用 API 金鑰，使用者不要）；讓擴充功能直接讀寫 PDF 檔（會繞過復原、也可能覆蓋原檔）。

## 工具（第一版）
| 工具 | 做什麼 |
|---|---|
| `pdf_status` | 開著的文件（名稱、頁數、有沒有未存的修改）、目前的文件與頁 |
| `pdf_open` | 開啟電腦裡的 PDF（給路徑），在新分頁 |
| `pdf_read_text` | 讀出頁面的文字（可指定頁碼範圍；掃描頁沒有文字時說明） |
| `pdf_find` | 找文字，回傳每個符合的頁碼與前後文 |
| `pdf_replace` | 取代文字（用尋找與取代的同一套，修改原文寫成真正的文字） |
| `pdf_highlight` | 把找到的文字加上螢光筆標示 |
| `pdf_add_text` | 在某頁某個位置加文字方塊（字級、顏色、粗體） |
| `pdf_add_note` | 在某頁某個位置加便利貼 |
| `pdf_rotate_pages` | 旋轉頁面 |
| `pdf_delete_pages` | 刪除頁面（不能刪光） |
| `pdf_insert_blank_page` | 在某頁後面加空白頁 |
| `pdf_go_to_page` | 讓畫面跳到某頁（讓使用者看到） |
| `pdf_undo` | 復原上一步 |
| `pdf_save_as` | 跳出另存新檔視窗 |
位置一律用「頁面左上角為原點、單位 pt（1/72 英寸）」，`pdf_status` 會回傳每頁的大小。

## 介面
- 設定 →「Claude」：開關、狀態（「關閉」「等待 Claude 連線（連接埠 N）」「Claude 已連線」）、〔儲存 Claude 擴充功能…〕、〔重新產生金鑰〕、一步一步的安裝說明（繁體中文）。
- Claude 呼叫工具時：右下角提示「Claude：已取代 3 處」之類；修改後畫面跳到那一頁。

## 不做（這版）
- 多個 PDF 工作台同時開著（只有第一個能開連接埠；第二個顯示「連接埠被占用」）。
- 讀頁面的圖片給 Claude 看、文字辨識掃描頁、簽章、表單填寫、匯出（之後可以加工具）。

## 測試
- `claude.mjs`：設定裡打開 → 主程式開了連接埠；用 Node 執行擴充功能的伺服器（stdio），送 `initialize`、`tools/list`（14 個工具）、`tools/call`：`pdf_status`、`pdf_read_text`、`pdf_find`、`pdf_replace`（之後頁面文字改了、可以復原）、`pdf_add_text`、`pdf_add_note`、`pdf_highlight`、頁面工具、`pdf_undo`。
- 安全：沒有金鑰、金鑰錯、帶 Origin → 拒絕；關掉 → 連不上；重新產生金鑰 → 舊金鑰被拒。
- `.mcpb`：存出的檔案是 zip，裡面有 `manifest.json`（manifest_version 0.3、server.type node、entry_point、mcp_config 用 `${__dirname}` 與 `${user_config.…}`、user_config 的預設值是現在的連接埠與金鑰、14 個工具）與 `server/index.js`。
