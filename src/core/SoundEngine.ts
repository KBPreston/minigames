/**
 * Programmatic Sound Engine using Web Audio API
 * All sounds are synthesized - no audio files needed
 */

type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ToneConfig {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  decay?: number;
  detune?: number;
}

interface NoiseConfig {
  duration: number;
  gain?: number;
  attack?: number;
  decay?: number;
  filter?: {
    type: BiquadFilterType;
    frequency: number;
    Q?: number;
  };
}

class SoundEngineClass {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 50; // 0-100
  private masterGain: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.updateMasterVolume();
    }
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private updateMasterVolume() {
    if (this.masterGain) {
      // Convert 0-100 to 0-0.35 (lower max volume for gentler sounds)
      this.masterGain.gain.value = (this.volume / 100) * 0.35;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(100, volume));
    this.updateMasterVolume();
  }

  getVolume(): number {
    return this.volume;
  }

  private playTone(config: ToneConfig) {
    if (!this.enabled) return;

    const ctx = this.getContext();
    const {
      frequency,
      duration,
      type = 'sine',
      gain = 0.5,
      attack = 0.01,
      decay = 0.1,
      detune = 0,
    } = config;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;

    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.linearRampToValueAtTime(gain * 0.7, now + attack + duration * 0.3);
    gainNode.gain.linearRampToValueAtTime(0, now + duration - decay);

    osc.connect(gainNode);
    gainNode.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + duration);
  }

  private playTones(configs: ToneConfig[], stagger: number = 0) {
    if (!this.enabled) return;

    configs.forEach((config, i) => {
      setTimeout(() => this.playTone(config), i * stagger * 1000);
    });
  }

  private playNoise(config: NoiseConfig) {
    if (!this.enabled) return;

    const ctx = this.getContext();
    const { duration, gain = 0.3, attack = 0.01, decay = 0.05, filter } = config;

    // Create noise buffer
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const gainNode = ctx.createGain();
    const now = ctx.currentTime;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.linearRampToValueAtTime(0, now + duration - decay);

    if (filter) {
      const filterNode = ctx.createBiquadFilter();
      filterNode.type = filter.type;
      filterNode.frequency.value = filter.frequency;
      if (filter.Q) filterNode.Q.value = filter.Q;

      noise.connect(filterNode);
      filterNode.connect(gainNode);
    } else {
      noise.connect(gainNode);
    }

    gainNode.connect(this.masterGain!);
    noise.start(now);
    noise.stop(now + duration);
  }

  // ============================================
  // UI Sounds
  // ============================================

  /** Soft click for buttons and taps */
  uiClick() {
    this.playTone({
      frequency: 880,
      duration: 0.06,
      type: 'sine',
      gain: 0.12,
      attack: 0.003,
      decay: 0.03,
    });
  }

  /** Toggle switch sound */
  uiToggle(on: boolean) {
    this.playTone({
      frequency: on ? 600 : 400,
      duration: 0.1,
      type: 'sine',
      gain: 0.15,
      attack: 0.01,
      decay: 0.05,
    });
  }

  /** Modal/sheet open sound */
  uiOpen() {
    this.playTones([
      { frequency: 400, duration: 0.1, type: 'sine', gain: 0.15 },
      { frequency: 600, duration: 0.15, type: 'sine', gain: 0.12 },
    ], 0.05);
  }

  /** Modal/sheet close sound */
  uiClose() {
    this.playTones([
      { frequency: 500, duration: 0.1, type: 'sine', gain: 0.12 },
      { frequency: 350, duration: 0.12, type: 'sine', gain: 0.1 },
    ], 0.04);
  }

  /** Navigation/back sound */
  uiBack() {
    this.playTone({
      frequency: 350,
      duration: 0.12,
      type: 'triangle',
      gain: 0.15,
      attack: 0.01,
      decay: 0.05,
    });
  }

  // ============================================
  // Game Sounds - Generic
  // ============================================

  /** Piece placed / basic action - soft thud */
  place() {
    this.playTone({
      frequency: 180,
      duration: 0.08,
      type: 'sine',
      gain: 0.12,
      attack: 0.005,
      decay: 0.04,
    });
    this.playNoise({
      duration: 0.04,
      gain: 0.05,
      filter: { type: 'highpass', frequency: 3000 },
    });
  }

  /** Invalid action / can't place - gentle "nope" sound */
  invalid() {
    this.playTones([
      { frequency: 280, duration: 0.08, type: 'triangle', gain: 0.1 },
      { frequency: 220, duration: 0.1, type: 'triangle', gain: 0.08 },
    ], 0.06);
  }

  /** Select piece / change selection - light tap */
  select() {
    this.playTone({
      frequency: 660,
      duration: 0.05,
      type: 'sine',
      gain: 0.1,
      attack: 0.003,
      decay: 0.025,
    });
  }

  // ============================================
  // Game Sounds - Clearing / Success
  // ============================================

  /** Single line/row clear - bright and pleasant */
  clearSingle() {
    this.playTones([
      { frequency: 523, duration: 0.1, type: 'sine', gain: 0.15 },
      { frequency: 659, duration: 0.1, type: 'sine', gain: 0.12 },
      { frequency: 784, duration: 0.12, type: 'sine', gain: 0.1 },
    ], 0.04);
  }

  /** Multiple lines cleared - musical ascending arpeggio */
  clearMulti(count: number) {
    // Use pentatonic scale for always-pleasant sounds
    const pentatonic = [523, 587, 659, 784, 880]; // C5, D5, E5, G5, A5
    const tones: ToneConfig[] = [];

    for (let i = 0; i < Math.min(count, 5); i++) {
      tones.push({
        frequency: pentatonic[i],
        duration: 0.1,
        type: 'sine',
        gain: 0.12 - i * 0.015,
        attack: 0.01,
        decay: 0.05,
      });
    }

    this.playTones(tones, 0.05);
  }

  /** Combo hit - sparkly rising tones */
  combo(multiplier: number) {
    const baseFreq = 600 + Math.min(multiplier, 5) * 80;
    this.playTones([
      { frequency: baseFreq, duration: 0.08, type: 'sine', gain: 0.12, attack: 0.005 },
      { frequency: baseFreq * 1.2, duration: 0.08, type: 'sine', gain: 0.1, attack: 0.005 },
      { frequency: baseFreq * 1.5, duration: 0.1, type: 'sine', gain: 0.08, attack: 0.005 },
    ], 0.03);
  }

  /** Burst/explosion effect - satisfying pop, not harsh */
  burst() {
    this.playNoise({
      duration: 0.12,
      gain: 0.08,
      attack: 0.005,
      decay: 0.08,
      filter: { type: 'bandpass', frequency: 1200, Q: 2 },
    });
    this.playTones([
      { frequency: 400, duration: 0.1, type: 'sine', gain: 0.15 },
      { frequency: 600, duration: 0.08, type: 'sine', gain: 0.1 },
    ], 0.02);
  }

  // ============================================
  // Game Sounds - Merge (Snap Merge specific)
  // ============================================

  /** Block dropping - soft landing */
  drop() {
    this.playTone({
      frequency: 180,
      duration: 0.1,
      type: 'sine',
      gain: 0.1,
      attack: 0.005,
      decay: 0.06,
    });
  }

  /** Block merge - satisfying blend sound */
  merge(value: number) {
    // Higher values get higher pitched sounds
    const pitch = Math.min(Math.log2(value) * 50 + 300, 900);
    this.playTones([
      { frequency: pitch, duration: 0.1, type: 'sine', gain: 0.15, attack: 0.01 },
      { frequency: pitch * 1.5, duration: 0.12, type: 'sine', gain: 0.1, attack: 0.01 },
    ], 0.04);

    // Add a soft sparkle for high values
    if (value >= 64) {
      this.playNoise({
        duration: 0.08,
        gain: 0.06,
        filter: { type: 'highpass', frequency: 4000 },
      });
    }
  }

  // ============================================
  // Game Sounds - Color Flood specific
  // ============================================

  // Pentatonic scale frequencies - always sounds harmonious
  // C4, D4, E4, G4, A4, C5 (octave)
  private readonly PENTATONIC_SCALE = [262, 294, 330, 392, 440, 523];

  /** Color flood/fill action - plays musical tone based on color index */
  flood(colorIndex?: number) {
    // If no color index, use default tone
    if (colorIndex === undefined) {
      this.playTone({
        frequency: 300,
        duration: 0.15,
        type: 'sine',
        gain: 0.2,
        attack: 0.02,
        decay: 0.08,
      });
      return;
    }

    // Play pentatonic note for this color
    const frequency = this.PENTATONIC_SCALE[colorIndex % this.PENTATONIC_SCALE.length];

    // Main tone - warm sine wave
    this.playTone({
      frequency,
      duration: 0.25,
      type: 'sine',
      gain: 0.3,
      attack: 0.01,
      decay: 0.12,
    });

    // Subtle harmonic overtone for richness
    this.playTone({
      frequency: frequency * 2,
      duration: 0.15,
      type: 'sine',
      gain: 0.08,
      attack: 0.02,
      decay: 0.08,
    });
  }

  /** Region cleared (target size hit) */
  regionClear() {
    this.playTones([
      { frequency: 440, duration: 0.12, type: 'sine', gain: 0.25 },
      { frequency: 550, duration: 0.12, type: 'sine', gain: 0.22 },
      { frequency: 660, duration: 0.15, type: 'sine', gain: 0.18 },
    ], 0.05);
  }

  /** Round complete */
  roundComplete() {
    this.playTones([
      { frequency: 523, duration: 0.15, type: 'sine', gain: 0.3 },
      { frequency: 659, duration: 0.15, type: 'sine', gain: 0.28 },
      { frequency: 784, duration: 0.2, type: 'sine', gain: 0.25 },
      { frequency: 1047, duration: 0.3, type: 'sine', gain: 0.2 },
    ], 0.1);
  }

  // ============================================
  // Game State Sounds
  // ============================================

  /** Game start - inviting ascending tone */
  gameStart() {
    this.playTones([
      { frequency: 392, duration: 0.1, type: 'sine', gain: 0.12, attack: 0.01 },
      { frequency: 523, duration: 0.1, type: 'sine', gain: 0.12, attack: 0.01 },
      { frequency: 659, duration: 0.12, type: 'sine', gain: 0.1, attack: 0.01 },
    ], 0.07);
  }

  /** Game over - melancholy but gentle descending tone */
  gameOver() {
    this.playTones([
      { frequency: 392, duration: 0.2, type: 'sine', gain: 0.15, attack: 0.02 },
      { frequency: 330, duration: 0.25, type: 'sine', gain: 0.12, attack: 0.02 },
      { frequency: 262, duration: 0.35, type: 'sine', gain: 0.1, attack: 0.02 },
    ], 0.18);
  }

  /** New high score celebration - triumphant but not overwhelming */
  newHighScore() {
    // Fanfare - C major arpeggio
    this.playTones([
      { frequency: 523, duration: 0.12, type: 'sine', gain: 0.15, attack: 0.01 },
      { frequency: 659, duration: 0.12, type: 'sine', gain: 0.15, attack: 0.01 },
      { frequency: 784, duration: 0.12, type: 'sine', gain: 0.15, attack: 0.01 },
      { frequency: 1047, duration: 0.2, type: 'sine', gain: 0.18, attack: 0.01 },
    ], 0.1);

    // Gentle sparkle
    setTimeout(() => {
      this.playTones([
        { frequency: 1200, duration: 0.08, type: 'sine', gain: 0.08 },
        { frequency: 1400, duration: 0.08, type: 'sine', gain: 0.06 },
        { frequency: 1600, duration: 0.1, type: 'sine', gain: 0.05 },
      ], 0.05);
    }, 350);
  }

  /** Low moves warning - gentle pulse, not alarming */
  warning() {
    // Soft "boop boop" instead of harsh buzzer
    this.playTones([
      { frequency: 440, duration: 0.12, type: 'sine', gain: 0.1, attack: 0.02, decay: 0.06 },
      { frequency: 380, duration: 0.15, type: 'sine', gain: 0.08, attack: 0.02, decay: 0.08 },
    ], 0.15);
  }
}

// Singleton export
export const SoundEngine = new SoundEngineClass();
