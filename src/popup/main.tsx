import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { sendMessage } from "../chrome";
import type { CaptureOutcome } from "../messages";
import { DEFAULT_SETTINGS, type Settings } from "../domain";
import { captureOutcomeLabel, t } from "../i18n";
import { applyTheme } from "../theme";
import { isImeInput } from "./ime";
import "./popup.css";

function Popup() {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const compositionActive = useRef(false);
  const chordTimer = useRef<number | undefined>(undefined);
  const [itemId, setItemId] = useState<string>();
  const [sourceTabId, setSourceTabId] = useState<number>();
  const [title, setTitle] = useState(t(DEFAULT_SETTINGS.language, "popup.capturing"));
  const [domain, setDomain] = useState("");
  const [note, setNote] = useState("");
  const [settings, setSettings] = useState<Settings>();
  const [outcome, setOutcome] = useState<CaptureOutcome>("created");
  const [chord, setChord] = useState(false);
  const [error, setError] = useState<string>();
  const language = settings?.language ?? DEFAULT_SETTINGS.language;

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    localStorage.setItem("popupScale", String(settings.popupScale ?? DEFAULT_SETTINGS.popupScale));
  }, [settings]);

  useEffect(() => {
    void sendMessage({ type: "CAPTURE_ACTIVE_TAB" }).then((response) => {
      if (!response.ok || !response.item || !response.session || !response.settings) {
        setError(response.ok ? t(DEFAULT_SETTINGS.language, "popup.captureReadFailed") : response.error);
        return;
      }
      setItemId(response.item.id);
      setSourceTabId(response.session.sourceTabId);
      setTitle(response.item.title);
      setDomain(response.item.domain);
      setNote(response.item.note);
      setSettings(response.settings);
      setOutcome(response.session.outcome ?? "created");
      requestAnimationFrame(() => textarea.current?.focus());
    });
    return () => window.clearTimeout(chordTimer.current);
  }, []);

  function insertPreset(index: number) {
    const preset = settings?.presets[index];
    if (!preset || !textarea.current) return;
    const input = textarea.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const before = note.slice(0, start);
    const separator = before && !/\s$/.test(before) ? " " : "";
    const next = `${before}${separator}${preset}${note.slice(end)}`;
    const caret = start + separator.length + preset.length;
    setNote(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }

  async function confirm() {
    if (!itemId) return;
    const response = await sendMessage({ type: "CONFIRM_CAPTURE", itemId, note, sourceTabId });
    if (!response.ok) {
      setError(response.error);
      return;
    }
    window.close();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isImeInput(event.nativeEvent, compositionActive.current)) return;

    if (chord) {
      event.preventDefault();
      setChord(false);
      window.clearTimeout(chordTimer.current);
      if (/^[1-9]$/.test(event.key)) insertPreset(Number(event.key) - 1);
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      setChord(true);
      chordTimer.current = window.setTimeout(() => setChord(false), 2000);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      window.close();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void confirm();
    }
  }

  if (error) {
    return <main className="popup error-state"><div className="capture-mark error">!</div><h1>{t(language, "popup.captureFailed")}</h1><p>{error}</p><button onClick={() => window.close()}>{t(language, "popup.cancel")}</button></main>;
  }

  return (
    <main className="popup">
      <header aria-label={captureOutcomeLabel(language, outcome)}>
        <img className="app-icon" src="/icon.png" alt="" />
        <div className="capture-copy"><strong title={title}>{title}</strong><small>{domain}</small></div>
      </header>
      <textarea
        ref={textarea}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onCompositionStart={() => { compositionActive.current = true; }}
        onCompositionEnd={() => { compositionActive.current = false; }}
        onKeyDown={onKeyDown}
        placeholder={t(language, "popup.notePlaceholder")}
        aria-label={t(language, "popup.noteLabel")}
      />
      {settings?.presets.some(Boolean) && <section className="preset-list" aria-label={t(language, "popup.presetNotes")}>
        <div className="preset-title"><span><i aria-hidden="true">✦</i>{t(language, "popup.presetNotes")}</span><small>{t(language, "popup.presetHelp")}</small></div>
        <div className="preset-buttons">{settings.presets.map((preset, index) => preset && <button key={index} onClick={() => insertPreset(index)} title={preset}><kbd>{index + 1}</kbd><span>{preset}</span></button>)}</div>
      </section>}
      <footer>
        <span className={chord ? "chord active" : "chord"}>{chord ? t(language, "popup.choosePreset") : <><kbd>Esc</kbd> {t(language, "popup.cancel")}</>}</span>
        <span><kbd>⇧↵</kbd> {t(language, "popup.newline")}　 <kbd>↵</kbd> {t(language, "popup.save")}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Popup /></React.StrictMode>);
