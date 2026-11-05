import { useMemo } from "react";
import DOMPurify from "dompurify";
import type { SavedContent as Content } from "./domain";

export function SavedContent({ content }: { content: Content }) {
  const html = useMemo(() => DOMPurify.sanitize(content.html, {
    FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
    FORBID_ATTR: ["style"],
  }), [content.html]);

  return <div className={`saved-content ${content.kind}`} dangerouslySetInnerHTML={{ __html: html }}
    onClick={(event) => {
      const link = (event.target as Element).closest("a");
      if (!link) return;
      event.preventDefault();
      void chrome.tabs.create({ url: link.href });
    }} />;
}
