'use strict';

/**
 * app.js
 * Entry point: wires AudioEngine, Sequencer and UIController together,
 * handles AudioContext initialisation (requires user interaction) and
 * registers global keyboard shortcuts.
 */
(function () {
  const audioEngine = new AudioEngine();
  const sequencer   = new Sequencer(audioEngine);
  const ui          = new UIController(audioEngine, sequencer);

  let initialised = false;

  /* ── Initialise the full application ─────────────────────── */

  async function initApp() {
    if (initialised) return;
    initialised = true;

    // Remove one-time interaction listeners
    document.removeEventListener('click',   onInteraction);
    document.removeEventListener('keydown', onInteraction);

    // Swap overlay for app
    document.getElementById('audio-init-overlay').classList.replace('active', 'hidden');
    document.getElementById('app').classList.remove('hidden');

    // Boot audio
    await audioEngine.init();
    await audioEngine.resume();

    // Try to load a sounds manifest; fall back to demo sounds on any error
    let manifest = [];
    try {
      const res = await fetch('assets/sounds/sounds.json');
      if (res.ok) manifest = await res.json();
    } catch (_) {
      /* No manifest — demo sounds will be used */
    }

    const sounds = await audioEngine.loadSounds(manifest);

    // Build UI
    ui.init();
    ui.buildSoundGrid(sounds);

    // Restore saved workspace
    const saved = ui.loadSettings();
    if (saved) ui.applySettings(saved);

    // ── Global keyboard shortcuts ──────────────────────────
    document.addEventListener('keydown', e => {
      // Don't steal keypresses when the user is typing
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      // Space → panic (stop all)
      if (e.code === 'Space') {
        e.preventDefault();
        audioEngine.stopAll();
        sequencer.stop();
        document.getElementById('seq-play-btn').textContent = '▶ Play';
        return;
      }

      // Sound hotkeys
      const soundId = ui.hotkeyMap.get(key);
      if (soundId) {
        e.preventDefault();
        ui._onSoundActivate(soundId);
      }
    });

    // Auto-save on unload and every 30 s
    window.addEventListener('beforeunload', () => ui._saveSettings());
    setInterval(() => ui._saveSettings(), 30_000);
  }

  /* ── First-interaction listener ───────────────────────────── */

  function onInteraction() { initApp(); }

  // Explicit button
  document.getElementById('init-audio-btn').addEventListener('click', e => {
    e.stopPropagation();   // prevent duplicate fire from the document listener
    initApp();
  });

  // Any interaction also works (AudioContext requires a user gesture)
  document.addEventListener('click',   onInteraction);
  document.addEventListener('keydown', onInteraction);
}());
