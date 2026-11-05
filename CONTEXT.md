# LinkPouch

LinkPouch is a local-first collection of saved pages, text selections, and images. Keeping content long-term is intentional; the reading queue is one view of the collection, not its purpose.

## Language

**Collection**:
Saved content retained until the user explicitly removes it. It includes reading items and collected images.

**Reading Queue**:
The subset of the collection that the user still intends to read.

**Reading Item**:
One saved page or text selection, with its source URL, title, optional note, content, and lifecycle timestamps. Multiple selections from the same source are distinct items.

**Capture**:
Saving the active page's content, or only its selected text when a text selection exists, before optional note editing finishes.

**Quick Capture**:
The small extension-owned interface showing what Capture saved and allowing optional note editing.

**Collected Image**:
An image explicitly saved to the user's authorized directory, with a link back to its source post. Collecting images is separate from saving a page's body.

**Gallery**:
A view of collected images read from their directory, not another copy of the image collection.

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

