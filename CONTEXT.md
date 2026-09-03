# LinkPouch

LinkPouch is a browser-native queue for temporarily deferring pages and resolving that backlog without creating a curated library.

## Language

**Reading Queue**:
The operational backlog of pages that a user still intends to read.
_Avoid_: Bookmark library, knowledge base, collection

**Reading Item**:
One captured URL together with its title, source domain, note, and lifecycle timestamps.
_Avoid_: Bookmark, document

**Capture**:
The act of placing the active browser page into Unread immediately, before optional note editing finishes.
_Avoid_: Bookmark, archive

**Quick Capture**:
The small extension-owned interface used to confirm a Capture and optionally edit its note.
_Avoid_: Editor, reader

**Unread**:
The reading state for an item that remains in the active queue.
_Avoid_: Inbox, pending

**Done**:
The reading state for an item that has been resolved and is hidden from the default queue.
_Avoid_: Archived, read

**Trash**:
Recoverable deletion infrastructure outside the reading-state workflow. Restoring an item returns it to the reading state it held before deletion.
_Avoid_: Deleted state, archive

**Preset Note**:
A numbered reusable text snippet inserted into the ordinary note field. It is not classification metadata.
_Avoid_: Tag, category

**Source Tab**:
The browser Tab whose page is captured.

