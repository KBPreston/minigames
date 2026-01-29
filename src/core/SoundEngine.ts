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
      // Convert 0-100 to 0-0.5 (max volume is 0.5 to avoid distortion)
      this.masterGain.gain.value = (this.volume / 100) * 0.5;
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
      frequency: 800,
      duration: 0.08,
      type: 'sine',
      gain: 0.2,
      attack: 0.005,
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

  /** Piece placed / basic action */
  place() {
    this.playTone({
      frequency: 220,
      duration: 0.1,
      type: 'triangle',
      gain: 0.25,
      attack: 0.01,
      decay: 0.04,
    });
    this.playNoise({
      duration: 0.06,
      gain: 0.1,
      filter: { type: 'highpass', frequency: 2000 },
    });
  }

  /** Invalid action / can't place */
  invalid() {
    this.playTones([
      { frequency: 200, duration: 0.1, type: 'square', gain: 0.15, detune: -10 },
      { frequency: 180, duration: 0.12, type: 'square', gain: 0.12, detune: 10 },
    ], 0.08);
  }

  /** Select piece / change selection */
  select() {
    this.playTone({
      frequency: 500,
      duration: 0.06,
      type: 'sine',
      gain: 0.15,
      attack: 0.005,
      decay: 0.02,
    });
  }

  // ============================================
  // Game Sounds - Clearing / Success
  // ============================================

  /** Single line/row clear */
  clearSingle() {
    this.playTones([
      { frequency: 400, duration: 0.15, type: 'sine', gain: 0.3 },
      { frequency: 500, duration: 0.15, type: 'sine', gain: 0.25 },
      { frequency: 600, duration: 0.2, type: 'sine', gain: 0.2 },
    ], 0.05);
  }

  /** Multiple lines cleared */
  clearMulti(count: number) {
    const baseFreq = 400;
    const tones: ToneConfig[] = [];

    for (let i = 0; i <= Math.min(count, 4); i++) {
      tones.push({
        frequency: baseFreq + i * 100,
        duration: 0.15 + i * 0.03,
        type: 'sine',
        gain: 0.25 - i * 0.03,
      });
    }

    this.playTones(tones, 0.06);
  }

  /** Combo hit */
  combo(multiplier: number) {
    const baseFreq = 500 + Math.min(multiplier, 5) * 50;
    this.playTones([
      { frequency: baseFreq, duration: 0.1, type: 'sine', gain: 0.25 },
      { frequency: baseFreq * 1.25, duration: 0.12, type: 'sine', gain: 0.2 },
      { frequency: baseFreq * 1.5, duration: 0.15, type: 'sine', gain: 0.15 },
    ], 0.04);
  }

  /** Burst/explosion effect */
  burst() {
    this.playNoise({
      duration: 0.2,
      gain: 0.25,
      attack: 0.01,
      decay: 0.1,
      filter: { type: 'bandpass', frequency: 800, Q: 1 },
    });
    this.playTones([
      { frequency: 300, duration: 0.15, type: 'sine', gain: 0.3 },
      { frequency: 450, duration: 0.12, type: 'sine', gain: 0.2 },
    ], 0.03);
  }

  // ============================================
  // Game Sounds - Merge (Snap Merge specific)
  // ============================================

  /** Block dropping */
  drop() {
    this.playTone({
      frequency: 150,
      duration: 0.15,
      type: 'triangle',
      gain: 0.2,
      attack: 0.01,
      decay: 0.08,
    });
  }

  /** Block merge */
  merge(value: number) {
    // Higher values get higher pitched sounds
    const pitch = Math.min(Math.log2(value) * 60 + 200, 1000);
    this.playTones([
      { frequency: pitch, duration: 0.12, type: 'sine', gain: 0.3 },
      { frequency: pitch * 1.5, duration: 0.15, type: 'triangle', gain: 0.2 },
    ], 0.05);

    // Add a satisfying "pop" for high values
    if (value >= 64) {
      this.playNoise({
        duration: 0.1,
        gain: 0.15,
        filter: { type: 'highpass', frequency: 3000 },
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

  /** Game start */
  gameStart() {
    this.playTones([
      { frequency: 330, duration: 0.1, type: 'sine', gain: 0.2 },
      { frequency: 440, duration: 0.1, type: 'sine', gain: 0.22 },
      { frequency: 550, duration: 0.15, type: 'sine', gain: 0.2 },
    ], 0.08);
  }

  /** Game over */
  gameOver() {
    this.playTones([
      { frequency: 400, duration: 0.2, type: 'sine', gain: 0.3 },
      { frequency: 350, duration: 0.25, type: 'sine', gain: 0.25 },
      { frequency: 280, duration: 0.3, type: 'sine', gain: 0.2 },
      { frequency: 200, duration: 0.4, type: 'sine', gain: 0.15 },
    ], 0.15);
  }

  /** New high score celebration */
  newHighScore() {
    // Fanfare!
    this.playTones([
      { frequency: 523, duration: 0.15, type: 'sine', gain: 0.25 },
      { frequency: 659, duration: 0.15, type: 'sine', gain: 0.25 },
      { frequency: 784, duration: 0.15, type: 'sine', gain: 0.25 },
      { frequency: 1047, duration: 0.25, type: 'sine', gain: 0.3 },
    ], 0.12);

    // Add some sparkle
    setTimeout(() => {
      this.playTones([
        { frequency: 1200, duration: 0.1, type: 'sine', gain: 0.15 },
        { frequency: 1400, duration: 0.1, type: 'sine', gain: 0.12 },
        { frequency: 1600, duration: 0.12, type: 'sine', gain: 0.1 },
      ], 0.06);
    }, 400);
  }

  /** Low moves warning */
  warning() {
    this.playTone({
      frequency: 200,
      duration: 0.2,
      type: 'square',
      gain: 0.15,
      attack: 0.01,
      decay: 0.1,
    });
  }
}

// Singleton export
export const SoundEngine = new SoundEngineClass();
