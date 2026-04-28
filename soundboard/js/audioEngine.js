'use strict';

/**
 * audioEngine.js
 * Manages the Web Audio API context, buffer loading/decoding,
 * polyphonic playback, per-sound gain, looping and progress tracking.
 */
class AudioEngine {
  constructor() {
    this.context    = null;
    this.masterGain = null;
    this.sounds     = [];                // [{id, name, buffer, gain, loop, color, icon}]
    this.activeSources = new Map();      // soundId → [playback obj]
    this._initialized  = false;
    this._rafId        = null;
  }

  /* ── Initialisation ──────────────────────────────────────── */

  async init() {
    if (this._initialized) return;
    this.context    = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.context.destination);
    this._initialized = true;
    this._startCleanupLoop();
  }

  async resume() {
    if (this.context && this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /* ── Master Volume ──────────────────────────────────────── */

  setMasterVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(2, value));
    }
  }

  /* ── Sound Loading ──────────────────────────────────────── */

  /**
   * Load sounds from a manifest array: [{name, url}].
   * Falls back to synthesised demo sounds if manifest is empty or all fetches fail.
   */
  async loadSounds(manifest) {
    const loaded = [];

    if (Array.isArray(manifest) && manifest.length > 0) {
      const results = await Promise.all(
        manifest.map((item, idx) => this._fetchSound(item, idx))
      );
      loaded.push(...results.filter(Boolean));
    }

    if (loaded.length === 0) {
      loaded.push(...this._generateDemoSounds());
    }

    this.sounds = loaded;
    return this.sounds;
  }

  async _fetchSound(item, idx) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab  = await res.arrayBuffer();
      const buf = await this.context.decodeAudioData(ab);
      return {
        id:    `sound-${idx}`,
        name:  item.name || `Sound ${idx + 1}`,
        buffer: buf,
        gain:  1.0,
        loop:  false,
        color: this._color(idx),
        icon:  this._icon(idx),
      };
    } catch (err) {
      console.warn(`[AudioEngine] Failed to load "${item.url}":`, err.message);
      return null;
    }
  }

  /* ── Demo Sound Synthesis ───────────────────────────────── */

  _generateDemoSounds() {
    const specs = [
      { name: 'Kick',  freq:  60, decay: 0.55, kind: 'kick',  icon: '🥁' },
      { name: 'Snare', freq: 180, decay: 0.22, kind: 'snare', icon: '🔊' },
      { name: 'Hi-Hat',freq: 900, decay: 0.10, kind: 'hihat', icon: '🎵' },
      { name: 'Clap',  freq:1100, decay: 0.14, kind: 'clap',  icon: '👏' },
      { name: 'Bass',  freq:  80, decay: 0.80, kind: 'bass',  icon: '🎸' },
      { name: 'Lead',  freq: 440, decay: 0.60, kind: 'lead',  icon: '🎹' },
      { name: 'Pad',   freq: 220, decay: 1.20, kind: 'pad',   icon: '🌊' },
      { name: 'FX',    freq: 600, decay: 0.40, kind: 'fx',    icon: '⚡' },
      { name: 'Perc',  freq: 300, decay: 0.28, kind: 'perc',  icon: '🔔' },
      { name: 'Chord', freq: 261, decay: 1.00, kind: 'chord', icon: '🎶' },
      { name: 'Arp',   freq: 523, decay: 0.70, kind: 'arp',   icon: '🌟' },
      { name: 'Vox',   freq: 380, decay: 0.55, kind: 'vox',   icon: '🎤' },
    ];

    return specs.map((s, idx) => ({
      id:     `demo-${idx}`,
      name:   s.name,
      buffer: this._synthBuffer(s.freq, s.decay, s.kind),
      gain:   1.0,
      loop:   false,
      color:  this._color(idx),
      icon:   s.icon,
      isDemo: true,
    }));
  }

  _synthBuffer(freq, decay, kind) {
    const sr     = this.context.sampleRate;
    const dur    = Math.min(decay * 2.2, 2.5);
    const len    = Math.floor(sr * dur);
    const buffer = this.context.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      let prev = 0;

      for (let i = 0; i < len; i++) {
        const t   = i / sr;
        const env = Math.exp(-t / decay);
        let s = 0;

        switch (kind) {
          case 'kick': {
            const f = freq * Math.exp(-t * 42);
            s = Math.sin(2 * Math.PI * f * t) * env;
            if (t < 0.006) s += (Math.random() * 2 - 1) * 0.5 * (1 - t / 0.006);
            break;
          }
          case 'snare':
            s = (Math.random() * 2 - 1) * 0.55 * env +
                Math.sin(2 * Math.PI * freq * t) * env * 0.45;
            break;
          case 'hihat': {
            // Simple white-noise high-pass approximation
            const n = (Math.random() * 2 - 1) * env;
            s = n - prev * 0.8;
            prev = n;
            break;
          }
          case 'clap':
            s = (Math.random() * 2 - 1) * Math.exp(-t * 32);
            if (t < 0.012) s += (Math.random() * 2 - 1) * 0.8;
            break;
          case 'bass':
            s = Math.sin(2 * Math.PI * freq * t) * env +
                Math.sin(2 * Math.PI * freq * 2 * t) * env * 0.3;
            break;
          case 'lead': {
            const phase = (freq * t) % 1;
            s = (phase * 2 - 1) * env;
            break;
          }
          case 'pad':
            s = (Math.sin(2 * Math.PI * freq * t) * 0.6 +
                 Math.sin(2 * Math.PI * freq * 1.501 * t) * 0.28 +
                 Math.sin(2 * Math.PI * freq * 2 * t) * 0.14) * env;
            break;
          case 'fx': {
            const mod = Math.sin(2 * Math.PI * 8 * t);
            s = Math.sin(2 * Math.PI * (freq + mod * 200) * t) * env;
            break;
          }
          case 'perc': {
            const fp = freq * (1 + Math.exp(-t * 22) * 3);
            s = Math.sin(2 * Math.PI * fp * t) * env +
                (Math.random() * 2 - 1) * env * 0.18;
            break;
          }
          case 'chord': {
            [freq, freq * 1.25, freq * 1.5].forEach(f => {
              s += Math.sin(2 * Math.PI * f * t) * env / 3;
            });
            break;
          }
          case 'arp': {
            const steps = [freq, freq * 1.25, freq * 1.5, freq * 2];
            const si    = Math.floor(t * 8) % steps.length;
            s = Math.sin(2 * Math.PI * steps[si] * t) * env;
            break;
          }
          case 'vox':
            s = (Math.sin(2 * Math.PI * freq * t) +
                 Math.sin(2 * Math.PI * freq * 2.02 * t) * 0.38 +
                 Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.18 +
                 (Math.random() * 2 - 1) * 0.02) * env;
            break;
          default:
            s = Math.sin(2 * Math.PI * freq * t) * env;
        }

        d[i] = Math.max(-1, Math.min(1, s * 0.72));
      }
    }
    return buffer;
  }

  _color(idx) {
    const palette = [
      '#6c63ff','#48c6ef','#f093fb','#f5576c',
      '#4facfe','#43e97b','#fa709a','#fee140',
      '#a18cd1','#84fab0','#ffecd2','#e0c3fc',
    ];
    return palette[idx % palette.length];
  }

  _icon(idx) {
    const icons = ['🔊','🎵','🎶','🎤','🥁','🎸','🎹','🌊','⚡','🔔','🌟','🎺'];
    return icons[idx % icons.length];
  }

  /* ── Playback ────────────────────────────────────────────── */

  /**
   * Trigger a sound.  Returns a playback-descriptor object (or null).
   * Multiple simultaneous calls → polyphonic playback.
   */
  play(soundId) {
    const sound = this.sounds.find(s => s.id === soundId);
    if (!sound || !this.context) return null;

    const gainNode = this.context.createGain();
    gainNode.gain.value = sound.gain;
    gainNode.connect(this.masterGain);

    const source = this.context.createBufferSource();
    source.buffer = sound.buffer;
    source.loop   = sound.loop;
    source.connect(gainNode);
    source.start(0);

    const pb = {
      source,
      gainNode,
      startTime: this.context.currentTime,
      duration:  sound.buffer.duration,
      soundId,
      active:    true,
    };

    source.onended = () => {
      pb.active = false;
      try { gainNode.disconnect(); } catch (_) { /* ignore */ }
    };

    if (!this.activeSources.has(soundId)) {
      this.activeSources.set(soundId, []);
    }
    this.activeSources.get(soundId).push(pb);
    return pb;
  }

  /** Stop all active playback for one sound. */
  stopSound(soundId) {
    const pbs = this.activeSources.get(soundId);
    if (!pbs) return;
    pbs.forEach(pb => {
      if (pb.active) {
        try { pb.source.stop(); } catch (_) { /* ignore */ }
        pb.active = false;
        try { pb.gainNode.disconnect(); } catch (_) { /* ignore */ }
      }
    });
    this.activeSources.delete(soundId);
  }

  /** Stop every active sound ("panic button" logic). */
  stopAll() {
    this.activeSources.forEach((pbs) => {
      pbs.forEach(pb => {
        if (pb.active) {
          try { pb.source.stop(); } catch (_) { /* ignore */ }
          pb.active = false;
          try { pb.gainNode.disconnect(); } catch (_) { /* ignore */ }
        }
      });
    });
    this.activeSources.clear();
  }

  /** Set per-sound gain (0–2). */
  setSoundGain(soundId, value) {
    const sound = this.sounds.find(s => s.id === soundId);
    if (!sound) return;
    sound.gain = Math.max(0, Math.min(2, value));
    const pbs = this.activeSources.get(soundId);
    if (pbs) pbs.forEach(pb => { if (pb.active) pb.gainNode.gain.value = sound.gain; });
  }

  /** Toggle loop state for a sound.  Returns new state (bool). */
  toggleLoop(soundId) {
    const sound = this.sounds.find(s => s.id === soundId);
    if (!sound) return false;
    sound.loop = !sound.loop;
    const pbs = this.activeSources.get(soundId);
    if (pbs) pbs.forEach(pb => { if (pb.active) pb.source.loop = sound.loop; });
    return sound.loop;
  }

  /* ── Progress ────────────────────────────────────────────── */

  /**
   * Returns playback progress (0–1) for the most recent active playback,
   * or null if the sound is not playing.
   */
  getProgress(soundId) {
    const pbs = this.activeSources.get(soundId);
    if (!pbs || pbs.length === 0) return null;
    const active = pbs.filter(pb => pb.active);
    if (active.length === 0) return null;
    const latest  = active[active.length - 1];
    const elapsed = this.context.currentTime - latest.startTime;
    if (latest.source.loop) return (elapsed % latest.duration) / latest.duration;
    return Math.min(1, elapsed / latest.duration);
  }

  isPlaying(soundId) {
    const pbs = this.activeSources.get(soundId);
    return !!(pbs && pbs.some(pb => pb.active));
  }

  /* ── Internals ───────────────────────────────────────────── */

  _startCleanupLoop() {
    const run = () => {
      this.activeSources.forEach((pbs, id) => {
        const live = pbs.filter(pb => pb.active);
        if (live.length === 0) this.activeSources.delete(id);
        else this.activeSources.set(id, live);
      });
      this._rafId = requestAnimationFrame(run);
    };
    this._rafId = requestAnimationFrame(run);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.stopAll();
    if (this.context) this.context.close();
  }
}
