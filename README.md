# LinkPouch

A local-first Chromium extension for quickly capturing pages, returning to them in the browser, and clearing the reading backlog.

## Development

Requirements: Node.js 22+ and Chrome 127+.

```bash
npm install
npm test
npm run build
```

Load the generated `dist/` directory from `chrome://extensions`:

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose this project's `dist/` directory.
4. Open `chrome://extensions/shortcuts` if Chrome did not assign the suggested shortcuts.

Suggested macOS shortcuts:

- `Option+Shift+S`: capture the active page.
- `Option+Shift+Q`: open or focus the Queue.

Chrome or macOS may reserve a suggested shortcut. Assign another combination from the extension shortcuts page when needed.

## Behavior

Capture persists the URL before opening Quick Capture. Enter confirms the note; Shift+Enter adds a line; Escape dismisses note editing without removing the captured item. Press Ctrl+E followed by 1–9 to insert a configured preset.

All data stays in `chrome.storage.local`. Core behavior has no backend or network dependency.
