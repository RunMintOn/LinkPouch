export type ItemState = "unread" | "done" | "trash";
export type QueueView = "all" | "unread" | "today" | "week" | "source" | "done" | "trash";
export type SortOrder = "newest" | "oldest";
export type Theme = "system" | "light" | "dark";
export type Language = "zh-CN" | "en";
export type OpenBehavior = "allWindows" | "queueWindow" | "newTab";
export type QueueOpenBehavior = "allWindows" | "currentWindow";

export interface SavedContent {
  kind: "page" | "selection";
  html: string;
  text: string;
  author?: string;
}

export interface PageImage {
  url: string;
  alt: string;
}

export interface LocalImage {
  id: string;
  directoryId: string;
  fileName: string;
  itemId: string;
  sourceUrl: string;
  title: string;
  alt: string;
  createdAt: number;
}

export interface CapturedPage {
  url: string;
  title: string;
  content?: SavedContent;
  images?: PageImage[];
}

export interface ReadingItem {
  id: string;
  url: string;
  title: string;
  domain: string;
  note: string;
  createdAt: number;
  queuedAt: number;
  doneAt: number | null;
  deletedAt: number | null;
  content?: SavedContent;
  images?: PageImage[];
}

export interface Settings {
  presets: string[];
  closeAfterCapture: boolean;
  openBehavior: OpenBehavior;
  queueOpenBehavior: QueueOpenBehavior;
  popupScale: number;
  sortOrder: SortOrder;
  theme: Theme;
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  presets: ["这个项目可能有用", "以后仔细研究", "和当前项目有关", "值得分享", "", "", "", "", ""],
  closeAfterCapture: false,
  openBehavior: "allWindows",
  queueOpenBehavior: "allWindows",
  popupScale: 0.9,
  sortOrder: "newest",
  theme: "system",
  language: "zh-CN",
};

export function normalizeUrl(value: string): string {
  return new URL(value).href;
}

export function domainFromUrl(value: string): string {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function stateOf(item: ReadingItem): ItemState {
  if (item.deletedAt !== null) return "trash";
  if (item.doneAt !== null) return "done";
  return "unread";
}

export function captureItem(
  items: ReadingItem[],
  page: CapturedPage,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): { items: ReadingItem[]; item: ReadingItem; outcome: "created" | "existing" | "restored" } {
  const url = normalizeUrl(page.url);
  const existing = page.content?.kind === "selection" ? undefined
    : items.find((item) => item.url === url && item.content?.kind !== "selection");
  if (!existing) {
    const item: ReadingItem = {
      id,
      url,
      title: page.title || url,
      domain: domainFromUrl(url),
      note: "",
      createdAt: now,
      queuedAt: now,
      doneAt: null,
      deletedAt: null,
      content: page.content,
      images: page.images,
    };
    return { items: [item, ...items], item, outcome: "created" };
  }

  const outcome = stateOf(existing) === "unread" ? "existing" : "restored";
  const item: ReadingItem = {
    ...existing,
    title: page.title || existing.title,
    domain: domainFromUrl(url),
    queuedAt: now,
    doneAt: null,
    deletedAt: null,
    content: page.content ?? existing.content,
    images: page.images ?? existing.images,
  };
  return { items: items.map((candidate) => candidate.id === item.id ? item : candidate), item, outcome };
}

export function markDone(item: ReadingItem, now = Date.now()): ReadingItem {
  return { ...item, doneAt: now };
}

export function markUnread(item: ReadingItem, now = Date.now()): ReadingItem {
  return { ...item, doneAt: null, deletedAt: null, queuedAt: now };
}

export function moveToTrash(item: ReadingItem, now = Date.now()): ReadingItem {
  return { ...item, deletedAt: now };
}

export function restoreFromTrash(item: ReadingItem, now = Date.now()): ReadingItem {
  return {
    ...item,
    deletedAt: null,
    queuedAt: item.doneAt === null ? now : item.queuedAt,
  };
}

function searchTerms(query: string): string[] {
  return [...new Set(query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean))];
}

function fieldMatchScore(value: string, term: string, weight: number): number {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  if (normalized === term) return weight * 3;
  if (normalized.startsWith(term)) return weight * 2;
  return normalized.includes(term) ? weight : 0;
}

function searchScore(item: ReadingItem, terms: string[]): number | null {
  let score = 0;
  for (const term of terms) {
    const bestFieldScore = Math.max(
      fieldMatchScore(item.title, term, 100),
      fieldMatchScore(item.note, term, 60),
      fieldMatchScore(item.content?.text ?? "", term, 50),
      fieldMatchScore(item.domain, term, 40),
      fieldMatchScore(item.url, term, 20),
    );
    if (bestFieldScore === 0) return null;
    score += bestFieldScore;
  }
  return score;
}

export function matchesSearch(item: ReadingItem, query: string): boolean {
  const terms = searchTerms(query);
  return terms.length === 0 || searchScore(item, terms) !== null;
}

export function searchItems(items: ReadingItem[], query: string, sortOrder: SortOrder): ReadingItem[] {
  const terms = searchTerms(query);
  const direction = sortOrder === "newest" ? -1 : 1;
  if (terms.length === 0) return [...items].sort((a, b) => (a.queuedAt - b.queuedAt) * direction);

  return items
    .map((item) => ({ item, score: searchScore(item, terms) }))
    .filter((entry): entry is { item: ReadingItem; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || (a.item.queuedAt - b.item.queuedAt) * direction)
    .map(({ item }) => item);
}

function startOfToday(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function startOfWeek(now: Date): number {
  const day = now.getDay() || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
}

export function itemsForView(
  items: ReadingItem[],
  view: QueueView,
  sortOrder: SortOrder,
  now = new Date(),
): ReadingItem[] {
  let result = items.filter((item) => {
    const state = stateOf(item);
    if (view === "all") return state !== "trash";
    if (view === "done") return state === "done";
    if (view === "trash") return state === "trash";
    if (state !== "unread") return false;
    if (view === "today") return item.queuedAt >= startOfToday(now);
    if (view === "week") return item.queuedAt >= startOfWeek(now);
    return true;
  });
  const direction = sortOrder === "newest" ? -1 : 1;
  result = [...result].sort((a, b) => (a.queuedAt - b.queuedAt) * direction);
  return result;
}
