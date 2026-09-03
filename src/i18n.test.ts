import { describe, expect, it } from "vitest";
import { t, viewLabel } from "./i18n";

describe("interface translations", () => {
  it("provides localized labels and interpolation", () => {
    expect(viewLabel("zh-CN", "unread")).toBe("全部未读");
    expect(viewLabel("en", "unread")).toBe("All unread");
    expect(t("en", "queue.unreadCount", { count: 3 })).toBe("3 to read");
  });
});
