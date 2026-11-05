# Browser Reading Queue — Product Requirement Document

> Historical V1 specification. The permanent-collection, saved-body, and image-capture boundaries are superseded by `CONTEXT.md` and `docs/adr/0001-local-content-collection.md`. Unrelated behaviors remain unchanged.

## Problem Statement

用户在浏览器中阅读博客、文章、GitHub 项目、X/Twitter 内容及其他网页时，经常遇到“现在没时间看，但之后想回来读”的内容。

现有处理方式存在两个问题。

第一，原始操作成本过高。用户通常需要复制 URL、切换到其他应用、粘贴、补充备注，再回到浏览器。这种流程打断当前阅读上下文。

第二，主流稍后读、书签或知识管理产品往往逐渐演化为资料库，提供文件夹、标签体系、归档、Highlight、全文阅读器、AI 摘要等功能。它们优化的是“长期保存和整理”，而本产品的目标是“临时进入阅读队列，最终被消费并清空”。

用户的核心需求是：

> 当浏览器里出现一个“以后要看”的内容时，以尽可能低的操作成本把它放入一个临时阅读队列；之后仍然回到浏览器原网页中阅读；读完后勾掉并让它从默认视图消失。

该产品应当是 Reading Queue，而非 Bookmark Manager、Read-it-later Reader 或 Knowledge Base。

产品的重要设计原则是：

* Capture 快于 Organize。
* 浏览器继续承担阅读环境。
* 用户不需要管理资料库。
* 备注用于恢复上下文，不用于建立知识分类体系。
* 默认目标是减少未读队列，而非扩大收藏库。
* 核心交互必须 keyboard-first。
* 主界面可以丰富，但 Capture 流程必须极短、稳定、可预测。

---

## Solution

构建一个 browser-native Reading Queue。

V1 以 Chromium 浏览器扩展作为产品主体，不开发独立的原生 macOS 阅读 App。

产品包含两个主要交互面：

1. Quick Capture：用户正在浏览网页时，通过全局扩展快捷键快速保存当前页面。
2. Queue：一个完整的 Extension Page，以普通浏览器 Tab 的形式运行，用于查看、搜索、重新打开、完成和删除阅读条目。

用户按下 Capture 快捷键后：

1. 扩展立即读取当前 Tab 的 URL、标题和来源域名。
2. 系统立即创建一个 Unread 条目，避免后续 UI 异常导致链接丢失。
3. 打开独立的 Extension Popup。
4. 备注输入框自动获得键盘焦点。
5. 用户可以直接输入备注，也可以通过二段式快捷键插入预设备注。
6. Enter 保存并关闭 Quick Capture。
7. Shift+Enter 插入换行。
8. Esc 取消当前备注编辑并关闭 Popup，但已经捕获的 URL 默认仍然保留。

读取内容时：

1. 用户打开 Reading Queue。
2. 点击任意条目。
3. 页面在普通浏览器 Tab 中打开。
4. 用户继续使用浏览器自身能力阅读、搜索、打开新 Tab 或查阅其他资料。
5. 阅读完成后，在 Queue 中勾选 Done。
6. Done 条目立即从默认 Unread 视图消失。

产品不提供自己的文章阅读器。

---

## User Stories

1. As a browser user, I want to save the page I am currently viewing with one keyboard shortcut, so that I do not need to copy and paste its URL manually.

2. As a browser user, I want the current page URL to be captured automatically, so that saving does not require interacting with the address bar.

3. As a browser user, I want the current page title to be captured automatically, so that saved items remain understandable later.

4. As a browser user, I want the source domain to be captured automatically, so that I can later understand where each item came from.

5. As a browser user, I want the save operation to happen immediately when I invoke Quick Capture, so that the link is not lost if the popup closes unexpectedly.

6. As a browser user, I want the note field to receive focus immediately after Quick Capture opens, so that I can continue entirely from the keyboard.

7. As a browser user, I want to type a free-form note while saving an item, so that I can record why I wanted to revisit it.

8. As a browser user, I want to press Enter to finish saving, so that the normal capture workflow requires as few keystrokes as possible.

9. As a browser user, I want Shift+Enter to create a newline inside my note, so that longer notes remain possible without changing the default Enter behavior.

10. As a browser user, I want Escape to close Quick Capture, so that I always have a predictable way to leave the capture interface.

11. As a browser user, I want my captured URL to survive an accidental popup dismissal, so that focus errors or browser behavior do not cause data loss.

12. As a browser user, I want to save an item without writing any note, so that simple saves remain nearly instantaneous.

13. As a browser user, I want to use predefined note phrases, so that frequently repeated reasons for saving do not need to be retyped.

14. As a browser user, I want predefined notes to be inserted into the same ordinary note field, so that preset phrases do not create a separate metadata system.

15. As a browser user, I want to invoke preset notes through a two-step keyboard sequence, so that the product does not require a large number of global shortcuts.

16. As a browser user, I want to press a prefix shortcut such as Ctrl+E and then a number, so that choosing a preset is quick and memorable.

17. As a browser user, I want focus to return to the note field after inserting a preset, so that I can continue typing additional context immediately.

18. As a browser user, I want presets such as “这个项目可能有用” or “以后仔细研究” to behave as text insertion, so that they remain lightweight rather than becoming tags.

19. As a browser user, I want to configure my own preset phrases, so that Quick Capture reflects my recurring reasons for saving content.

20. As a browser user, I want a limited number of presets, so that the preset system itself does not become something I need to organize.

21. As a browser user, I want the Quick Capture interface to be visually small, so that it does not interrupt the page I am currently viewing.

22. As a browser user, I want Quick Capture to use an isolated extension-owned UI surface, so that arbitrary website CSS or JavaScript does not break the interaction.

23. As a browser user, I want Quick Capture to behave consistently on GitHub, X, blogs and other websites, so that I do not need to learn different behavior per site.

24. As a browser user, I want keyboard shortcuts inside Quick Capture to belong predictably to the extension, so that website-specific keyboard handlers do not interfere with saving.

25. As a browser user, I want the capture experience to feel instantaneous, so that saving something does not interrupt my reading flow.

26. As a browser user, I want visual confirmation that an item has been captured, so that I know the action succeeded.

27. As a browser user, I want the confirmation animation to remain subtle and brief, so that the product does not create unnecessary visual interruption.

28. As a browser user, I want a dedicated Reading Queue interface, so that I can see everything I still intend to read.

29. As a browser user, I want the Reading Queue to open as a full browser Tab, so that there is enough space for a useful list without using a cramped sidebar.

30. As a browser user, I want the Queue Tab to behave like a lightweight application inside my browser, so that I do not need to switch to a separate macOS App.

31. As a browser user, I want invoking the Queue shortcut to focus an existing Queue Tab if one already exists, so that duplicate Queue Tabs are not created.

32. As a browser user, I want the Queue Tab to be pinnable, so that it can remain a persistent entry point in my browser.

33. As a browser user, I want to see only unread items by default, so that the default screen represents my actual remaining reading backlog.

34. As a browser user, I want to mark an item Done with a single action, so that consuming an item immediately removes it from my active queue.

35. As a browser user, I want Done items to disappear from the default list, so that the Queue remains focused on unfinished reading.

36. As a browser user, I want to view previously completed items when needed, so that accidentally completed items can still be found.

37. As a browser user, I want to restore a Done item to Unread, so that marking something complete is reversible.

38. As a browser user, I want to delete an item, so that irrelevant or mistaken captures can be removed.

39. As a browser user, I want deleted items to enter Trash first, so that accidental deletion is recoverable.

40. As a browser user, I want to restore an item from Trash, so that deletion remains forgiving.

41. As a browser user, I want to permanently delete Trash items, so that removed content does not remain indefinitely.

42. As a browser user, I want to search across my queue, so that I can quickly retrieve an item when I remember only part of it.

43. As a browser user, I want a single search field to search title, URL, domain and note, so that I do not need to understand an advanced search syntax.

44. As a browser user, I want to view items grouped or filtered by time, so that I can revisit what I saved today, this week or earlier.

45. As a browser user, I want to view items by source domain, so that I can see groups such as github.com, x.com or specific blogs without manually tagging them.

46. As a browser user, I want source grouping to use automatically derived domain data, so that categorization requires no manual maintenance.

47. As a browser user, I want items to display when they were saved, so that I can judge how stale my queue has become.

48. As a browser user, I want saved notes visible in the Queue, so that I can recover the reason I originally saved an item.

49. As a browser user, I want to click an item and open the original URL in the browser, so that reading happens in the native context of the website.

50. As a browser user, I want opened pages to remain ordinary browser Tabs, so that I can use search engines, tab management, extensions and other browser capabilities while reading.

51. As a browser user, I want GitHub projects to open directly on GitHub, so that repository navigation and GitHub-specific functionality remain available.

52. As a browser user, I want X posts or threads to open on X, so that replies, context and surrounding discussion remain available.

53. As a browser user, I want normal blogs to open at their original location, so that links, comments, formatting and site-specific context remain intact.

54. As a browser user, I want the product to avoid building its own reader mode, so that the product remains focused and lightweight.

55. As a browser user, I want the product to avoid asking me to file items into folders, so that saving something does not create organizational work.

56. As a browser user, I want the product to avoid a tag management system, so that I do not gradually build another knowledge database.

57. As a browser user, I want the product to avoid manual drag-and-drop ordering, so that I do not spend time maintaining the queue.

58. As a browser user, I want the product to avoid priority levels in the initial release, so that I do not need to decide whether one unread item is more important than another.

59. As a browser user, I want only Unread and Done as meaningful reading states, so that state management remains obvious.

60. As a browser user, I want Trash to behave as deletion infrastructure rather than an additional content state, so that the mental model remains simple.

61. As a browser user, I want presets to remain part of notes rather than turning into filters or categories, so that repeated phrases do not create another taxonomy.

62. As a browser user, I want the Queue to support potentially hundreds of items without obvious lag, so that the extension still feels solid over time.

63. As a browser user, I want scrolling and transitions to remain smooth, so that the product feels closer to a native utility than a fragile browser plugin.

64. As a browser user, I want the interface to load from local data without waiting for a remote service, so that core interactions remain fast and available offline.

65. As a browser user, I want captured data to persist across browser restarts, so that the Queue is reliable.

66. As a browser user, I want the extension to avoid unnecessary background activity, so that it does not noticeably affect browser performance.

67. As a browser user, I want the product to work initially across Chromium-based browsers where possible, so that the same core product can later support Chrome, Arc, Brave and Edge.

68. As a browser user, I want browser-specific limitations to fail gracefully, so that restricted pages do not produce confusing or silent failures.

69. As a user, I want the product to maintain a queue mindset, so that my saved items are expected to be processed rather than permanently curated.

70. As a user, I want the default experience to encourage an empty or smaller queue over time, so that the product helps reduce cognitive backlog rather than accumulate it.

---

## Implementation Decisions

### Product Architecture

V1 will be implemented as a Chromium browser extension.

The extension is the product itself rather than a companion to a macOS application.

A native macOS App is not required for V1.

The architecture should preserve the option to introduce a small native companion later for cross-browser storage, system-level capture, iCloud sync, menu bar access or other macOS integrations.

### Supported Browsers

The initial implementation should target Chromium extension APIs.

Chrome is the primary reference browser.

The implementation should avoid unnecessary Chrome-specific assumptions where practical so that Arc, Brave and Edge can potentially use the same extension package or a minimally adapted version.

Safari support is deferred.

### Main UI Surfaces

The product has two primary UI surfaces.

#### Quick Capture

Quick Capture should use an extension-owned Popup rather than injecting a complex UI into the current website.

The reason is reliability:

* website CSS must not affect the Capture UI;
* website DOM changes must not break it;
* website JavaScript keyboard handlers should not control the note field;
* focus behavior should be deterministic;
* the same Capture implementation should behave consistently across supported sites.

Quick Capture is intentionally temporary and small.

It is not the primary place for browsing or managing saved content.

#### Reading Queue

The main Queue will be a full Extension Page opened as a normal browser Tab.

The Queue must not rely on the limited dimensions of a toolbar popup.

The Queue should not be designed primarily as a Side Panel in V1.

Opening the Queue through its shortcut should:

* locate an existing Queue Tab and focus it if available;
* create a new Queue Tab only if none exists.

### Capture Lifecycle

The initial capture action and the note editing action are separated.

When the user invokes Quick Capture:

1. Resolve the currently active browser Tab.
2. Capture at minimum:

   * URL
   * page title
   * source domain
   * capture timestamp
3. Immediately persist a new Unread item.
4. Open/focus Quick Capture.
5. Automatically focus the note textarea.
6. Allow the user to modify the note.
7. Persist note changes when the user confirms.

This means a successfully invoked capture should not depend on the note UI remaining open.

Popup dismissal must not cause the captured URL to disappear.

Capture deduplicates only exact normalized URLs. It must not remove query parameters or fragments when deciding whether two URLs are equal.

When the captured URL already exists:

* an Unread item is updated and moved to the top of the queue;
* a Done or Trash item is restored to Unread and moved to the top;
* the existing note is preserved and shown for continued editing;
* the Quick Capture UI reports whether the item was already queued or was returned to the queue;
* no confirmation dialog interrupts the capture flow.

If the “close source tab after capture” setting is enabled, the source Tab closes only after the user confirms with Enter. Escape or an accidental Popup dismissal leaves the source Tab open. Pinned Tabs are never closed automatically. Failure to close a Tab must not undo the capture.

### Keyboard Model

The product is keyboard-first.

The planned top-level shortcuts include:

* Capture current page.
* Open/focus Reading Queue.

The exact final macOS key combinations may be adjusted if required by Chrome or operating system conflicts.

The default macOS shortcuts are Option+Shift+S for Capture and Option+Shift+Q for opening the Queue. Users may reassign them through Chromium’s extension shortcut settings.

Quick Capture internal behavior:

* typing inserts note text;
* Enter confirms and closes;
* Shift+Enter inserts a newline;
* Esc closes/cancels note editing.

Internal Quick Capture actions should prefer chorded shortcuts rather than consuming many Command-based global shortcuts.

A chord is defined as:

1. user presses a prefix combination;
2. the interface temporarily enters a sub-mode;
3. the next key determines the action.

Preset notes use this model.

Example conceptual interaction:

* Ctrl+E
* 1

The exact prefix may change during implementation based on platform conflicts and usability testing.

### Preset Notes

Preset notes are reusable text snippets.

They are not tags.

Selecting a preset inserts text into the ordinary note field.

After insertion:

* focus returns/remains in the note textarea;
* the caret remains usable for immediate continued typing;
* the inserted text can be freely edited.

Presets should remain intentionally limited.

V1 must provide configuration for up to nine numbered presets.

Examples include:

* 这个项目可能有用
* 以后仔细研究
* 和当前项目有关
* 值得分享

Preset phrases must not become independently searchable metadata categories beyond their normal presence inside note text.

### Data Model

The core item should remain intentionally minimal.

Required conceptual fields:

* id
* url
* title
* domain
* note
* createdAt
* queuedAt
* doneAt or equivalent Done representation
* deletedAt or equivalent Trash representation

Unread can be represented as the absence of Done state.

`createdAt` records the first capture. `queuedAt` records when the item most recently entered or re-entered Unread. Re-capture and restoration to Unread update `queuedAt`; ordinary note edits do not.

Trash is deletion infrastructure and should not become a third reading workflow state.

No priority field is required in V1.

### Reading States

The meaningful reading state model is:

* Unread
* Done

Default Queue view shows Unread only.

Marking an item Done removes it from the default Queue immediately.

Done items remain recoverable through a Done/history view.

A Done item can be restored to Unread.

### Delete Model

Delete performs soft deletion.

Soft-deleted items enter Trash.

Trash supports:

* search or discovery;
* restore to the reading state held immediately before deletion;
* permanent deletion.

Restoring an item deleted from Unread returns it to Unread. Restoring an item deleted from Done returns it to Done.

Trash is not shown in the ordinary Unread workflow.

### Queue Views

V1 should support a limited set of derived views rather than manual organization.

Planned views:

* All Unread
* Today
* This Week
* By Source
* Done
* Trash

Time-based and source-based views are derived automatically from item metadata. Today, This Week and By Source include Unread items only. “This Week” means the current local calendar week beginning Monday.

Unread views sort by `queuedAt`, newest first by default. Users may switch between newest-first and oldest-first ordering. Manual ordering is not supported.

Users do not create or edit these classifications.

### Source Grouping

Source grouping derives from the URL domain.

Examples:

* github.com
* x.com
* substack.com
* individual blog domains

Domain grouping uses the lowercase URL hostname with a leading `www.` removed. Other subdomains remain distinct.

No manual source classification is required.

### Search

The product provides one primary search interface.

Search covers:

* title
* URL
* domain
* note

Search is global and ignores the currently selected Queue view. Results may include Unread, Done and Trash items and must show each item’s current state.

Advanced search syntax, query builders and complex filtering are not part of V1.

### Opening Saved Content

Clicking a Queue item opens its original URL in the browser.

Opening an item checks the Queue's browser window for a Tab with the exact same URL. If one exists, it is focused. Otherwise, a new Tab is created in that window. Opening an item never navigates or replaces an existing Tab with a different URL. Exact-URL Tabs in unrelated browser windows are ignored because Chromium does not expose macOS Space membership and focusing an arbitrary window could move the user to another Space. A setting allows users to always open items in a new Tab instead.

The browser remains the reading environment.

The extension must not transform a saved webpage into a proprietary article format.

The extension does not need to download article bodies for reading.

### Local-First Storage

Core Reading Queue data should be stored locally in the browser.

The exact storage mechanism may use IndexedDB or another extension-appropriate persistent store based on implementation constraints.

The architecture should prioritize:

* fast local reads;
* persistence across browser restarts;
* no network requirement for core interactions;
* straightforward future export/migration.

The product should not require a backend service for V1.

### Performance

The Queue should be engineered as a lightweight application rather than a complex content-script overlay.

Complex UI must not be injected into arbitrary websites.

The extension should avoid unnecessary background observers and site-specific DOM integrations.

Rendering should remain smooth with hundreds of queue items.

If large queues require list virtualization, it should be introduced without affecting the external product model.

Animations should be restrained and focused on opacity/transform-style transitions where possible.

Reliability and predictable focus behavior take precedence over decorative motion.

### Reliability

The product should establish a strong invariant:

> Once Capture has visibly succeeded, the URL has already been persisted.

Failures in note entry, popup lifecycle or later UI rendering must not silently undo the initial capture.

The UI should provide immediate success/error feedback when Capture is invoked.

Restricted browser pages should fail explicitly and predictably.

### Product Boundary

The Queue is an operational backlog.

It is not intended as long-term personal knowledge management.

The product should resist features that create ongoing organizational maintenance.

New features should be evaluated against this question:

> Does this help the user capture, recover context, find, read or remove an item without encouraging them to curate a permanent collection?

If the answer is primarily “it helps organize a growing library,” it is probably outside the intended product boundary.

### Future Native Companion

A native macOS companion may be considered later if validated needs emerge, especially:

* sharing one database across Chrome and Safari;
* system Share Sheet capture;
* capture from Mail, Slack or other desktop applications;
* menu bar access;
* global system hotkeys;
* iCloud-backed local synchronization;
* desktop backup/export infrastructure.

If introduced, the native application should remain infrastructure or an alternate Queue surface.

It should not introduce a native article reader.

---

## Testing Decisions

Tests should validate externally observable product behavior rather than implementation details.

A good test should answer questions such as:

* Did invoking Capture create the expected Reading Queue item?
* Was the correct active Tab URL captured?
* Did an accidentally closed popup still leave the item saved?
* Does the note field receive focus when Quick Capture opens?
* Does Enter save/close?
* Does Shift+Enter create a newline rather than closing?
* Does selecting a preset insert text and preserve editing focus?
* Does Done remove an item from the default Unread view?
* Can Done be reversed?
* Does Delete move an item to Trash?
* Can Trash items be restored?
* Does search find items through title, URL, domain and note?
* Does opening an item navigate to the original URL?
* Does invoking Queue repeatedly reuse the existing Queue Tab?

The highest-value behavioral seam should ideally exercise the extension as a whole through browser-extension APIs and visible UI behavior.

Unit tests may be used for deterministic domain logic such as:

* domain normalization;
* search matching;
* state transitions;
* date-based derived views.

The core state transition model should receive explicit coverage:

Unread → Done
Done → Unread
Unread → Trash
Done → Trash
Trash → the reading state held immediately before deletion
Trash → Permanently Deleted

Quick Capture should receive focused interaction testing around keyboard and focus behavior because these behaviors are central product requirements rather than minor presentation details.

Performance testing should validate realistic queues containing hundreds of items and ensure that scrolling, search and Done operations remain responsive.

No specific prior art from an existing codebase has been provided.

Test seams need to be further confirmed in an environment with access to the codebase.

---

## Out of Scope

The following are explicitly outside V1:

* built-in article reader;
* Reader Mode;
* downloading and storing full article bodies;
* offline article copies;
* highlights;
* annotations attached to selected article text;
* AI summaries;
* AI classification;
* folders;
* nested folders;
* collections;
* manual categories;
* tag management;
* tag hierarchies;
* manual drag-and-drop ordering;
* custom workflow states;
* priority levels;
* star/favorite state;
* archive as an additional lifecycle state;
* reading-progress tracking;
* estimated reading time as a core workflow feature;
* permanent bookmark-library behavior;
* RSS ingestion;
* newsletters;
* automatic article discovery;
* social sharing;
* collaborative queues;
* accounts;
* remote backend dependency;
* cross-device synchronization in V1;
* native macOS App in V1;
* Safari extension in V1;
* iOS/iPadOS applications;
* browser-independent desktop capture;
* complex advanced search syntax;
* user-created saved filters.

The product should also avoid adding organizational features solely because existing read-it-later products offer them.

---

## Further Notes

The working product category is **browser-native Reading Queue**.

A useful distinction from existing products is:

* Bookmark managers optimize storage and organization.
* Read-it-later readers optimize consumption inside their own reading environment.
* This product optimizes the lifecycle from “I should read this later” to “I have read it and it can disappear.”

The intended lifecycle is:

Capture → Recover Context → Open in Browser → Read → Done → Disappear.

The most important UX sequence is:

Command+Shift+S → note field already focused → optionally enter or insert note → Enter.

A no-note capture should remain even simpler:

Command+Shift+S → Enter.

Preset notes are intended to reduce repeated typing without creating semantic metadata.

The Queue should feel app-like despite being implemented as an extension. The primary strategy for achieving this is to keep the management UI inside an extension-owned full Tab and keep arbitrary website integration extremely limited.

The dominant product metric should not be total saved items.

More appropriate behavioral indicators include:

* capture completion rate;
* median time from capture invocation to dismissal;
* percentage of captured items eventually marked Done;
* age distribution of remaining Unread items;
* frequency with which users need to perform manual organizational work.

These are still proxy metrics. The actual product goal is that users can defer reading without losing context and can later resolve that queue with minimal friction.

A useful design constraint for future feature proposals is:

> The system may help users find an item, but it should not encourage users to maintain the collection.

This constraint should be treated as part of the core product definition rather than merely an MVP limitation.
