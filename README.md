<p align="center">
  <img src="docs/images/linkpouch.png" alt="LinkPouch" width="72">
</p>

# LinkPouch

A local-first Chromium extension for collecting page content, text selections, and images, with full-text search and a directory-backed gallery.

![mainpage](image.png)

## Install

1. Download the [latest release](https://github.com/RunMintOn/LinkPouch/releases/latest) ZIP.
2. Extract it to a permanent folder.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted `LinkPouch` folder.
5. Open `chrome://extensions/shortcuts` if Chrome did not assign the suggested shortcuts.

To update, download and extract the next release, then select **Reload** for LinkPouch on `chrome://extensions`.

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

- `Option+Shift+S`: save selected text, or capture the active page when nothing is selected.
- `Option+Shift+Q`: open or focus the Queue.

Chrome or macOS may reserve a suggested shortcut. Assign another combination from the extension shortcuts page when needed.

## Behavior

Capture extracts content with Defuddle and persists it before opening Quick Capture. The popup previews what was saved. Enter confirms the note; Shift+Enter adds a line; Escape dismisses note editing without removing the captured item. Press Ctrl+E followed by 1–9 to insert a configured preset.

Text selections from the same URL are separate items. Full pages still deduplicate by URL. Search includes saved body text. All saved includes both Unread and Done items, excluding Trash.

The collection opens as a masonry wall of images, text, and notes, grouped by Today, This week, and Earlier. Click a card to read its saved content in the right-hand panel without rearranging the wall; Escape closes the panel. **Source page** opens the original using your configured tab behavior. Cards use saved remote image URLs, not downloaded copies. Older items without saved content still show their titles and notes.

## Collect images

On an X/Twitter post detail page, hover over the image group to reveal **↓ 收图 · N** in its top-right corner, or focus it with the keyboard. Click it to collect the post's images. You can also use **Download images** in Quick Capture or the saved-content view.

The first download opens Gallery and asks you to choose an image directory. Images are written directly to that directory, requesting original-size X images, with no duplicate blobs in extension storage. Later downloads use the saved directory permission when available. Gallery reads the saved files, supports enlargement, and links back to each source post. Image-only collection preserves the source without adding an unread task.

Saving a page's body does **not** automatically download its images. Embedded remote images may still depend on the original website.

Bodies, notes, and image/source metadata stay in `chrome.storage.local`; the authorized directory handle is kept in IndexedDB. The image directory is not a complete backup of the collection. Existing manual JSON export/restore does not include image files. There is no LinkPouch backend.
