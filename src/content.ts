import Defuddle from "defuddle";
import type { CapturedPage, PageImage } from "./domain";

export async function extractPage(useSelection = true): Promise<CapturedPage> {
  const selection = useSelection ? window.getSelection()?.toString().trim() : "";
  if (selection) {
    const paragraph = document.createElement("p");
    paragraph.textContent = selection;
    paragraph.style.whiteSpace = "pre-wrap";
    return {
      url: location.href,
      title: document.title,
      content: { kind: "selection", html: paragraph.outerHTML, text: selection },
    };
  }

  const result = await new Defuddle(document, {
    url: location.href,
    includeReplies: false,
  }).parseAsync();
  const body = new DOMParser().parseFromString(result.content, "text/html").body;
  const images: PageImage[] = [...body.querySelectorAll("img[src]")]
    .map((img) => ({
      url: new URL(img.getAttribute("src")!, location.href).href,
      alt: img.getAttribute("alt") ?? "",
    }));
  body.querySelectorAll("p,div,li,pre,blockquote,h1,h2,h3,h4,br").forEach((element) => {
    element.append(document.createTextNode("\n"));
  });
  const text = body.textContent?.trim() ?? "";
  return {
    url: location.href,
    title: result.title || document.title,
    content: result.content ? {
      kind: "page", html: result.content, text, author: result.author,
    } : undefined,
    images: [...new Map(images.map((img) => [img.url, img])).values()],
  };
}

function mountImageButton() {
  const style = document.createElement("style");
  style.textContent = `
    [data-linkpouch-positioned] { position: relative; }
    #linkpouch-download {
      all: initial; position: absolute; top: 8px; right: 8px; z-index: 10;
      box-sizing: border-box; min-height: 40px; padding: 9px 13px;
      border: 1px solid #ffffff40; border-radius: 24px;
      background: #0f1419e6; color: #fff; font: 600 13px/20px system-ui;
      cursor: pointer; opacity: 0; pointer-events: none;
    }
    [data-linkpouch-images]:hover > #linkpouch-download,
    [data-linkpouch-images]:focus-within > #linkpouch-download,
    #linkpouch-download:disabled { opacity: 1; pointer-events: auto; }
    #linkpouch-download:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }
    #linkpouch-download:disabled { cursor: wait; }
  `;
  document.head.append(style);
  const button = document.createElement("button");
  button.id = "linkpouch-download";
  button.title = "保存这条帖子的图片 / Save post images";
  button.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    button.textContent = "…";
    try {
      const response = await chrome.runtime.sendMessage({ type: "DOWNLOAD_POST_IMAGES" });
      button.textContent = response.ok ? "✓ 已提交" : response.error;
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
    }
  };
  button.onkeydown = (event) => event.stopPropagation();
  let imageGroup: HTMLElement | undefined;
  let postKey = "";
  const update = () => {
    const postId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    const tweet = postId ? [...document.querySelectorAll('article[data-testid="tweet"]')]
      .find((article) => article.querySelector(`a[href$="/status/${postId}"] time`)) : undefined;
    const images = [...(tweet?.querySelectorAll('[data-testid="tweetPhoto"] img') ?? [])];
    let group = images[0]?.closest<HTMLElement>('[data-testid="tweetPhoto"]');
    while (group && !images.every((image) => group!.contains(image))) group = group.parentElement;
    const nextKey = `${postId}:${images.length}`;
    if (group !== imageGroup) {
      imageGroup?.removeAttribute("data-linkpouch-images");
      imageGroup?.removeAttribute("data-linkpouch-positioned");
      button.remove();
      imageGroup = group ?? undefined;
      if (imageGroup) {
        if (getComputedStyle(imageGroup).position === "static") imageGroup.setAttribute("data-linkpouch-positioned", "");
        imageGroup.setAttribute("data-linkpouch-images", "");
        imageGroup.append(button);
      }
      postKey = "";
    }
    if (nextKey !== postKey) {
      postKey = nextKey;
      button.textContent = `↓ 收图 · ${images.length}`;
    }
  };
  new MutationObserver(update).observe(document.body, { childList: true, subtree: true });
  update();
}

const scope = globalThis as typeof globalThis & { linkPouchContentLoaded?: boolean };
if (!scope.linkPouchContentLoaded) {
  scope.linkPouchContentLoaded = true;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type !== "EXTRACT_PAGE") return;
    void extractPage(message.useSelection).then(
      (page) => respond({ ok: true, page }),
      (error: Error) => respond({ ok: false, error: error.message }),
    );
    return true;
  });
  if (/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(location.hostname)) mountImageButton();
}
