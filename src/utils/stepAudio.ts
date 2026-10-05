// ==============================================================================
// 容錯式智慧地墊 - 雙層獨立音訊引擎 (84 BPM 恆定)
// 包含專為 45~75 歲設計的三階段原創純器樂無人聲曲目：
// 1. 《窗邊晚咖啡》(45~55歲 - 1990s 華語成人流行)
// 2. 《漫步回家》(55~65歲 - 1980s 校園城市民歌)
// 3. 《午後暖陽》(65~75歲 - 1960~70s 懷舊電台抒情)
//
// 音訊拓撲架構：
// 第 1 層（伴奏音樂層）：音檔或合成器 ──▶ Biquad 低通濾波器 ──▶ 伴奏增益 ──▶ Destination
// 第 2 層（獨立節拍音層）：木質節拍器短音 ──────────────────────▶ 節拍增益 ──▶ Destination
// ==============================================================================

import { RetroTrackKey } from '../types/experiment';

class StepAudioManager {
  private audioCtx: AudioContext | null = null;
  private biquadFilter: BiquadFilterNode | null = null;
  private accompanimentGain: GainNode | null = null;
  private metronomeGain: GainNode | null = null;

  private isMuted: boolean = false;
  private isDegraded: boolean = false;
  private currentTrackKey: RetroTrackKey = 'evening_coffee';

  // 使用者自訂上傳之 MP3 音訊元素與來源節點快取
  private customAudioElements: Record<RetroTrackKey, HTMLAudioElement | null> = {
    evening_coffee: null,
    slow_walk_home: null,
    afternoon_sunshine: null
  };
  private customSourceNodes: Record<RetroTrackKey, MediaElementAudioSourceNode | null> = {
    evening_coffee: null,
    slow_walk_home: null,
    afternoon_sunshine: null
  };
  private customAudioUrls: Record<RetroTrackKey, string | null> = {
    evening_coffee: null,
    slow_walk_home: null,
    afternoon_sunshine: null
  };

  // 通用 BGM (Scheme B)
  private genericBgmAudio: HTMLAudioElement | null = null;
  private genericSourceNode: MediaElementAudioSourceNode | null = null;

  // 試聽計時器
  private previewInterval: any = null;
  private isPreviewPlaying: boolean = false;

  public init() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.audioCtx && !this.biquadFilter) {
      // 第 1 層：伴奏音樂層（經低通濾波器）
      this.biquadFilter = this.audioCtx.createBiquadFilter();
      this.biquadFilter.type = 'lowpass';
      this.biquadFilter.frequency.setValueAtTime(14000, this.audioCtx.currentTime);

      this.accompanimentGain = this.audioCtx.createGain();
      this.accompanimentGain.gain.setValueAtTime(0.55, this.audioCtx.currentTime);

      this.biquadFilter.connect(this.accompanimentGain);
      this.accompanimentGain.connect(this.audioCtx.destination);

      // 第 2 層：獨立節拍音專屬音軌（直通 destination，絕不受濾波器影響）
      this.metronomeGain = this.audioCtx.createGain();
      this.metronomeGain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
      this.metronomeGain.connect(this.audioCtx.destination);
    }
  }

  // 設定當前選用之分齡曲目
  public setRetroTrack(trackKey: RetroTrackKey) {
    this.currentTrackKey = trackKey;
  }

  public getRetroTrack(): RetroTrackKey {
    return this.currentTrackKey;
  }

  // 載入使用者上傳之 MP3 檔案或 Blob URL
  public setCustomAudioTrack(trackKey: RetroTrackKey, audioUrl: string) {
    this.init();
    this.customAudioUrls[trackKey] = audioUrl;

    if (this.audioCtx && this.biquadFilter) {
      try {
        if (this.customAudioElements[trackKey]) {
          this.customAudioElements[trackKey]!.pause();
          this.customAudioElements[trackKey]!.src = audioUrl;
        } else {
          const audio = new Audio(audioUrl);
          audio.loop = true;
          audio.crossOrigin = 'anonymous';
          this.customAudioElements[trackKey] = audio;
          const srcNode = this.audioCtx.createMediaElementSource(audio);
          srcNode.connect(this.biquadFilter);
          this.customSourceNodes[trackKey] = srcNode;
        }
      } catch (e) {
        console.warn("Custom audio node setup notice:", e);
      }
    }
  }

  public getCustomAudioUrl(trackKey: RetroTrackKey): string | null {
    return this.customAudioUrls[trackKey];
  }

  public hasCustomAudio(trackKey: RetroTrackKey): boolean {
    return Boolean(this.customAudioUrls[trackKey]);
  }

  // 播放當前選用曲目
  public playCurrentTrack(scheme: 'A' | 'B') {
    this.init();
    if (scheme === 'A') {
      const customAudio = this.customAudioElements[this.currentTrackKey];
      if (customAudio && this.customAudioUrls[this.currentTrackKey]) {
        customAudio.muted = this.isMuted;
        customAudio.currentTime = 0;
        customAudio.play().catch(e => console.log("Custom MP3 playback notice:", e));
      }
    } else {
      if (this.genericBgmAudio) {
        this.genericBgmAudio.muted = this.isMuted;
        this.genericBgmAudio.play().catch(e => console.log("Generic BGM notice:", e));
      }
    }
  }

  public stopAllMusic() {
    // 停止所有自訂 MP3
    Object.keys(this.customAudioElements).forEach(key => {
      const audio = this.customAudioElements[key as RetroTrackKey];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (this.genericBgmAudio) {
      this.genericBgmAudio.pause();
      this.genericBgmAudio.currentTime = 0;
    }
    this.stopPreview();
    this.restoreTimbre(100);
  }

  // 設定通用 BGM (Scheme B)
  public setupBgm(url: string, volume: number = 0.25) {
    this.init();
    if (!this.audioCtx || !this.biquadFilter) return;

    if (!this.genericBgmAudio) {
      this.genericBgmAudio = new Audio(url);
      this.genericBgmAudio.crossOrigin = 'anonymous';
      this.genericBgmAudio.loop = true;
      try {
        this.genericSourceNode = this.audioCtx.createMediaElementSource(this.genericBgmAudio);
        this.genericSourceNode.connect(this.biquadFilter);
      } catch (e) {
        console.warn("Direct generic source notice:", e);
      }
    } else {
      if (this.genericBgmAudio.src !== url) {
        this.genericBgmAudio.src = url;
      }
    }
    this.genericBgmAudio.volume = volume;
  }

  public playBgm() {
    this.init();
    if (this.genericBgmAudio) {
      this.genericBgmAudio.muted = this.isMuted;
      this.genericBgmAudio.play().catch(e => console.log("BGM play notice:", e));
    }
  }

  public stopBgm() {
    if (this.genericBgmAudio) {
      this.genericBgmAudio.pause();
      this.genericBgmAudio.currentTime = 0;
    }
    this.restoreTimbre(100);
  }

  // A方案：音訊優雅降級 (伴奏層平滑過渡至低通截止頻率，例如 600Hz)
  public degradeTimbre(cutoffHz: number = 600, transitionMs: number = 400) {
    if (!this.audioCtx || !this.biquadFilter) return;
    this.isDegraded = true;
    const now = this.audioCtx.currentTime;
    const duration = transitionMs / 1000;
    this.biquadFilter.frequency.cancelScheduledValues(now);
    this.biquadFilter.frequency.setValueAtTime(this.biquadFilter.frequency.value, now);
    this.biquadFilter.frequency.exponentialRampToValueAtTime(Math.max(100, cutoffHz), now + duration);
  }

  // A方案：恢復標準達成後，平滑還原伴奏音色至明亮原始狀態
  public restoreTimbre(transitionMs: number = 400) {
    if (!this.audioCtx || !this.biquadFilter) return;
    this.isDegraded = false;
    const now = this.audioCtx.currentTime;
    const duration = transitionMs / 1000;
    this.biquadFilter.frequency.cancelScheduledValues(now);
    this.biquadFilter.frequency.setValueAtTime(this.biquadFilter.frequency.value, now);
    this.biquadFilter.frequency.exponentialRampToValueAtTime(14000, now + duration);
  }

  // ============================================================================
  // 第 2 層：獨立節拍音層 (Rhythmic Auditory Cueing)
  // 架構說明：完全獨立於伴奏音軌，直接直通 destination，絕不受伴奏低通濾波影響
  // ============================================================================
  public playIndependentMetronomeBeat(isAccented: boolean = false) {
    if (this.isMuted || !this.audioCtx) return;
    try {
      this.init();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // 木質節拍器短音（第 1 拍重音 880Hz，第 2~4 拍 660Hz）
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isAccented ? 880 : 660, now);

      gain.gain.setValueAtTime(isAccented ? 0.22 : 0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(gain);
      if (this.metronomeGain) {
        gain.connect(this.metronomeGain);
      } else {
        gain.connect(this.audioCtx.destination);
      }

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {
      console.error("Metronome beat error", e);
    }
  }

  // ============================================================================
  // 第 1 層：伴奏音樂層（經 lowpass 濾波器管線）
  // 若使用者已載入 MP3，由 HTML5 Audio 負責發聲；若未載入，由專屬 procedural 模組合成
  // ============================================================================
  public playAccompanimentBeat(beatIndex: number, scheme: 'A' | 'B') {
    if (this.isMuted || !this.audioCtx || !this.biquadFilter) return;

    // 若當前曲目已有 MP3 音檔在播放，則伴奏已在發聲，不需要重複合成伴奏拍
    if (scheme === 'A' && this.customAudioElements[this.currentTrackKey] && !this.customAudioElements[this.currentTrackKey]!.paused) {
      return;
    }

    try {
      this.init();
      const now = this.audioCtx.currentTime;

      if (scheme === 'A') {
        const track = this.currentTrackKey;

        if (track === 'evening_coffee') {
          // ====================================================================
          // 1. 《窗邊晚咖啡》 45~55 歲 (1990 年代華語成人流行 Adult Contemporary)
          // 數位電鋼琴 (DX7 E-Piano) 核心旋律 + 柔和合成弦樂 + 圓潤電貝斯 (84 BPM)
          // 和弦進行：Cmaj9 - Am9 - Fmaj7 - G7sus4 (4小節對稱循環，共 16 拍)
          // ====================================================================
          const epMelody = [
            // 小節 1: Cmaj9 (E4, G4, B4, D5)
            329.63, 392.00, 493.88, 587.33,
            // 小節 2: Am9 (C5, B4, A4, E4)
            523.25, 493.88, 440.00, 329.63,
            // 小節 3: Fmaj7 (A4, C5, E5, D5)
            440.00, 523.25, 659.25, 587.33,
            // 小節 4: G7sus4 (D5, C5, B4, G4)
            587.33, 523.25, 493.88, 392.00
          ];

          const melodyFreq = epMelody[beatIndex % epMelody.length];
          if (melodyFreq > 0) {
            // 90 年代數位電鋼琴鐘音感合成 (FM Bell-Tine Synth)
            const oscTine = this.audioCtx.createOscillator();
            const oscBody = this.audioCtx.createOscillator();
            const noteGain = this.audioCtx.createGain();

            oscTine.type = 'sine';
            oscBody.type = 'triangle';

            oscTine.frequency.setValueAtTime(melodyFreq * 2, now); // 高八度鐘音
            oscBody.frequency.setValueAtTime(melodyFreq, now);

            noteGain.gain.setValueAtTime(0.001, now);
            noteGain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
            noteGain.gain.exponentialRampToValueAtTime(0.08, now + 0.25);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);

            oscTine.connect(noteGain);
            oscBody.connect(noteGain);
            noteGain.connect(this.biquadFilter);

            oscTine.start(now);
            oscBody.start(now);
            oscTine.stop(now + 0.7);
            oscBody.stop(now + 0.7);
          }

          // 圓潤電貝斯 (緊扣每拍)
          const bassNotes = [
            130.81, 130.81, 130.81, 130.81, // C
            110.00, 110.00, 110.00, 110.00, // A
            87.31,  87.31,  87.31,  87.31,  // F
            98.00,  98.00,  98.00,  98.00   // G
          ];
          const bassFreq = bassNotes[beatIndex % bassNotes.length];
          const bassOsc = this.audioCtx.createOscillator();
          const bassGain = this.audioCtx.createGain();
          bassOsc.type = 'sine';
          bassOsc.frequency.setValueAtTime(bassFreq, now);
          bassGain.gain.setValueAtTime(0.12, now);
          bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          bassOsc.connect(bassGain);
          bassGain.connect(this.biquadFilter);
          bassOsc.start(now);
          bassOsc.stop(now + 0.5);

          // 柔和合成弦樂襯底 (每 4 拍換和弦)
          const chords90s = [
            [261.63, 329.63, 392.00, 493.88], // Cmaj9
            [220.00, 261.63, 329.63, 392.00], // Am9
            [174.61, 220.00, 261.63, 329.63], // Fmaj7
            [196.00, 261.63, 293.66, 349.23]  // G7sus4
          ];
          const currentChord = chords90s[Math.floor(beatIndex / 4) % chords90s.length];
          currentChord.forEach((f, idx) => {
            const osc = this.audioCtx!.createOscillator();
            const gain = this.audioCtx!.createGain();
            osc.type = 'sine';
            const noteStart = now + idx * 0.03;
            osc.frequency.setValueAtTime(f, noteStart);
            gain.gain.setValueAtTime(0.025, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.6);
            osc.connect(gain);
            gain.connect(this.biquadFilter!);
            osc.start(noteStart);
            osc.stop(noteStart + 0.65);
          });

        } else if (track === 'slow_walk_home') {
          // ====================================================================
          // 2. 《漫步回家》 55~65 歲 (1980 年代校園民歌 × 城市流行 Campus Folk)
          // 鋼弦木吉他掃弦打底 + 原聲鋼琴 + 長笛木管 + 輕柔原聲鼓組沙鈴 (84 BPM)
          // 和弦進行：C - G/B - Am7 - Em - F - C - Dm7 - G (8小節，共 32 拍)
          // ====================================================================
          const fluteMelody = [
            // C: 漫步在熟悉校園
            523.25, 493.88, 440.00, 392.00,
            // G/B: 陽光穿透樹梢
            392.00, 440.00, 493.88, 523.25,
            // Am7: 輕輕哼起老歌
            440.00, 392.00, 329.63, 293.66,
            // Em: 微風吹拂衣角
            329.63, 392.00, 440.00, 392.00,
            // F: 伴著回憶回家
            349.23, 392.00, 440.00, 523.25,
            // C: 心情悠閒舒暢
            523.25, 440.00, 392.00, 329.63,
            // Dm7: 一步一步向前
            293.66, 329.63, 349.23, 392.00,
            // G: 走向溫暖的家
            392.00, 349.23, 293.66, 261.63
          ];

          const melodyFreq = fluteMelody[beatIndex % fluteMelody.length];
          if (melodyFreq > 0) {
            // 長笛木管溫暖抒情音色 (Flute / Acoustic Piano)
            const fluteOsc = this.audioCtx.createOscillator();
            const fluteGain = this.audioCtx.createGain();
            fluteOsc.type = 'triangle';
            fluteOsc.frequency.setValueAtTime(melodyFreq, now);

            fluteGain.gain.setValueAtTime(0.001, now);
            fluteGain.gain.exponentialRampToValueAtTime(0.15, now + 0.05);
            fluteGain.gain.exponentialRampToValueAtTime(0.10, now + 0.35);
            fluteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

            fluteOsc.connect(fluteGain);
            fluteGain.connect(this.biquadFilter);
            fluteOsc.start(now);
            fluteOsc.stop(now + 0.7);
          }

          // 鋼弦木吉他掃弦 (Acoustic Guitar Strum)
          const guitarChords = [
            [261.63, 329.63, 392.00], // C
            [246.94, 293.66, 392.00], // G/B
            [220.00, 261.63, 329.63], // Am7
            [164.81, 246.94, 329.63], // Em
            [174.61, 220.00, 261.63], // F
            [261.63, 329.63, 392.00], // C
            [146.83, 220.00, 261.63], // Dm7
            [196.00, 246.94, 293.66]  // G
          ];
          const chord = guitarChords[Math.floor(beatIndex / 4) % guitarChords.length];
          chord.forEach((freq, idx) => {
            const strumOsc = this.audioCtx!.createOscillator();
            const strumGain = this.audioCtx!.createGain();
            strumOsc.type = 'triangle';
            const strumTime = now + idx * 0.025;
            strumOsc.frequency.setValueAtTime(freq, strumTime);
            strumGain.gain.setValueAtTime(0.04, strumTime);
            strumGain.gain.exponentialRampToValueAtTime(0.0001, strumTime + 0.4);
            strumOsc.connect(strumGain);
            strumGain.connect(this.biquadFilter!);
            strumOsc.start(strumTime);
            strumOsc.stop(strumTime + 0.45);
          });

          // 沙鈴輕柔四拍聲 (Shaker / Tambourine)
          const shakerGain = this.audioCtx.createGain();
          const shakerOsc = this.audioCtx.createOscillator();
          shakerOsc.type = 'sine';
          shakerOsc.frequency.setValueAtTime(1200 + (beatIndex % 2) * 400, now);
          shakerGain.gain.setValueAtTime(0.015, now);
          shakerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
          shakerOsc.connect(shakerGain);
          shakerGain.connect(this.biquadFilter);
          shakerOsc.start(now);
          shakerOsc.stop(now + 0.09);

        } else {
          // ====================================================================
          // 3. 《午後暖陽》 65~75 歲 (1960~70s 華語電台抒情 Time Radio Nostalgia)
          // 溫暖原聲鋼琴主旋律 + 長笛單簧管 + 柔和弦樂群 + Tremolo 顫音吉他 (84 BPM)
          // 和弦進行：C - A7 - Dm7 - G7 - Em7 - A7 - Dm7 - G7 (8小節，共 32 拍)
          // ====================================================================
          const radioPianoMelody = [
            // C: 午後暖陽灑落客廳
            523.25, 523.25, 587.33, 523.25,
            // A7: 老收音機悠揚旋律
            440.00, 493.88, 523.25, 440.00,
            // Dm7: 一杯熱茶溫暖手心
            392.00, 440.00, 392.00, 349.23,
            // G7: 平靜安心漫步時光
            329.63, 293.66, 261.63, 293.66,
            // Em7: 舊唱片裡歲月靜好
            329.63, 392.00, 440.00, 523.25,
            // A7: 兒時熟悉的歌謠
            440.00, 392.00, 349.23, 440.00,
            // Dm7: 步伐穩健從容踏步
            392.00, 349.23, 293.66, 261.63,
            // G7: 暖陽伴我常安康
            261.63, 261.63, 261.63, 0
          ];

          const melodyFreq = radioPianoMelody[beatIndex % radioPianoMelody.length];
          if (melodyFreq > 0) {
            // 溫暖原聲鋼琴 (Acoustic Grand Piano)
            const pianoOsc = this.audioCtx.createOscillator();
            const pianoGain = this.audioCtx.createGain();
            pianoOsc.type = 'triangle';
            pianoOsc.frequency.setValueAtTime(melodyFreq, now);

            pianoGain.gain.setValueAtTime(0.001, now);
            pianoGain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
            pianoGain.gain.exponentialRampToValueAtTime(0.11, now + 0.35);
            pianoGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

            pianoOsc.connect(pianoGain);
            pianoGain.connect(this.biquadFilter);
            pianoOsc.start(now);
            pianoOsc.stop(now + 0.75);
          }

          // 真空管電台和弦 (C - A7 - Dm7 - G7 經典抒情迴圈)
          const radioChords = [
            [261.63, 329.63, 392.00], // C
            [220.00, 277.18, 329.63], // A7
            [146.83, 220.00, 261.63], // Dm7
            [196.00, 246.94, 293.66], // G7
            [164.81, 246.94, 329.63], // Em7
            [220.00, 277.18, 329.63], // A7
            [146.83, 220.00, 261.63], // Dm7
            [196.00, 246.94, 293.66]  // G7
          ];
          const chord = radioChords[Math.floor(beatIndex / 4) % radioChords.length];
          chord.forEach((freq, idx) => {
            const swellOsc = this.audioCtx!.createOscillator();
            const swellGain = this.audioCtx!.createGain();
            swellOsc.type = 'sine';
            const chordTime = now + idx * 0.03;
            swellOsc.frequency.setValueAtTime(freq, chordTime);
            swellGain.gain.setValueAtTime(0.035, chordTime);
            swellGain.gain.exponentialRampToValueAtTime(0.0001, chordTime + 0.6);
            swellOsc.connect(swellGain);
            swellGain.connect(this.biquadFilter!);
            swellOsc.start(chordTime);
            swellOsc.stop(chordTime + 0.65);
          });

          // 輕柔鼓刷 (Brush Snare)
          const brushOsc = this.audioCtx.createOscillator();
          const brushGain = this.audioCtx.createGain();
          brushOsc.type = 'sine';
          brushOsc.frequency.setValueAtTime(240, now);
          brushGain.gain.setValueAtTime(0.02, now);
          brushGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
          brushOsc.connect(brushGain);
          brushGain.connect(this.biquadFilter);
          brushOsc.start(now);
          brushOsc.stop(now + 0.14);
        }
      } else {
        // B方案：現代電子節奏方塊和弦 (84 BPM 清晰雙軌脈動)
        const bChords = [
          [220.00, 261.63, 329.63], // Am
          [174.61, 220.00, 261.63], // F
          [261.63, 329.63, 392.00], // C
          [196.00, 246.94, 293.66]  // G
        ];
        const chord = bChords[Math.floor(beatIndex / 4) % bChords.length];

        chord.forEach((freq, idx) => {
          const osc = this.audioCtx!.createOscillator();
          const gain = this.audioCtx!.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.02);
          gain.gain.setValueAtTime(0.03, now + idx * 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

          osc.connect(gain);
          gain.connect(this.biquadFilter!);
          osc.start(now + idx * 0.02);
          osc.stop(now + 0.5);
        });
      }
    } catch (e) {
      // ignore
    }
  }

  // 試聽分齡懷舊曲目 (供首頁或設定面板即時試聽 16 拍)
  public startPreview(trackKey?: RetroTrackKey, onBeatTick?: (beat: number) => void, onComplete?: () => void) {
    this.stopPreview();
    if (trackKey) {
      this.setRetroTrack(trackKey);
    }
    const currentKey = trackKey || this.currentTrackKey;

    this.init();
    this.restoreTimbre(50);
    this.isPreviewPlaying = true;

    // 若該曲目已有使用者上傳的 MP3 音檔，直接播放該音檔
    const customAudio = this.customAudioElements[currentKey];
    if (customAudio && this.customAudioUrls[currentKey]) {
      customAudio.currentTime = 0;
      customAudio.muted = this.isMuted;
      customAudio.play().catch(e => console.log("Preview custom MP3 error:", e));

      // 設置 16 拍倒數 (84 BPM: ~714ms / beat)
      let beat = 0;
      const maxBeats = 16;
      const intervalMs = Math.round(60000 / 84);

      this.previewInterval = setInterval(() => {
        beat++;
        if (onBeatTick) onBeatTick(beat);
        this.playIndependentMetronomeBeat(beat % 4 === 0);
        if (beat >= maxBeats || !this.isPreviewPlaying) {
          this.stopPreview();
          if (onComplete) onComplete();
        }
      }, intervalMs);
      return;
    }

    // 若無音檔，使用 procedural 合成器試聽 16 拍
    let beat = 0;
    const maxBeats = 16;
    const intervalMs = Math.round(60000 / 84); // 84 BPM ~714ms

    this.playAccompanimentBeat(beat, 'A');
    this.playIndependentMetronomeBeat(true);
    if (onBeatTick) onBeatTick(beat);
    beat++;

    this.previewInterval = setInterval(() => {
      if (beat >= maxBeats || !this.isPreviewPlaying) {
        this.stopPreview();
        if (onComplete) onComplete();
        return;
      }
      this.playAccompanimentBeat(beat, 'A');
      this.playIndependentMetronomeBeat(beat % 4 === 0);
      if (onBeatTick) onBeatTick(beat);
      beat++;
    }, intervalMs);
  }

  public stopPreview() {
    this.isPreviewPlaying = false;
    if (this.previewInterval) {
      clearInterval(this.previewInterval);
      this.previewInterval = null;
    }
    // 停止正在播放的試聽自訂音檔
    Object.keys(this.customAudioElements).forEach(key => {
      const audio = this.customAudioElements[key as RetroTrackKey];
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  }

  public getIsPreviewPlaying(): boolean {
    return this.isPreviewPlaying;
  }

  // 踏中/踩踏回饋音 (即時聽覺反饋，支援前導校準階段之中性回饋)
  public playHitSound(isSuccess: boolean, scheme: 'A' | 'B' = 'A', isNeutralFeedback: boolean = false) {
    if (this.isMuted || !this.audioCtx) return;
    try {
      this.init();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      if (isNeutralFeedback) {
        // 前導測試專用：中性回饋 (Neutral Feedback，不具挫折感或懲罰性，純節奏與動作確認)
        if (isSuccess) {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now); // C5 清脆平穩音
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        } else {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(261.63, now); // C4 柔和低階提示
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        }
      } else if (isSuccess) {
        if (scheme === 'A') {
          // A方案：溫暖黑膠復古鋼琴木質音
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
          gain.gain.setValueAtTime(0.14, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        } else {
          // B方案：輕快節奏方塊電子合音
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
          gain.gain.setValueAtTime(0.11, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        }
      } else {
        // 未踩中或錯區：中性柔和低階踏步聲（不具責備感）
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.1);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      }

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn("Step hit sound error", e);
    }
  }

  // 準備提示音 (4 拍準備)
  public playPrepBeep(isFinal: boolean = false) {
    if (this.isMuted || !this.audioCtx) return;
    try {
      this.init();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.35 : 0.12));

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + (isFinal ? 0.4 : 0.15));
    } catch (e) {
      console.warn("Prep beep sound error", e);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.genericBgmAudio) {
      this.genericBgmAudio.muted = muted;
    }
    Object.keys(this.customAudioElements).forEach(key => {
      const audio = this.customAudioElements[key as RetroTrackKey];
      if (audio) {
        audio.muted = muted;
      }
    });
    if (muted) {
      this.stopPreview();
    }
  }

  // B方案：中性提示音
  public playNeutralCueTone() {
    if (this.isMuted || !this.audioCtx) return;
    try {
      this.init();
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, now);
      osc.frequency.setValueAtTime(329.63, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch (e) {
      console.warn("Neutral cue tone error", e);
    }
  }

  public toggleMute(): boolean {
    return !this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }
}

export const stepAudio = new StepAudioManager();
