'use strict';

/**
 * sequencer.js
 * Timeline sequencer: manages blocks, playhead, queue mode and loop state.
 * Audio scheduling is intentionally handled by calling audioEngine.play()
 * at the moment the playhead crosses each block's start time, so no
 * WebAudio lookahead is needed.
 */
class Sequencer {
  constructor(audioEngine) {
    this.audioEngine   = audioEngine;
    this.blocks        = [];      // [{id, soundId, name, startTime, duration, color}]
    this.isPlaying     = false;
    this.isLooping     = false;
    this.playheadTime  = 0;       // seconds into the timeline

    this._startWallTime    = 0;   // AudioContext.currentTime when play was pressed
    this._startPlayheadPos = 0;   // playheadTime value when play was pressed
    this._playingBlocks    = new Set(); // block ids whose audio has been triggered
    this._nextId           = 0;
    this._rafId            = null;

    this.pixelsPerSecond = 100;   // timeline zoom / scale

    // Callbacks populated by UIController
    this.onUpdate    = null;      // () => void — re-render timeline
    this.onBlockPlay = null;      // (block) => void — a block just started
  }

  /* ── Duration ────────────────────────────────────────────── */

  get duration() {
    if (this.blocks.length === 0) return 0;
    return Math.max(...this.blocks.map(b => b.startTime + b.duration));
  }

  /* ── Block Management ────────────────────────────────────── */

  addBlock(soundId, name, duration, color, insertTime) {
    const id = `blk-${this._nextId++}`;
    const startTime = (insertTime !== undefined) ? Math.max(0, insertTime) : this.duration;
    const block = { id, soundId, name, startTime, duration: duration || 1, color: color || '#6c63ff' };
    this.blocks.push(block);
    this.blocks.sort((a, b) => a.startTime - b.startTime);
    if (this.onUpdate) this.onUpdate();
    return block;
  }

  removeBlock(blockId) {
    this.blocks = this.blocks.filter(b => b.id !== blockId);
    this._playingBlocks.delete(blockId);
    if (this.onUpdate) this.onUpdate();
  }

  moveBlock(blockId, newStartTime) {
    const block = this.blocks.find(b => b.id === blockId);
    if (!block) return;
    block.startTime = Math.max(0, newStartTime);
    // A moved block that's currently "playing" may no longer be under the playhead
    this._playingBlocks.delete(blockId);
    this.blocks.sort((a, b) => a.startTime - b.startTime);
    if (this.onUpdate) this.onUpdate();
  }

  /* ── Transport ───────────────────────────────────────────── */

  play() {
    if (this.isPlaying || this.blocks.length === 0) return;
    this.isPlaying          = true;
    this._startWallTime     = this.audioEngine.context.currentTime;
    this._startPlayheadPos  = this.playheadTime;
    this._tick();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this.audioEngine.stopAll();
    this._playingBlocks.clear();
    if (this.onUpdate) this.onUpdate();
  }

  stop() {
    this.pause();
    this.playheadTime = 0;
    if (this.onUpdate) this.onUpdate();
  }

  toggleLoop() {
    this.isLooping = !this.isLooping;
    return this.isLooping;
  }

  /* ── Internal tick (called every animation frame) ─────────── */

  _tick() {
    if (!this.isPlaying) return;

    const elapsed  = this.audioEngine.context.currentTime - this._startWallTime;
    this.playheadTime = this._startPlayheadPos + elapsed;

    const total = this.duration;

    if (total > 0 && this.playheadTime >= total) {
      if (this.isLooping) {
        this._startWallTime    = this.audioEngine.context.currentTime;
        this._startPlayheadPos = 0;
        this.playheadTime      = 0;
        this._playingBlocks.clear();
        this.audioEngine.stopAll();
      } else {
        this.isPlaying    = false;
        this.playheadTime = total;
        this._playingBlocks.clear();
        if (this.onUpdate) this.onUpdate();
        return;
      }
    }

    // Trigger blocks whose start time we just passed
    const t = this.playheadTime;
    this.blocks.forEach(block => {
      const within = t >= block.startTime && t < block.startTime + block.duration;
      if (within && !this._playingBlocks.has(block.id)) {
        this._playingBlocks.add(block.id);
        this.audioEngine.play(block.soundId);
        if (this.onBlockPlay) this.onBlockPlay(block);
      }
      if (!within && this._playingBlocks.has(block.id)) {
        this._playingBlocks.delete(block.id);
      }
    });

    // Playhead movement is animated by UIController's own rAF loop;
    // only notify structural changes (add/remove/move/stop) via onUpdate.
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /* ── Coordinate helpers ──────────────────────────────────── */

  pixelToTime(px) { return px / this.pixelsPerSecond; }
  timeToPixel(t)  { return t  * this.pixelsPerSecond; }

  /* ── Persistence ─────────────────────────────────────────── */

  saveState() {
    return {
      blocks: this.blocks.map(({ soundId, name, startTime, duration, color }) =>
        ({ soundId, name, startTime, duration, color })
      ),
      isLooping:       this.isLooping,
      pixelsPerSecond: this.pixelsPerSecond,
    };
  }

  loadState(state) {
    if (!state) return;
    this.blocks = (state.blocks || []).map(b => ({
      id: `blk-${this._nextId++}`,
      ...b,
    }));
    this.isLooping       = !!state.isLooping;
    this.pixelsPerSecond = state.pixelsPerSecond || 100;
    if (this.onUpdate) this.onUpdate();
  }
}
