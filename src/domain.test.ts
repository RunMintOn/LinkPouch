import { describe, expect, it } from "vitest";
import {
  captureItem,
  DEFAULT_SETTINGS,
  domainFromUrl,
  itemsForView,
  markDone,
  moveToTrash,
  restoreFromTrash,
  searchItems,
  stateOf,
  type ReadingItem,
} from "./domain";

const page = { url: "https://www.Example.com/article?x=1#part", title: "Article" };

describe("reading queue domain", () => {
  it("defaults to following the system theme and using Chinese", () => {
    expect(DEFAULT_SETTINGS.theme).toBe("system");
    expect(DEFAULT_SETTINGS.language).toBe("zh-CN");
  });

  it("normalizes domains without changing meaningful URL parts", () => {
    expect(domainFromUrl(page.url)).toBe("example.com");
    expect(captureItem([], page, 10, "one").item.url).toBe("https://www.example.com/article?x=1#part");
  });

  it("updates an exact duplicate instead of creating another item", () => {
    const first = captureItem([], page, 10, "one");
    const second = captureItem(first.items, { ...page, title: "New title" }, 20, "two");
    expect(second.items).toHaveLength(1);
    expect(second.item).toMatchObject({ id: "one", title: "New title", queuedAt: 20 });
    expect(second.outcome).toBe("existing");

    const differentFragment = captureItem(second.items, { ...page, url: "https://www.example.com/article?x=1#other" }, 30, "three");
    expect(differentFragment.items).toHaveLength(2);
  });

  it("requeues a captured Done item", () => {
    const first = captureItem([], page, 10, "one").item;
    const done = markDone(first, 15);
    const result = captureItem([done], page, 20, "two");
    expect(stateOf(result.item)).toBe("unread");
    expect(result.outcome).toBe("restored");
  });

  it("restores Trash to its previous reading state", () => {
    const unread = captureItem([], page, 10, "one").item;
    expect(stateOf(restoreFromTrash(moveToTrash(unread, 20), 30))).toBe("unread");
    expect(stateOf(restoreFromTrash(moveToTrash(markDone(unread, 15), 20), 30))).toBe("done");
  });

  it("limits time views to Unread and sorts newest first", () => {
    const monday = new Date(2025, 0, 6, 12);
    const item = (id: string, queuedAt: number, doneAt: number | null = null): ReadingItem => ({
      id, url: `https://${id}.test`, title: id, domain: `${id}.test`, note: "",
      createdAt: queuedAt, queuedAt, doneAt, deletedAt: null,
    });
    const sunday = new Date(2025, 0, 5, 12).getTime();
    const mondayMorning = new Date(2025, 0, 6, 8).getTime();
    const mondayNoon = monday.getTime();
    expect(itemsForView([
      item("old", sunday), item("new", mondayNoon), item("morning", mondayMorning), item("done", mondayNoon, mondayNoon),
    ], "week", "newest", monday).map(({ id }) => id)).toEqual(["new", "morning"]);
  });

  it("matches every search term across item fields and ranks title matches first", () => {
    const item = (id: string, title: string, note: string, domain: string, queuedAt: number): ReadingItem => ({
      id, title, note, domain, url: `https://${domain}/${id}`,
      createdAt: queuedAt, queuedAt, doneAt: null, deletedAt: null,
    });
    const titleMatch = item("title", "GitHub React guide", "", "example.com", 10);
    const crossFieldMatch = item("cross-field", "React guide", "", "github.com", 20);
    const noteMatch = item("note", "Save for later", "GitHub React guide", "example.com", 30);
    const missingTerm = item("missing", "React guide", "", "example.com", 40);

    expect(searchItems([noteMatch, missingTerm, crossFieldMatch, titleMatch], "github react", "newest").map(({ id }) => id))
      .toEqual(["title", "cross-field", "note"]);
  });

  it("uses the chosen time order when search relevance is tied", () => {
    const item = (id: string, queuedAt: number): ReadingItem => ({
      id, title: "React guide", note: "", domain: "example.com", url: `https://example.com/${id}`,
      createdAt: queuedAt, queuedAt, doneAt: null, deletedAt: null,
    });
    const older = item("older", 10);
    const newer = item("newer", 20);

    expect(searchItems([older, newer], "react", "newest").map(({ id }) => id)).toEqual(["newer", "older"]);
    expect(searchItems([older, newer], "react", "oldest").map(({ id }) => id)).toEqual(["older", "newer"]);
  });
});
