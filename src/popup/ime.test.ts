import { describe, expect, it } from "vitest";
import { isImeInput } from "./ime";

describe("IME keyboard guard", () => {
  it("blocks shortcuts while a composition session is active", () => {
    expect(isImeInput({ isComposing: false, keyCode: 13 }, true)).toBe(true);
  });

  it("recognizes native composing events and Chromium keyCode 229", () => {
    expect(isImeInput({ isComposing: true, keyCode: 13 }, false)).toBe(true);
    expect(isImeInput({ isComposing: false, keyCode: 229 }, false)).toBe(true);
  });

  it("allows ordinary keyboard events", () => {
    expect(isImeInput({ isComposing: false, keyCode: 13 }, false)).toBe(false);
  });
});
