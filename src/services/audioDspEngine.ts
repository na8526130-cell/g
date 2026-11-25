import { AudioQualityMode, AudioStreamMetadata, SpatialAudioPreset } from '../types/music';

/**
 * Genuine Dual-Deck Web Audio API DSP Engine for zero-music:
 * - Lossless / Hi-Res clarity EQ + zero-clipping mastering dynamics
 * - Spatial Audio (3D Cinema, Concert Hall, Studio) via M/S widening + acoustic Convolver IR + Haas spread
 * - Apple Music Sing / Karaoke Vocal Volume (0%..100%) via Mid/Side (L-R) vocal-band attenuation
 * - True overlapping Dual-Deck DJ Crossfade (equal-power cos/sin curve)
 */

interface DeckNodes {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  deckGain: GainNode | null;
  lowShelf: BiquadFilterNode | null;
  eqLow: BiquadFilterNode | null;
  eqMid: BiquadFilterNode | null;
  eqHigh: BiquadFilterNode | null;
  currentTrackId: string | null;
}

export interface DjDeckSnapshot {
  trackId: string | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

class AudioDspEngine {
  private ctx: AudioContext | null = null;
  private decks: [DeckNodes, DeckNodes] | null = null;
  private activeDeckIdx: 0 | 1 = 0;

  // M/S Sing + Spatial processing graph
  private preSumGain: GainNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private midLowPass: BiquadFilterNode | null = null;
  private midBandPass: BiquadFilterNode | null = null;
  private midHighPass: BiquadFilterNode | null = null;

  private midLLow: GainNode | null = null;
  private midRLow: GainNode | null = null;
  private midLVocal: GainNode | null = null;
  private midRVocal: GainNode | null = null;
  private midLHigh: GainNode | null = null;
  private midRHigh: GainNode | null = null;

  private vocalGainNode: GainNode | null = null;
  private midLowGain: GainNode | null = null;
  private midHighGain: GainNode | null = null;

  private sideLL: GainNode | null = null;
  private sideLR: GainNode | null = null;
  private sideRL: GainNode | null = null;
  private sideRR: GainNode | null = null;
  private sideWidthGain: GainNode | null = null;

  // Spatial Convolver & Stereo Haas delay
  private convolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private spatialDelayR: DelayNode | null = null;
  private spatialDelayGain: GainNode | null = null;

  // Lossless / Hi-Res mastering EQ + Limiter
  private hiresLowShelf: BiquadFilterNode | null = null;
  private hiresPresence: BiquadFilterNode | null = null;
  private hiresAirShelf: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;

  // Parameters
  private vocalLevel = 100; // 0..100 (0 = off vocal / karaoke)
  private spatialPreset: SpatialAudioPreset = 'off';
  private audioQuality: AudioQualityMode = 'auto';
  private masterVolume = 100;
  private isMuted = false;
  private playbackRate = 1.0;

  private crossfadeAnimFrame: number | null = null;
  private isCrossfading = false;
  private djMixerActive = false;
  private djCrossfaderVal = 0.5;
  private djEqDb: [{ low: number; mid: number; high: number }, { low: number; mid: number; high: number }] = [
    { low: 0, mid: 0, high: 0 },
    { low: 0, mid: 0, high: 0 },
  ];
  private timeUpdateListeners = new Set<(time: number, duration: number, trackId: string) => void>();
  private endedListeners = new Set<(trackId: string) => void>();
  private errorListeners = new Set<(trackId: string, err: string) => void>();
  private stateListeners = new Set<(playing: boolean) => void>();
  private djStateListeners = new Set<() => void>();
  private unlockBound = false;
  private primingDecks = new Set<0 | 1>();
  private primedDecks = new Set<0 | 1>();

  constructor() {
    this.bindGlobalUnlock();
  }

  private bindGlobalUnlock() {
    if (typeof window === 'undefined' || this.unlockBound) return;
    this.unlockBound = true;
    const handleUnlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
  }

  public unlock() {
    try {
      const decks = this.ensureDecks();
      this.ensureAudioGraph();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      // Prime both HTMLAudioElements inside user gesture so dual-deck crossfade auto-advance
      // on mobile Safari/Chrome never fails with NotAllowedError on Deck B.
      if (decks) {
        const SILENT_WAV =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAD///8=';
        ([0, 1] as const).forEach((idx) => {
          const deck = decks[idx];
          if (this.primedDecks.has(idx) || !deck.el.paused || deck.el.src) return;
          this.primedDecks.add(idx);
          this.primingDecks.add(idx);
          try {
            deck.el.muted = true;
            deck.el.src = SILENT_WAV;
            const p = deck.el.play();
            if (p && typeof p.then === 'function') {
              p.then(() => {
                if (this.primingDecks.has(idx)) {
                  deck.el.pause();
                  deck.el.removeAttribute('src');
                  deck.el.load();
                  deck.el.muted = false;
                  this.primingDecks.delete(idx);
                }
              }).catch(() => {
                deck.el.muted = false;
                this.primingDecks.delete(idx);
                this.primedDecks.delete(idx);
              });
            } else {
              deck.el.pause();
              deck.el.removeAttribute('src');
              deck.el.muted = false;
              this.primingDecks.delete(idx);
            }
          } catch {
            deck.el.muted = false;
            this.primingDecks.delete(idx);
            this.primedDecks.delete(idx);
          }
        });
      }
    } catch {}
  }

  private notifyDjListeners() {
    this.djStateListeners.forEach((cb) => cb());
  }

  private ensureDecks() {
    if (typeof window === 'undefined') return null;
    if (!this.decks) {
      const makeAudio = (id: string): HTMLAudioElement => {
        const a = document.createElement('audio');
        a.id = id;
        a.setAttribute('playsinline', '');
        a.setAttribute('webkit-playsinline', '');
        a.preload = 'auto';
        a.style.display = 'none';
        document.body.appendChild(a);
        return a;
      };
      const elA = makeAudio('zero-dsp-deck-a');
      const elB = makeAudio('zero-dsp-deck-b');

      const bindEvents = (el: HTMLAudioElement, deckIdx: 0 | 1) => {
        el.addEventListener('timeupdate', () => {
          if (this.primingDecks.has(deckIdx)) return;
          if (this.djMixerActive) {
            this.notifyDjListeners();
            return;
          }
          if (this.activeDeckIdx !== deckIdx) return;
          const trackId = this.decks?.[deckIdx].currentTrackId || '';
          const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
          this.timeUpdateListeners.forEach((cb) => cb(el.currentTime || 0, dur, trackId));
        });
        el.addEventListener('ended', () => {
          if (this.primingDecks.has(deckIdx)) return;
          if (this.djMixerActive) {
            this.notifyDjListeners();
            return;
          }
          if (this.activeDeckIdx !== deckIdx) return;
          const trackId = this.decks?.[deckIdx].currentTrackId || '';
          this.endedListeners.forEach((cb) => cb(trackId));
        });
        el.addEventListener('play', () => {
          if (this.primingDecks.has(deckIdx)) return;
          this.primedDecks.add(deckIdx);
          if (this.djMixerActive) {
            this.notifyDjListeners();
            return;
          }
          if (this.activeDeckIdx === deckIdx) {
            this.stateListeners.forEach((cb) => cb(true));
          }
        });
        el.addEventListener('pause', () => {
          if (this.primingDecks.has(deckIdx)) return;
          if (this.djMixerActive) {
            this.notifyDjListeners();
            return;
          }
          // Ignore natural end-of-stream pause so 'ended' triggers seamless auto-advance without pause flicker
          if (!el.ended && this.activeDeckIdx === deckIdx && !this.isCrossfading) {
            this.stateListeners.forEach((cb) => cb(false));
          }
        });
        el.addEventListener('loadedmetadata', () => {
          if (this.primingDecks.has(deckIdx)) return;
          if (this.djMixerActive) this.notifyDjListeners();
        });
        el.addEventListener('error', () => {
          if (this.primingDecks.has(deckIdx)) return;
          if (this.djMixerActive) {
            this.notifyDjListeners();
            return;
          }
          if (this.activeDeckIdx !== deckIdx) return;
          const trackId = this.decks?.[deckIdx].currentTrackId || '';
          this.errorListeners.forEach((cb) => cb(trackId, el.error?.message || 'Audio element error'));
        });
      };

      bindEvents(elA, 0);
      bindEvents(elB, 1);

      this.decks = [
        { el: elA, source: null, deckGain: null, lowShelf: null, eqLow: null, eqMid: null, eqHigh: null, currentTrackId: null },
        { el: elB, source: null, deckGain: null, lowShelf: null, eqLow: null, eqMid: null, eqHigh: null, currentTrackId: null },
      ];
    }
    return this.decks;
  }

  private buildImpulseResponse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        // Slightly decorrelated L/R filtered acoustic noise tail
        const white = Math.random() * 2 - 1;
        prev = prev * 0.45 + white * 0.55;
        data[i] = prev * env * 0.45;
      }
    }
    return impulse;
  }

  private ensureAudioGraph() {
    const decks = this.ensureDecks();
    if (!decks || typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    // Pre-sum bus from both decks
    const preSum = ctx.createGain();
    preSum.gain.value = 1;
    this.preSumGain = preSum;

    for (let i = 0; i < decks.length; i++) {
      const deck = decks[i];
      deck.source = ctx.createMediaElementSource(deck.el);
      deck.lowShelf = ctx.createBiquadFilter();
      deck.lowShelf.type = 'highpass';
      deck.lowShelf.frequency.value = 10; // Transparent by default unless DJ transition filter sweeps

      deck.eqLow = ctx.createBiquadFilter();
      deck.eqLow.type = 'lowshelf';
      deck.eqLow.frequency.value = 250;
      deck.eqLow.gain.value = this.djEqDb[i as 0 | 1]?.low || 0;

      deck.eqMid = ctx.createBiquadFilter();
      deck.eqMid.type = 'peaking';
      deck.eqMid.frequency.value = 1000;
      deck.eqMid.Q.value = 0.85;
      deck.eqMid.gain.value = this.djEqDb[i as 0 | 1]?.mid || 0;

      deck.eqHigh = ctx.createBiquadFilter();
      deck.eqHigh.type = 'highshelf';
      deck.eqHigh.frequency.value = 4000;
      deck.eqHigh.gain.value = this.djEqDb[i as 0 | 1]?.high || 0;

      deck.deckGain = ctx.createGain();
      deck.deckGain.gain.value = deck === decks[this.activeDeckIdx] ? 1 : 0;

      deck.source.connect(deck.lowShelf);
      deck.lowShelf.connect(deck.eqLow);
      deck.eqLow.connect(deck.eqMid);
      deck.eqMid.connect(deck.eqHigh);
      deck.eqHigh.connect(deck.deckGain);
      deck.deckGain.connect(preSum);
    }

    // M/S Matrix for Apple Music Sing Vocal Control + Spatial Stereo Widening
    const splitter = ctx.createChannelSplitter(2);
    this.splitter = splitter;
    preSum.connect(splitter);

    // Mid = 0.5*(L + R)
    const midSummer = ctx.createGain();
    midSummer.gain.value = 1;
    const midHalfL = ctx.createGain();
    midHalfL.gain.value = 0.5;
    const midHalfR = ctx.createGain();
    midHalfR.gain.value = 0.5;
    splitter.connect(midHalfL, 0);
    splitter.connect(midHalfR, 1);
    midHalfL.connect(midSummer);
    midHalfR.connect(midSummer);

    // Split Mid into Bass (<240Hz), Vocal Band (240..4200Hz), Air (>4200Hz)
    const midLowPass = ctx.createBiquadFilter();
    midLowPass.type = 'lowpass';
    midLowPass.frequency.value = 235;
    midLowPass.Q.value = 0.707;
    this.midLowPass = midLowPass;

    const midBandPass = ctx.createBiquadFilter();
    midBandPass.type = 'bandpass';
    midBandPass.frequency.value = 1350;
    midBandPass.Q.value = 0.52;
    this.midBandPass = midBandPass;

    const midHighPass = ctx.createBiquadFilter();
    midHighPass.type = 'highpass';
    midHighPass.frequency.value = 4200;
    midHighPass.Q.value = 0.707;
    this.midHighPass = midHighPass;

    midSummer.connect(midLowPass);
    midSummer.connect(midBandPass);
    midSummer.connect(midHighPass);

    const midLowGain = ctx.createGain();
    midLowGain.gain.value = 1;
    this.midLowGain = midLowGain;

    const vocalGain = ctx.createGain();
    vocalGain.gain.value = 1;
    this.vocalGainNode = vocalGain;

    const midHighGain = ctx.createGain();
    midHighGain.gain.value = 1;
    this.midHighGain = midHighGain;

    midLowPass.connect(midLowGain);
    midBandPass.connect(vocalGain);
    midHighPass.connect(midHighGain);

    // Side L = 0.5*(L - R), Side R = 0.5*(R - L)
    const sideLBus = ctx.createGain();
    const sideRBus = ctx.createGain();
    const sLL = ctx.createGain();
    sLL.gain.value = 0.5;
    const sLR = ctx.createGain();
    sLR.gain.value = -0.5;
    const sRL = ctx.createGain();
    sRL.gain.value = -0.5;
    const sRR = ctx.createGain();
    sRR.gain.value = 0.5;

    this.sideLL = sLL;
    this.sideLR = sLR;
    this.sideRL = sRL;
    this.sideRR = sRR;

    splitter.connect(sLL, 0);
    splitter.connect(sLR, 1);
    splitter.connect(sRL, 0);
    splitter.connect(sRR, 1);
    sLL.connect(sideLBus);
    sLR.connect(sideLBus);
    sRL.connect(sideRBus);
    sRR.connect(sideRBus);

    const sideWidthGain = ctx.createGain();
    sideWidthGain.gain.value = 1.0;
    this.sideWidthGain = sideWidthGain;

    const sideOutL = ctx.createGain();
    const sideOutR = ctx.createGain();
    sideLBus.connect(sideWidthGain);
    sideWidthGain.connect(sideOutL);
    // Use another gain linked for Right side
    const sideWidthGainR = ctx.createGain();
    sideWidthGainR.gain.value = 1.0;
    sideRBus.connect(sideWidthGainR);
    sideWidthGainR.connect(sideOutR);

    // Keep right side width synchronized via reference on object
    (this as any)._sideWidthGainR = sideWidthGainR;

    // Recombine L & R via Merger
    const merger = ctx.createChannelMerger(2);
    const outL = ctx.createGain();
    const outR = ctx.createGain();

    this.midLLow = ctx.createGain();
    this.midRLow = ctx.createGain();
    this.midLVocal = ctx.createGain();
    this.midRVocal = ctx.createGain();
    this.midLHigh = ctx.createGain();
    this.midRHigh = ctx.createGain();

    midLowGain.connect(this.midLLow);
    midLowGain.connect(this.midRLow);
    vocalGain.connect(this.midLVocal);
    vocalGain.connect(this.midRVocal);
    midHighGain.connect(this.midLHigh);
    midHighGain.connect(this.midRHigh);

    this.midLLow.connect(outL);
    this.midLVocal.connect(outL);
    this.midLHigh.connect(outL);
    sideOutL.connect(outL);

    this.midRLow.connect(outR);
    this.midRVocal.connect(outR);
    this.midRHigh.connect(outR);
    sideOutR.connect(outR);

    outL.connect(merger, 0, 0);
    outR.connect(merger, 0, 1);

    // Lossless / Hi-Res Mastering EQ Chain
    const hiresLow = ctx.createBiquadFilter();
    hiresLow.type = 'lowshelf';
    hiresLow.frequency.value = 65;
    hiresLow.gain.value = 0;
    this.hiresLowShelf = hiresLow;

    const hiresPres = ctx.createBiquadFilter();
    hiresPres.type = 'peaking';
    hiresPres.frequency.value = 3200;
    hiresPres.Q.value = 0.8;
    hiresPres.gain.value = 0;
    this.hiresPresence = hiresPres;

    const hiresAir = ctx.createBiquadFilter();
    hiresAir.type = 'highshelf';
    hiresAir.frequency.value = 12500;
    hiresAir.gain.value = 0;
    this.hiresAirShelf = hiresAir;

    merger.connect(hiresLow);
    hiresLow.connect(hiresPres);
    hiresPres.connect(hiresAir);

    // Spatial Convolver (Dolby Atmos-style acoustic soundstage)
    const convolver = ctx.createConvolver();
    convolver.buffer = this.buildImpulseResponse(ctx, 1.35, 2.8);
    this.convolver = convolver;

    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    this.reverbWetGain = reverbWet;

    const spatialDelayR = ctx.createDelay(0.05);
    spatialDelayR.delayTime.value = 0.011;
    this.spatialDelayR = spatialDelayR;

    const spatialDelayGain = ctx.createGain();
    spatialDelayGain.gain.value = 0;
    this.spatialDelayGain = spatialDelayGain;

    // Gentle Limiter / Compressor -> Master Gain -> Destination
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -8;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    this.compressor = compressor;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.isMuted ? 0 : this.masterVolume / 100;
    this.masterGain = masterGain;

    hiresAir.connect(compressor);
    hiresAir.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(compressor);

    hiresAir.connect(spatialDelayR);
    spatialDelayR.connect(spatialDelayGain);
    spatialDelayGain.connect(compressor);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.applyAllDspParams();
  }

  private applyAllDspParams() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Vocal Level (Apple Music Sing: 100% original -> 0% karaoke vocal suppressed)
    const vNorm = Math.max(0, Math.min(1, this.vocalLevel / 100));
    if (this.vocalGainNode) {
      this.vocalGainNode.gain.setTargetAtTime(vNorm, now, 0.03);
    }
    // Slight stereo accompaniment lift when vocal is reduced so music stays rich & full
    const karaokeSideBoost = vNorm < 0.75 ? 1 + (0.75 - vNorm) * 0.45 : 1.0;

    // 2. Spatial Audio Preset (Dolby Atmos-style soundstage)
    let spatialWidth = 1.0;
    let reverbWet = 0.0;
    let haasWet = 0.0;

    if (this.spatialPreset === 'studio') {
      spatialWidth = 1.28;
      reverbWet = 0.14;
      haasWet = 0.08;
      if (this.convolver) this.convolver.buffer = this.buildImpulseResponse(this.ctx, 0.65, 3.6);
    } else if (this.spatialPreset === 'cinema') {
      spatialWidth = 1.52;
      reverbWet = 0.24;
      haasWet = 0.14;
      if (this.convolver) this.convolver.buffer = this.buildImpulseResponse(this.ctx, 1.25, 2.6);
    } else if (this.spatialPreset === 'concert') {
      spatialWidth = 1.72;
      reverbWet = 0.36;
      haasWet = 0.18;
      if (this.convolver) this.convolver.buffer = this.buildImpulseResponse(this.ctx, 2.1, 2.1);
    }

    const finalSideWidth = spatialWidth * karaokeSideBoost;
    if (this.sideWidthGain) {
      this.sideWidthGain.gain.setTargetAtTime(finalSideWidth, now, 0.04);
    }
    const sideGainR = (this as any)._sideWidthGainR as GainNode | undefined;
    if (sideGainR) {
      sideGainR.gain.setTargetAtTime(finalSideWidth, now, 0.04);
    }
    if (this.reverbWetGain) {
      this.reverbWetGain.gain.setTargetAtTime(reverbWet, now, 0.05);
    }
    if (this.spatialDelayGain) {
      this.spatialDelayGain.gain.setTargetAtTime(haasWet, now, 0.05);
    }

    // 3. Lossless / Hi-Res Clarity Curve
    let lowDb = 0;
    let presDb = 0;
    let airDb = 0;
    if (this.audioQuality === 'lossless') {
      lowDb = 1.2;
      presDb = 1.0;
      airDb = 1.8;
    } else if (this.audioQuality === 'hires') {
      lowDb = 1.8;
      presDb = 1.6;
      airDb = 2.8;
    }
    if (this.hiresLowShelf) this.hiresLowShelf.gain.setTargetAtTime(lowDb, now, 0.05);
    if (this.hiresPresence) this.hiresPresence.gain.setTargetAtTime(presDb, now, 0.05);
    if (this.hiresAirShelf) this.hiresAirShelf.gain.setTargetAtTime(airDb, now, 0.05);

    // 4. Master Gain
    if (this.masterGain) {
      const target = this.isMuted ? 0 : Math.max(0, Math.min(1, this.masterVolume / 100));
      this.masterGain.gain.setTargetAtTime(target, now, 0.02);
    }
  }

  public setVocalLevel(level: number) {
    this.vocalLevel = Math.max(0, Math.min(100, Math.round(level)));
    this.applyAllDspParams();
  }

  public setSpatialPreset(preset: SpatialAudioPreset) {
    this.spatialPreset = preset;
    this.applyAllDspParams();
  }

  public setAudioQuality(q: AudioQualityMode) {
    this.audioQuality = q;
    this.applyAllDspParams();
  }

  public setVolume(vol: number, muted: boolean) {
    this.masterVolume = Math.max(0, Math.min(100, vol));
    this.isMuted = muted;
    this.applyAllDspParams();
    if (this.decks) {
      const htmlVol = muted ? 0 : this.masterVolume / 100;
      this.decks.forEach((d) => {
        if (!this.ctx) d.el.volume = htmlVol;
        else d.el.volume = 1; // MasterGain controls output when WebAudio active
      });
    }
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    if (this.decks) {
      this.decks.forEach((d) => {
        d.el.playbackRate = rate;
      });
    }
  }

  public getEngineTelemetry(): Partial<AudioStreamMetadata> {
    return {
      sampleRateHz: this.ctx?.sampleRate || 48000,
      usingDirectDsp: true,
    };
  }

  public getCurrentElement(): HTMLAudioElement | null {
    return this.decks ? this.decks[this.activeDeckIdx].el : null;
  }

  private applyCrossOriginForSrc(el: HTMLAudioElement, src: string) {
    try {
      const isDirectLocal =
        !src ||
        src.startsWith('blob:') ||
        src.startsWith('data:') ||
        src.startsWith('/') ||
        (typeof window !== 'undefined' && src.startsWith(window.location.origin));
      if (isDirectLocal) {
        el.removeAttribute('crossorigin');
      } else {
        el.crossOrigin = 'anonymous';
      }
    } catch {}
  }

  public async loadAndPlay(params: {
    trackId: string;
    src: string;
    startSec?: number;
    autoplay?: boolean;
    crossfadeSec?: number;
    djEqSweep?: boolean;
  }) {
    const decks = this.ensureDecks();
    if (!decks) return;

    try {
      this.ensureAudioGraph();
    } catch {}

    const prevIdx = this.activeDeckIdx;
    const prevDeck = decks[prevIdx];
    const shouldCrossfade =
      Boolean(params.crossfadeSec && params.crossfadeSec > 0.3) &&
      prevDeck.currentTrackId &&
      prevDeck.currentTrackId !== params.trackId &&
      !prevDeck.el.paused;

    if (shouldCrossfade && this.ctx && prevDeck.deckGain) {
      const nextIdx: 0 | 1 = prevIdx === 0 ? 1 : 0;
      const nextDeck = decks[nextIdx];
      this.activeDeckIdx = nextIdx;

      if (this.crossfadeAnimFrame) cancelAnimationFrame(this.crossfadeAnimFrame);
      this.isCrossfading = true;

      this.primingDecks.delete(nextIdx);
      nextDeck.el.muted = false;
      nextDeck.currentTrackId = params.trackId;
      if (nextDeck.el.src !== params.src || nextDeck.el.error) {
        this.applyCrossOriginForSrc(nextDeck.el, params.src);
        nextDeck.el.src = params.src;
        nextDeck.el.load();
      }
      nextDeck.el.playbackRate = this.playbackRate;
      if (typeof params.startSec === 'number' && params.startSec > 0) {
        if (nextDeck.el.readyState >= 1) {
          nextDeck.el.currentTime = params.startSec;
        } else {
          const targetSec = params.startSec;
          nextDeck.el.addEventListener(
            'loadedmetadata',
            () => {
              if (nextDeck.currentTrackId === params.trackId) {
                nextDeck.el.currentTime = targetSec;
              }
            },
            { once: true }
          );
        }
      }

      if (nextDeck.deckGain) {
        nextDeck.deckGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      let nextPlayBlocked = false;
      if (params.autoplay !== false) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        await nextDeck.el.play().catch((e) => {
          if (e?.name === 'NotAllowedError') {
            nextPlayBlocked = true;
          }
        });
      }

      if (nextPlayBlocked) {
        // Fallback cleanly to the already-unlocked deck if Deck B wasn't unlocked yet on mobile
        this.isCrossfading = false;
        this.activeDeckIdx = prevIdx;
        nextDeck.el.pause();
        if (this.ctx) {
          const t = this.ctx.currentTime;
          prevDeck.deckGain?.gain.setValueAtTime(1, t);
          nextDeck.deckGain?.gain.setValueAtTime(0, t);
        }
        await this.loadAndPlay({
          ...params,
          crossfadeSec: 0,
        });
        return;
      }

      const fadeMs = Math.min(12000, Math.max(800, (params.crossfadeSec || 4) * 1000));
      const startTime = performance.now();

      const tickCrossfade = (nowTs: number) => {
        const elapsed = nowTs - startTime;
        const p = Math.min(1, elapsed / fadeMs);
        // Equal-power DJ crossfade curve (cos / sin)
        const fadeOut = Math.cos(p * Math.PI * 0.5);
        const fadeIn = Math.sin(p * Math.PI * 0.5);

        if (this.ctx) {
          const t = this.ctx.currentTime;
          prevDeck.deckGain?.gain.setValueAtTime(fadeOut, t);
          nextDeck.deckGain?.gain.setValueAtTime(fadeIn, t);
          if (params.djEqSweep && prevDeck.lowShelf) {
            // Subtle DJ high-pass bass cut on outgoing track during crossover
            prevDeck.lowShelf.frequency.setValueAtTime(10 + p * 340, t);
          }
        }

        if (p < 1) {
          this.crossfadeAnimFrame = requestAnimationFrame(tickCrossfade);
        } else {
          this.isCrossfading = false;
          prevDeck.el.pause();
          prevDeck.el.currentTime = 0;
          if (prevDeck.lowShelf && this.ctx) {
            prevDeck.lowShelf.frequency.setValueAtTime(10, this.ctx.currentTime);
          }
        }
      };

      this.crossfadeAnimFrame = requestAnimationFrame(tickCrossfade);
      return;
    }

    // Standard single-deck load/play
    if (this.crossfadeAnimFrame) cancelAnimationFrame(this.crossfadeAnimFrame);
    this.isCrossfading = false;
    const otherIdx: 0 | 1 = prevIdx === 0 ? 1 : 0;
    decks[otherIdx].el.pause();

    const activeDeck = decks[this.activeDeckIdx];
    this.primingDecks.delete(this.activeDeckIdx);
    activeDeck.el.muted = false;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      activeDeck.deckGain?.gain.setValueAtTime(1, t);
      decks[otherIdx].deckGain?.gain.setValueAtTime(0, t);
    }

    const isSameTrack =
      activeDeck.currentTrackId === params.trackId &&
      activeDeck.el.src === params.src &&
      !activeDeck.el.error &&
      activeDeck.el.readyState > 0;
    activeDeck.currentTrackId = params.trackId;
    if (!isSameTrack) {
      this.applyCrossOriginForSrc(activeDeck.el, params.src);
      activeDeck.el.src = params.src;
      activeDeck.el.load();
    }
    activeDeck.el.playbackRate = this.playbackRate;
    if (typeof params.startSec === 'number' && params.startSec > 0 && !isSameTrack) {
      if (activeDeck.el.readyState >= 1) {
        activeDeck.el.currentTime = params.startSec;
      } else {
        const targetSec = params.startSec;
        activeDeck.el.addEventListener(
          'loadedmetadata',
          () => {
            if (activeDeck.currentTrackId === params.trackId) {
              activeDeck.el.currentTime = targetSec;
            }
          },
          { once: true }
        );
      }
    }

    if (params.autoplay !== false) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      await activeDeck.el.play().catch((e) => {
        if (e?.name === 'AbortError') return;
        if (e?.name === 'NotAllowedError') {
          this.stateListeners.forEach((cb) => cb(false));
          return;
        }
        this.errorListeners.forEach((cb) => cb(params.trackId, e?.message || 'Play blocked'));
      });
    } else {
      activeDeck.el.pause();
    }
  }

  public play() {
    try {
      this.ensureAudioGraph();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {}
    const el = this.getCurrentElement();
    if (el && el.paused) {
      el.play().catch(() => {});
    }
  }

  public pause() {
    this.decks?.forEach((d) => d.el.pause());
  }

  public seekTo(seconds: number) {
    const el = this.getCurrentElement();
    if (el && Number.isFinite(seconds)) {
      el.currentTime = Math.max(0, seconds);
    }
  }

  public stopAll() {
    if (this.crossfadeAnimFrame) cancelAnimationFrame(this.crossfadeAnimFrame);
    this.isCrossfading = false;
    this.decks?.forEach((d) => {
      d.el.pause();
    });
  }

  public onTimeUpdate(cb: (time: number, duration: number, trackId: string) => void) {
    this.timeUpdateListeners.add(cb);
    return () => this.timeUpdateListeners.delete(cb);
  }

  public onEnded(cb: (trackId: string) => void) {
    this.endedListeners.add(cb);
    return () => this.endedListeners.delete(cb);
  }

  public onError(cb: (trackId: string, err: string) => void) {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  public onStateChange(cb: (playing: boolean) => void) {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  // =====================================
  // Interactive Dual-Deck DJ Mixer API
  // =====================================
  public setDjMixerActive(active: boolean) {
    this.djMixerActive = active;
    if (active) {
      this.ensureDecks();
      try {
        this.ensureAudioGraph();
      } catch {}
      this.setDjManualCrossfader(this.djCrossfaderVal);
    } else {
      this.resetDjNodes();
    }
    this.notifyDjListeners();
  }

  public async loadDjDeckTrack(deckIdx: 0 | 1, src: string, trackId: string) {
    const decks = this.ensureDecks();
    if (!decks) return;
    try {
      this.ensureAudioGraph();
    } catch {}
    const deck = decks[deckIdx];
    const wasSame = deck.currentTrackId === trackId && deck.el.src === src && !deck.el.error;
    deck.currentTrackId = trackId;
    if (!wasSame) {
      deck.el.pause();
      this.applyCrossOriginForSrc(deck.el, src);
      deck.el.src = src;
      deck.el.load();
    }
    this.notifyDjListeners();
  }

  public async toggleDjDeckPlay(deckIdx: 0 | 1): Promise<boolean> {
    const decks = this.ensureDecks();
    if (!decks) return false;
    try {
      this.ensureAudioGraph();
    } catch {}
    const deck = decks[deckIdx];
    if (deck.el.paused) {
      await deck.el.play().catch(() => {});
    } else {
      deck.el.pause();
    }
    this.notifyDjListeners();
    return !deck.el.paused;
  }

  public seekDjDeck(deckIdx: 0 | 1, sec: number) {
    const deck = this.decks?.[deckIdx];
    if (deck && Number.isFinite(sec)) {
      deck.el.currentTime = Math.max(0, sec);
      this.notifyDjListeners();
    }
  }

  public setDjDeckRate(deckIdx: 0 | 1, rate: number) {
    const deck = this.decks?.[deckIdx];
    const clamped = Math.max(0.75, Math.min(1.25, rate));
    if (deck) {
      deck.el.playbackRate = clamped;
      this.notifyDjListeners();
    }
  }

  public setDjDeckEq(deckIdx: 0 | 1, eq: { low?: number; mid?: number; high?: number }) {
    const cur = this.djEqDb[deckIdx];
    if (typeof eq.low === 'number') cur.low = Math.max(-18, Math.min(12, eq.low));
    if (typeof eq.mid === 'number') cur.mid = Math.max(-18, Math.min(12, eq.mid));
    if (typeof eq.high === 'number') cur.high = Math.max(-18, Math.min(12, eq.high));

    const deck = this.decks?.[deckIdx];
    if (deck && this.ctx) {
      const now = this.ctx.currentTime;
      if (deck.eqLow) deck.eqLow.gain.setTargetAtTime(cur.low, now, 0.02);
      if (deck.eqMid) deck.eqMid.gain.setTargetAtTime(cur.mid, now, 0.02);
      if (deck.eqHigh) deck.eqHigh.gain.setTargetAtTime(cur.high, now, 0.02);
    }
    this.notifyDjListeners();
  }

  public setDjManualCrossfader(val: number) {
    const p = Math.max(0, Math.min(1, val));
    this.djCrossfaderVal = p;
    const gainA = Math.cos(p * Math.PI * 0.5);
    const gainB = Math.sin(p * Math.PI * 0.5);
    if (this.decks && this.ctx) {
      const now = this.ctx.currentTime;
      this.decks[0].deckGain?.gain.setTargetAtTime(gainA, now, 0.02);
      this.decks[1].deckGain?.gain.setTargetAtTime(gainB, now, 0.02);
    } else if (this.decks) {
      const volScale = this.isMuted ? 0 : this.masterVolume / 100;
      this.decks[0].el.volume = gainA * volScale;
      this.decks[1].el.volume = gainB * volScale;
    }
    this.notifyDjListeners();
  }

  public resetDjNodes() {
    this.djEqDb = [
      { low: 0, mid: 0, high: 0 },
      { low: 0, mid: 0, high: 0 },
    ];
    this.djCrossfaderVal = 0.5;
    if (this.decks) {
      this.decks.forEach((d, idx) => {
        d.el.pause();
        d.el.playbackRate = this.playbackRate;
        if (this.ctx) {
          const now = this.ctx.currentTime;
          d.eqLow?.gain.setTargetAtTime(0, now, 0.02);
          d.eqMid?.gain.setTargetAtTime(0, now, 0.02);
          d.eqHigh?.gain.setTargetAtTime(0, now, 0.02);
          d.deckGain?.gain.setTargetAtTime(idx === this.activeDeckIdx ? 1 : 0, now, 0.02);
        }
      });
    }
    this.notifyDjListeners();
  }

  public getDjState(): {
    decks: [DjDeckSnapshot, DjDeckSnapshot];
    crossfader: number;
  } {
    const readDeck = (idx: 0 | 1): DjDeckSnapshot => {
      const d = this.decks?.[idx];
      const eq = this.djEqDb[idx];
      return {
        trackId: d?.currentTrackId || null,
        playing: Boolean(d && !d.el.paused),
        currentTime: d?.el.currentTime || 0,
        duration: d && Number.isFinite(d.el.duration) ? d.el.duration : 0,
        playbackRate: d?.el.playbackRate || 1,
        eqLow: eq.low,
        eqMid: eq.mid,
        eqHigh: eq.high,
      };
    };
    return {
      decks: [readDeck(0), readDeck(1)],
      crossfader: this.djCrossfaderVal,
    };
  }

  public onDjStateChange(cb: () => void) {
    this.djStateListeners.add(cb);
    return () => this.djStateListeners.delete(cb);
  }
}

export const audioDspEngine = new AudioDspEngine();

