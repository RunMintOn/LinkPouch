(() => {
  const stored = Number(localStorage.getItem("popupScale"));
  const scale = Number.isFinite(stored) ? Math.min(1, Math.max(0.8, stored)) : 0.9;
  document.documentElement.style.setProperty("--popup-scale", String(scale));
})();
