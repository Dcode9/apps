'use strict';

/**
 * uiController.js
 * Manages all DOM updates: sound-button grid, SVG ring progress animations,
 * drag-and-drop onto the timeline, the right-click context menu,
 * hotkey mapping, and localStorage persistence.
 */

const HOTKEYS = [
  '1','2','3','4','5','6','7','8','9','0',
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',
  'z','x','c','v','b','n','m',
];

class UIController {
  constructor(audioEngine, sequencer) {
    this.audioEngine     = audioEngine;
    this.sequencer       = sequencer;
    this.soundButtonMap  = new Map();   // soundId → wrapper element
    this.hotkeyMap       = new Map();   // key char → soundId
    this._contextTarget  = null;        // soundId for right-click menu
    this._rafId          = null;
    this.queueMode       = false;
  }

  /* ── Public Init ─────────────────────────────────────────── */

  init() {
    this._bindHeader();
    this._bindContextMenu();
    this._bindSequencer();
    this._startRenderLoop();
  }

  /* ── Build Sound Grid ────────────────────────────────────── */

  buildSoundGrid(sounds) {
    const grid = document.getElementById('soundboard-grid');
    grid.innerHTML = '';
    this.soundButtonMap.clear();
    this.hotkeyMap.clear();

    if (!sounds || sounds.length === 0) {
      document.getElementById('error-state').classList.remove('hidden');
      grid.classList.add('hidden');
      return;
    }

    document.getElementById('error-state').classList.add('hidden');
    grid.classList.remove('hidden');

    sounds.forEach((sound, idx) => {
      const hotkey = HOTKEYS[idx] || null;
      if (hotkey) this.hotkeyMap.set(hotkey.toLowerCase(), sound.id);

      const wrapper = this._createSoundButton(sound, hotkey);
      this.soundButtonMap.set(sound.id, wrapper);
      grid.appendChild(wrapper);
    });
  }

  _createSoundButton(sound, hotkey) {
    const R            = 44;   // SVG circle radius (viewBox is 0 0 100 100)
    const circumference = 2 * Math.PI * R;

    const wrapper = document.createElement('div');
    wrapper.className = 'sound-btn-wrapper';
    wrapper.dataset.soundId = sound.id;
    wrapper.draggable = true;

    wrapper.innerHTML = `
      <div class="sound-btn"
           id="btn-${sound.id}"
           tabindex="0"
           role="button"
           aria-label="${this._esc(sound.name)}${hotkey ? ' [' + hotkey.toUpperCase() + ']' : ''}">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle class="ring-bg"       cx="50" cy="50" r="${R}"/>
          <circle class="ring-progress" cx="50" cy="50" r="${R}"
                  stroke="${sound.color}"
                  stroke-dasharray="${circumference.toFixed(3)}"
                  stroke-dashoffset="${circumference.toFixed(3)}"/>
        </svg>
        <div class="btn-inner">
          <span class="btn-icon">${sound.icon || '🔊'}</span>
          <span class="btn-label">${this._esc(sound.name)}</span>
        </div>
        ${hotkey ? `<span class="btn-hotkey" aria-hidden="true">${hotkey.toUpperCase()}</span>` : ''}
      </div>
      <button class="loop-toggle" id="loop-${sound.id}" title="Toggle loop" aria-label="Loop ${this._esc(sound.name)}">⟳</button>
      <span class="sound-name" aria-hidden="true">${this._esc(sound.name)}</span>
    `;

    const btn      = wrapper.querySelector('.sound-btn');
    const loopBtn  = wrapper.querySelector('.loop-toggle');

    // Click / keyboard play
    btn.addEventListener('click',   () => this.onSoundActivate(sound.id));
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSoundActivate(sound.id); }
    });

    // Right-click context menu
    btn.addEventListener('contextmenu', e => { e.preventDefault(); this._showContextMenu(e, sound.id); });

    // Loop toggle
    loopBtn.addEventListener('click', e => { e.stopPropagation(); this._toggleLoop(sound.id); });

    // Drag onto timeline
    wrapper.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/soundId',       sound.id);
      e.dataTransfer.setData('text/soundName',     sound.name);
      e.dataTransfer.setData('text/soundDuration', String(sound.buffer ? sound.buffer.duration : 1));
      e.dataTransfer.effectAllowed = 'copy';
      wrapper.classList.add('dragging');
    });
    wrapper.addEventListener('dragend', () => wrapper.classList.remove('dragging'));

    return wrapper;
  }

  /* ── Sound Activation (public) ──────────────────────────── */

  onSoundActivate(soundId) {
    if (this.queueMode) {
      const sound = this.audioEngine.sounds.find(s => s.id === soundId);
      if (sound) {
        this.sequencer.addBlock(soundId, sound.name, sound.buffer.duration, sound.color);
        this._flashButton(soundId);
      }
      return;
    }

    const sound = this.audioEngine.sounds.find(s => s.id === soundId);
    if (!sound) return;

    if (sound.loop) {
      // Loop-mode: first click starts, second click stops
      if (this.audioEngine.isPlaying(soundId)) {
        this.audioEngine.stopSound(soundId);
      } else {
        this.audioEngine.play(soundId);
      }
    } else {
      this.audioEngine.play(soundId);
    }
  }

  _flashButton(soundId) {
    const btn = document.getElementById(`btn-${soundId}`);
    if (!btn) return;
    // Use CSS variable for accent colour (set as custom property on the element)
    btn.style.setProperty('outline', '2px solid var(--accent)');
    setTimeout(() => { btn.style.removeProperty('outline'); }, 180);
  }

  /* ── Loop Toggle ─────────────────────────────────────────── */

  _toggleLoop(soundId) {
    const looping = this.audioEngine.toggleLoop(soundId);
    document.getElementById(`loop-${soundId}`)?.classList.toggle('active', looping);
    document.getElementById(`btn-${soundId}`)?.classList.toggle('looping', looping);
    // Stop a currently-playing sound if loop was switched off
    if (!looping && this.audioEngine.isPlaying(soundId)) {
      this.audioEngine.stopSound(soundId);
    }
    this.saveSettings();
  }

  /* ── Header Bindings ─────────────────────────────────────── */

  _bindHeader() {
    const masterSlider  = document.getElementById('master-volume');
    const masterDisplay = document.getElementById('master-volume-display');

    masterSlider.addEventListener('input', () => {
      const v = parseFloat(masterSlider.value);
      this.audioEngine.setMasterVolume(v);
      masterDisplay.textContent = `${Math.round(v * 100)}%`;
      this.saveSettings();
    });

    document.getElementById('panic-btn').addEventListener('click', () => {
      this.audioEngine.stopAll();
      this.sequencer.stop();
      this._updateSeqPlayBtn();
    });

    document.getElementById('queue-mode-btn').addEventListener('click', () => {
      this.queueMode = !this.queueMode;
      document.getElementById('queue-mode-btn').classList.toggle('active', this.queueMode);
    });

    document.getElementById('loop-timeline-btn').addEventListener('click', () => {
      const looping = this.sequencer.toggleLoop();
      document.getElementById('loop-timeline-btn').classList.toggle('active', looping);
      this.saveSettings();
    });
  }

  /* ── Context Menu ────────────────────────────────────────── */

  _bindContextMenu() {
    const volSlider  = document.getElementById('context-volume');
    const volDisplay = document.getElementById('context-volume-display');
    const loopCheck  = document.getElementById('context-loop');

    volSlider.addEventListener('input', () => {
      if (!this._contextTarget) return;
      const v = parseFloat(volSlider.value);
      this.audioEngine.setSoundGain(this._contextTarget, v);
      volDisplay.textContent = `${Math.round(v * 100)}%`;
      this.saveSettings();
    });

    loopCheck.addEventListener('change', () => {
      if (!this._contextTarget) return;
      const sound = this.audioEngine.sounds.find(s => s.id === this._contextTarget);
      if (sound && sound.loop !== loopCheck.checked) {
        this._toggleLoop(this._contextTarget);
      }
    });

    document.getElementById('context-add-to-timeline').addEventListener('click', () => {
      if (!this._contextTarget) return;
      const sound = this.audioEngine.sounds.find(s => s.id === this._contextTarget);
      if (sound) {
        this.sequencer.addBlock(sound.id, sound.name, sound.buffer.duration, sound.color);
        this.saveSettings();
      }
      this._hideContextMenu();
    });

    document.getElementById('context-close').addEventListener('click', () => this._hideContextMenu());

    // Dismiss on outside click or Escape
    document.addEventListener('click', e => {
      const menu = document.getElementById('context-menu');
      if (!menu.classList.contains('hidden') && !menu.contains(e.target)) {
        this._hideContextMenu();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this._hideContextMenu();
    });
  }

  _showContextMenu(event, soundId) {
    const sound = this.audioEngine.sounds.find(s => s.id === soundId);
    if (!sound) return;
    this._contextTarget = soundId;

    document.getElementById('context-sound-name').textContent  = sound.name;
    document.getElementById('context-volume').value            = sound.gain;
    document.getElementById('context-volume-display').textContent = `${Math.round(sound.gain * 100)}%`;
    document.getElementById('context-loop').checked            = sound.loop;

    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    const x = Math.min(event.clientX, window.innerWidth  - 224);
    const y = Math.min(event.clientY, window.innerHeight - 180);
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;
  }

  _hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    this._contextTarget = null;
  }

  /* ── Sequencer UI ────────────────────────────────────────── */

  _bindSequencer() {
    document.getElementById('seq-play-btn').addEventListener('click', () => {
      if (this.sequencer.isPlaying) {
        this.sequencer.pause();
      } else {
        this.sequencer.play();
      }
      this._updateSeqPlayBtn();
    });

    document.getElementById('seq-stop-btn').addEventListener('click', () => {
      this.sequencer.stop();
      this._updateSeqPlayBtn();
    });

    document.getElementById('seq-clear-btn').addEventListener('click', () => {
      this.sequencer.blocks = [];
      this.sequencer.stop();
      this._updateSeqPlayBtn();
      this._renderTimeline();
      this.saveSettings();
    });

    document.getElementById('bpm-input').addEventListener('change', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 40 && v <= 400) {
        this.sequencer.pixelsPerSecond = v;
        this._renderTimeline();
        this.saveSettings();
      }
    });

    // Timeline drag-and-drop (consolidated handler)
    const track = document.getElementById('timeline-track');
    const onDragOver = e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      track.classList.add('drag-over');
    };
    const onDragLeave = e => {
      if (!track.contains(e.relatedTarget)) track.classList.remove('drag-over');
    };
    track.addEventListener('dragover',  onDragOver);
    track.addEventListener('dragleave', onDragLeave);
    track.addEventListener('drop',      e => this._onTimelineDrop(e));

    // Wire callbacks from Sequencer → re-render
    this.sequencer.onUpdate    = () => this._renderTimeline();
    this.sequencer.onBlockPlay = block => {
      const wrapper = this.soundButtonMap.get(block.soundId);
      if (!wrapper) return;
      const btn = wrapper.querySelector('.sound-btn');
      if (btn) {
        btn.classList.add('playing');
        setTimeout(() => btn.classList.remove('playing'), Math.min(block.duration * 1000, 800));
      }
    };
  }

  _onTimelineDrop(e) {
    e.preventDefault();
    document.getElementById('timeline-track').classList.remove('drag-over');
    const track = document.getElementById('timeline-track');

    // Re-positioning an existing timeline block?
    const blockId = e.dataTransfer.getData('text/blockId');
    if (blockId) {
      const offset   = parseFloat(e.dataTransfer.getData('text/blockOffset') || '0');
      const rect     = track.getBoundingClientRect();
      const x        = e.clientX - rect.left + track.parentElement.scrollLeft - offset;
      this.sequencer.moveBlock(blockId, this.sequencer.pixelToTime(x));
      this.saveSettings();
      return;
    }

    // New sound dropped from the grid?
    const soundId  = e.dataTransfer.getData('text/soundId');
    if (soundId) {
      const dur   = parseFloat(e.dataTransfer.getData('text/soundDuration') || '1');
      const sound = this.audioEngine.sounds.find(s => s.id === soundId);
      const rect  = track.getBoundingClientRect();
      const x     = e.clientX - rect.left + track.parentElement.scrollLeft;
      this.sequencer.addBlock(
        soundId,
        sound ? sound.name : (e.dataTransfer.getData('text/soundName') || 'Sound'),
        dur,
        sound ? sound.color : '#6c63ff',
        this.sequencer.pixelToTime(x)
      );
      this.saveSettings();
    }
  }

  /* ── Timeline Rendering ──────────────────────────────────── */

  _renderTimeline() {
    const track = document.getElementById('timeline-track');
    const ruler = document.getElementById('timeline-ruler');
    const hint  = document.getElementById('drop-zone-hint');

    hint.style.display = this.sequencer.blocks.length > 0 ? 'none' : 'flex';

    const totalDur = this.sequencer.duration;
    const pps      = this.sequencer.pixelsPerSecond;
    const minWidth = Math.max(800, (totalDur + 4) * pps);

    track.style.minWidth = `${minWidth}px`;
    ruler.style.minWidth = `${minWidth}px`;

    this._renderRuler(ruler, totalDur + 4, pps);

    // Remove old blocks (not the playhead or hint)
    track.querySelectorAll('.timeline-block').forEach(el => el.remove());

    this.sequencer.blocks.forEach(block => this._renderBlock(track, block));

    this._updateSeqPlayBtn();
    this._updatePlayhead();
  }

  _renderRuler(ruler, seconds, pps) {
    ruler.innerHTML = '';
    for (let t = 0; t <= seconds; t += 0.5) {
      const x     = t * pps;
      const major = (t % 2 === 0);
      const mark  = document.createElement('div');
      mark.className      = `ruler-mark ${major ? 'major' : 'minor'}`;
      mark.style.left     = `${x}px`;
      ruler.appendChild(mark);

      if (major) {
        const lbl = document.createElement('div');
        lbl.className   = 'ruler-label';
        lbl.style.left  = `${x}px`;
        lbl.textContent = `${t}s`;
        ruler.appendChild(lbl);
      }
    }
  }

  _renderBlock(track, block) {
    const pps   = this.sequencer.pixelsPerSecond;
    const x     = block.startTime * pps;
    const w     = Math.max(56, block.duration * pps);

    const el = document.createElement('div');
    el.className    = 'timeline-block';
    el.id           = `tblk-${block.id}`;
    el.style.left   = `${x}px`;
    el.style.width  = `${w}px`;
    el.style.borderColor  = block.color;
    el.style.background   = block.color + '28';
    el.style.color        = block.color;

    if (this.sequencer._playingBlocks.has(block.id)) el.classList.add('playing');

    el.innerHTML = `<span>${this._esc(block.name)}</span>
      <button class="block-remove" title="Remove block" aria-label="Remove ${this._esc(block.name)}">×</button>`;

    el.querySelector('.block-remove').addEventListener('click', ev => {
      ev.stopPropagation();
      this.sequencer.removeBlock(block.id);
      this.saveSettings();
    });

    // Allow dragging blocks within the timeline to reorder
    el.draggable = true;
    el.addEventListener('dragstart', ev => {
      ev.stopPropagation();
      const offset = ev.clientX - el.getBoundingClientRect().left;
      ev.dataTransfer.setData('text/blockId',     block.id);
      ev.dataTransfer.setData('text/blockOffset', String(offset));
      ev.dataTransfer.effectAllowed = 'move';
    });

    track.appendChild(el);
  }

  _updatePlayhead() {
    const ph = document.getElementById('playhead');
    if (ph) ph.style.left = `${this.sequencer.timeToPixel(this.sequencer.playheadTime)}px`;
  }

  _updateSeqPlayBtn() {
    const btn = document.getElementById('seq-play-btn');
    if (btn) btn.textContent = this.sequencer.isPlaying ? '⏸ Pause' : '▶ Play';
  }

  /* ── Render Loop (60 FPS via rAF) ────────────────────────── */

  _startRenderLoop() {
    const loop = () => {
      // Update progress rings for each sound button
      this.soundButtonMap.forEach((wrapper, soundId) => {
        const btn = wrapper.querySelector('.sound-btn');
        if (!btn) return;

        const progress  = this.audioEngine.getProgress(soundId);
        const isPlaying = progress !== null;

        btn.classList.toggle('playing', isPlaying);

        const ring = btn.querySelector('.ring-progress');
        if (ring) {
          const R            = 44;
          const circumference = 2 * Math.PI * R;
          ring.style.strokeDashoffset = isPlaying
            ? String(circumference * (1 - progress))
            : String(circumference);
        }
      });

      // Live playhead & block highlights while sequencer is running
      if (this.sequencer.isPlaying) {
        this._updatePlayhead();
        const track = document.getElementById('timeline-track');
        if (track) {
          track.querySelectorAll('.timeline-block').forEach(el => {
            const id = el.id.replace('tblk-', '');
            el.classList.toggle('playing', this.sequencer._playingBlocks.has(id));
          });
        }
      }

      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /* ── State Persistence (public) ─────────────────────────── */

  saveSettings() {
    try {
      const gains = {}, loops = {};
      this.audioEngine.sounds.forEach(s => {
        gains[s.id] = s.gain;
        loops[s.id] = s.loop;
      });
      const state = {
        masterVolume:   parseFloat(document.getElementById('master-volume').value),
        soundGains:     gains,
        soundLoops:     loops,
        sequencerState: this.sequencer.saveState(),
      };
      localStorage.setItem('soundboard-settings', JSON.stringify(state));
    } catch (e) {
      console.warn('[UIController] Could not save settings:', e);
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('soundboard-settings');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  applySettings(settings) {
    if (!settings) return;

    if (settings.masterVolume !== undefined) {
      const v = parseFloat(settings.masterVolume);
      document.getElementById('master-volume').value       = v;
      document.getElementById('master-volume-display').textContent = `${Math.round(v * 100)}%`;
      this.audioEngine.setMasterVolume(v);
    }

    if (settings.soundGains) {
      Object.entries(settings.soundGains).forEach(([id, g]) => {
        this.audioEngine.setSoundGain(id, g);
      });
    }

    if (settings.soundLoops) {
      Object.entries(settings.soundLoops).forEach(([id, shouldLoop]) => {
        const sound = this.audioEngine.sounds.find(s => s.id === id);
        if (sound && sound.loop !== shouldLoop) {
          this._toggleLoop(id);
        }
      });
    }

    if (settings.sequencerState) {
      this.sequencer.loadState(settings.sequencerState);
      document.getElementById('loop-timeline-btn').classList.toggle('active', this.sequencer.isLooping);
      const pps = settings.sequencerState.pixelsPerSecond;
      if (pps) {
        document.getElementById('bpm-input').value = pps;
      }
      this._renderTimeline();
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  /** Basic HTML-entity escaping to prevent XSS when inserting user-controlled strings. */
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
