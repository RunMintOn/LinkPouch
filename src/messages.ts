import type { ReadingItem, Settings } from "./domain";

export type CaptureOutcome = "created" | "existing" | "restored";

export interface CaptureSession {
  itemId?: string;
  sourceTabId?: number;
  outcome?: CaptureOutcome;
  error?: string;
  extractionError?: string;
  startedAt: number;
}

export type RuntimeMessage =
  | { type: "CAPTURE_ACTIVE_TAB" }
  | { type: "CONFIRM_CAPTURE"; itemId: string; note: string; sourceTabId?: number }
  | { type: "OPEN_ITEM"; url: string }
  | { type: "OPEN_QUEUE"; itemId?: string; download?: boolean }
  | { type: "DOWNLOAD_POST_IMAGES" };

export type RuntimeResponse =
  | { ok: true; session?: CaptureSession; item?: ReadingItem; settings?: Settings }
  | { ok: false; error: string };
