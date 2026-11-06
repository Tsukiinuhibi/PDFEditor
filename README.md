# PDF 工作台 (PDFEditor)

Windows 桌面版 PDF 閱讀與編輯工具，會自動檢查並安裝新版本。

## 功能

**編輯**
- 多檔分頁：同一個視窗開多個 PDF，每個檔案一個分頁
- 頁面複製 / 剪下 / 貼上，所有分頁互通（Ctrl+C / Ctrl+X / Ctrl+V，或右鍵選單）
- 加頁（一次加入多頁，可用滑鼠拖曳到想插入的位置）、減頁（預覽縮圖勾選，批量刪除）
- 插入 PDF：從其他 PDF 勾選頁面，插入到指定位置
- 頁面左轉 / 右轉
- 自動偵測頁面中的圖片，上下左右裁切後輸出 PNG / JPG，或全部打包成 ZIP
- 轉存圖片：將選擇的頁面另存成 PNG / JPG / WebP / BMP / TIFF / GIF，可設定解析度、輸出位置與檔名（檔案名稱、頁碼、日期、自動編號）
- 附加檔案到 PDF 內
- 註解：Acrobat 式便利貼、文字方塊、高亮／刪除線／底線文字、區域螢光筆
- 繪圖：箭頭、線條、矩形、橢圓形、多邊形線條、多邊形、雲狀（含預設樣式）；畫筆與橡皮擦
- 戳記：中文標準戳記、含姓名日期的動態戳記、民國日期圓章、自訂戳記
- 輔助工具：網格、輔助線、標尺、貼齊
- 手寫簽名、數位簽章（.p12 / .pfx 憑證，或測試用自簽憑證）
- 修改直接存回原檔（可在狀態列關閉「修改後自動存回」）

**閱讀**
- 縮放：實際大小、符合頁面、符合寬度
- 檢視：單頁、連續、對開、連續雙頁
- 滑鼠滾輪捲動、按住空白鍵拖曳頁面、Ctrl + 滾輪以滑鼠為中心縮放、點一下滾輪自動快速捲動
- 按鍵設定：上一頁／下一頁等可自訂鍵盤或滑鼠按鍵（含側鍵）
- 顯示模式：跟隨作業系統／暗色模式／亮色模式

## 安裝

到 [Releases](https://github.com/Tsukiinuhibi/PDFEditor/releases/latest) 下載 `PDFEditor-Setup-x.y.z.exe` 並執行。

安裝檔目前沒有程式碼簽章，Windows 可能會顯示「Windows 已保護您的電腦」：
點「其他資訊」→「仍要執行」即可。

## 自動更新

程式啟動後會自動到 GitHub Releases 檢查新版本（之後每 4 小時一次），在背景下載完成後會提示「立即重新啟動並更新」；
也可以按工具列右側的「檢查更新」或狀態列的版本號手動檢查。

## 發佈新版本（給維護者）

1. 修改 `package.json` 的 `version`，例如改成 `1.0.1`，並把這次的更新內容寫進 `RELEASE_NOTES.md`（會顯示在程式的更新視窗裡）
2. 提交並推送到 `main`：

   ```bash
   git commit -am "v1.0.1"
   git push origin main
   ```

3. GitHub Actions 偵測到版本號變更，會在 Windows 上建置安裝檔並發佈到 Releases（同時建立 `v1.0.1` 標籤），
   已安裝的程式就會自動更新。也可以在 Actions 頁面手動執行「Build & Release」。

## 開發

```bash
npm install
npm start          # 執行
npm run dist       # 產生安裝檔到 dist/
```

## 授權

MIT。使用 [PDF.js](https://github.com/mozilla/pdf.js)（Apache-2.0）、[pdf-lib](https://github.com/Hopding/pdf-lib)（MIT）、
[node-forge](https://github.com/digitalbazaar/forge)（BSD-3 / GPL-2）、[gifenc](https://github.com/mattdesl/gifenc)（MIT）、[Electron](https://www.electronjs.org/)（MIT）。
