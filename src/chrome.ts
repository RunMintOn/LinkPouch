import type { RuntimeMessage, RuntimeResponse } from "./messages";

export async function sendMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse>;
}
