import type { ReadingItem, Settings } from "./domain";

export type CaptureOutcome = "created" | "existing" | "restored";

export interface CaptureSession {
  itemId?: string;
  sourceTabId?: number;
  outcome?: CaptureOutcome;
  error?: string;
  startedAt: number;
}

export type RuntimeMessage =
  | { type: "CAPTURE_ACTIVE_TAB" }
  | { type: "CONFIRM_CAPTURE"; itemId: string; note: string; sourceTabId?: number }
  | { type: "OPEN_ITEM"; url: string }
  | { type: "OPEN_QUEUE" };

export type RuntimeResponse =
  | { ok: true; session?: CaptureSession; item?: ReadingItem; settings?: Settings }
  | { ok: false; error: string };
