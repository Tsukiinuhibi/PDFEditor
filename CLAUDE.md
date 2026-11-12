# PDF 工作台 — notes for Claude

Read **HANDOFF.md** first: architecture, conventions, release process, tests and open items.

Ground rules (from the user — keep them):
- Talk to the user, write UI text and release notes in **Traditional Chinese (Taiwan)**. Commit messages in English.
- **Never overwrite the user's original PDF.** Edits stay in memory; saving is always "另存新檔" (`saveAsNew`). Do not bring back write-back/auto-save.
- Every change to the document goes through `mutate()`. New annotations go through `addAnnot()` (it applies the current layer). Anything clickable uses `getAnns()` (skips hidden/locked layers), not `getAllAnns()`.
- Toolbar buttons are full colour with a yellow hover, in light and dark mode.
- The code lives on **Forgejo** (forgejo.taiyopen.com/tsukiinuhibi/PDFEditor): push there. GitHub (Tsukiinuhibi/PDFEditor) is a push-mirror copy that GitHub Actions builds from — don't push to it directly.
- Updates are published to Forgejo Releases by the GitHub Actions workflow; GitHub Releases is no longer used (`PUBLISH_GITHUB: 'false'`).

Before releasing:
1. `npm run check` and `npm run test:e2e` — read the printed results, not just the ✓.
2. Bump `version` in package.json, rewrite RELEASE_NOTES.md (Chinese, for users), commit, push to `main` on Forgejo.
3. Watch the run (`gh run list -R Tsukiinuhibi/PDFEditor`), then give the user the Forgejo download link:
   `https://forgejo.taiyopen.com/tsukiinuhibi/PDFEditor/releases/download/vX.Y.Z/PDFEditor-Setup-X.Y.Z.exe`
