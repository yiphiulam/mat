// ==============================================================================
// 容錯式智慧地墊互動設計之發展與評估 - 核心實驗規範與前導參數設定
//
// 本研究之多模態恢復支持理論架構（Multimodal Recovery Support）：
// ①【何時踩 (When to Step)】：獨立節拍軌持續提供恆定 84 BPM 時間參照（木質短音直通輸出，不受降級濾波影響）
// ②【踩哪裡 (Where to Step)】：畫面視覺軌道提供目標落點與修正文字（4 格橫向軌道、垂直下降、判定線與文字導引）
// ③【目前狀態 (Current Status)】：音訊優雅降級（Graceful Audio Degradation）屬於任務狀態回饋：
//    - 偏差成立時，伴奏音色平滑改變（低通濾波過渡至沉悶音色）；
//    - 達成連續 4 拍合格恢復標準後，伴奏音色平滑還原至清澈明亮。
// 三類資訊分別對應「何時踩」、「踩哪裡」與「目前狀態」，共同形成容錯與步態節奏恢復支持。
// ==============================================================================

export type SchemeType = 'A' | 'B'; // A: 懷舊容錯留聲機 | B: 一般移動方塊
export type FootTarget = 'L2' | 'L1' | 'R1' | 'R2'; // 4格橫向：左外側(L2), 左內側(L1), 右內側(R1), 右外側(R2)
export type SessionMode = 'demo' | 'practice' | 'calibration_r1' | 'calibration_r2' | 'formal'; // 體驗模式 | 不計分練習(45~60s) | 第1輪認知校準 | 第2輪難度邊界測試 | 正式活動(60~120s)

export type SpeedPerception = 'too_fast' | 'just_right' | 'too_slow' | 'unrated';

export interface CalibrationRoundRecord {
  round: 1 | 2;
  bpm: number;
  toleranceMs: number;
  durationSec: number;
  totalScheduled: number;
  successful: number;
  missed: number;
  wrongZone: number;
  extraContacts: number;
  accuracyRate: number; // 0 ~ 100
  perception: SpeedPerception;
  notes?: string;
  completedAt: string;
}

export interface CalibrationProfile {
  isLocked: boolean; // 是否已鎖定至正式實驗
  lockedBpm: number;
  lockedToleranceMs: number;
  round1Record?: CalibrationRoundRecord;
  round2Record?: CalibrationRoundRecord;
  readinessPassed: boolean;
  readinessFeedback: string;
}

export type RetroTrackKey = 'evening_coffee' | 'slow_walk_home' | 'afternoon_sunshine';

export interface PilotSettingsSnapshot {
  version: string; // e.g. "Pilot-v1.2.0-Calibrated"
  statusLabel: string; // "分齡懷舊純器樂／校準雙軌"
  bpm: number; // 速度 (預設 84 BPM，可校準為 60/72/80/84)
  previewBeats: number; // 2 拍預告
  prepBeats: number; // 4 拍準備
  toleranceRatio: number; // 0.20 (20%)
  customToleranceMs?: number; // 獨立反應窗 (ms, 例如 600ms, 450ms, 350ms)
  isCalibratedLocked: boolean; // 是否鎖定校準參數（同受試者兩方案等同）
  calibratedBpm?: number;
  calibratedToleranceMs?: number;
  // A方案音訊優雅降級 (Graceful Audio Degradation) 參數
  aSchemeFilterCutoffNormal: number; // 正常截止頻率 (Hz) e.g. 20000
  aSchemeFilterCutoffDegraded: number; // 降級低通截止頻率 (Hz) e.g. 600
  aSchemeFilterTransitionMs: number; // 音色平滑過渡時間 (ms) e.g. 400
  // 偏差與恢復標準
  deviationErrorThreshold: number; // 連續 2 個不合格成立偏差
  recoverySuccessThreshold: number; // 偏差成立後連續 4 個合格達成恢復
  // 時間設定 (秒)
  demoDurationSec: number; // 示範長度 (可調，預設 60s)
  practiceDurationSec: number; // 練習長度 45s ~ 60s
  formalDurationSec: number; // 正式長度 (60s ~ 120s)
  voluntaryMaxSec: number; // 自願再體驗最多 180s
}

export const DEFAULT_PILOT_SETTINGS: PilotSettingsSnapshot = {
  version: 'Pilot-v1.2.0-Calibrated',
  statusLabel: '分齡懷舊純器樂／雙輪校準',
  bpm: 80, // 初始示範 80 BPM
  previewBeats: 2,
  prepBeats: 4,
  toleranceRatio: 0.20,
  customToleranceMs: 600, // 初始示範 600 ms 反應窗
  isCalibratedLocked: false,
  calibratedBpm: 80,
  calibratedToleranceMs: 600,
  aSchemeFilterCutoffNormal: 20000,
  aSchemeFilterCutoffDegraded: 600,
  aSchemeFilterTransitionMs: 400,
  deviationErrorThreshold: 2,
  recoverySuccessThreshold: 4,
  demoDurationSec: 60,
  practiceDurationSec: 45,
  formalDurationSec: 120, // 預設 120s (提供 60s ~ 120s 範圍)
  voluntaryMaxSec: 180,
};

// 踩踏目標定義
export interface StepTarget {
  id: number;
  beatIndex: number;
  foot: FootTarget; // 'L2' | 'L1' | 'R1' | 'R2'
  scheduledTimeMs: number; // 音訊/時序基準上的預定拍點時間
  windowStartMs: number; // scheduledTimeMs - toleranceMs
  windowEndMs: number; // scheduledTimeMs + toleranceMs
  evaluated: boolean;
  status: 'pending' | 'success' | 'miss' | 'wrong_zone';
  firstContactTimeMs?: number;
  extraContactsCount: number;
}

// 偏差事件與恢復紀錄 (PERL: Post-Error Recovery Latency)
export interface DeviationRecoveryEvent {
  eventId: number;
  scheme: SchemeType;
  deviationStartTimeMs: number; // 系統時鐘時間戳 (performance.now())
  relativeStartMs?: number; // 相對於本次踩踏活動開始之時間 (ms)
  recoveryEndTimeMs?: number; // 系統時鐘恢復時間戳 (performance.now())
  relativeEndMs?: number; // 相對於本次踩踏活動開始之恢復時間 (ms)
  perlMs?: number; // PERL = recoveryEndTimeMs - deviationStartTimeMs
  isRecovered: boolean;
  isRightCensored: boolean; // 正常活動結束仍未恢復 (右設限)
  interruptionReason?: 'none' | 'rest' | 'signal_loss' | 'manual_assist' | 'safety_stop';
}

// 三階段分齡原創純器樂曲目規格 (專為 45~75 歲使用者在智慧地墊節奏踩踏活動中設計)
export interface RetroTrackResource {
  id: RetroTrackKey;
  targetAge: string;
  ageRangeLabel: string;
  era: string;
  title: string;
  englishTitle: string;
  artist: string;
  label: string;
  bpm: number; // 嚴格恆定 84 BPM
  description: string;
  instruments: string[];
  customAudioUrl?: string; // 使用者或研究者直接上傳/播放之 MP3 URL
  customFileName?: string;
}

export const RETRO_AGE_TRACKS: Record<RetroTrackKey, RetroTrackResource> = {
  evening_coffee: {
    id: 'evening_coffee',
    targetAge: '45 至 55 歲',
    ageRangeLabel: '45~55歲 中壯年',
    era: '1990 年代華語成人流行 (Adult Contemporary)',
    title: '《窗邊晚咖啡》',
    englishTitle: 'Evening Coffee by the Window',
    artist: '原創純器樂 (無人聲無歌詞)',
    label: '45~55歲專屬曲目：90年代都會抒情流行，重現青春回憶感',
    bpm: 84,
    description: '純器樂無人聲，以經典溫暖明亮的數位電鋼琴為核心旋律，搭配柔和合成弦樂、圓潤電貝斯與 Chorus 空間感乾淨電吉他，恆定 84 BPM 清晰四拍脈動，無縫循環。',
    instruments: ['數位電鋼琴 (DX7 溫暖音色)', '柔和合成弦樂', '圓潤電貝斯', 'Chorus 清音電吉他', '低音大鼓精準四拍']
  },
  slow_walk_home: {
    id: 'slow_walk_home',
    targetAge: '55 至 65 歲',
    ageRangeLabel: '55~65歲 熟齡層',
    era: '1980 年代華語流行 × 城市民歌 (Campus Folk & Pop)',
    title: '《漫步回家》',
    englishTitle: 'The Slow Walk Home',
    artist: '原創純器樂 (無人聲無歌詞)',
    label: '55~65歲專屬曲目：80年代校園民歌氛圍，郊遊與電台生活感',
    bpm: 84,
    description: '清亮溫暖鋼弦木吉他掃弦打底，搭配原聲鋼琴、長笛木管、早期電鋼琴與柔和弦樂，圓潤電貝斯結合輕柔原聲鼓組、沙鈴與鈴鼓，結構對稱且無縫循環。',
    instruments: ['鋼弦木吉他掃弦', '原聲鋼琴 (Acoustic Piano)', '長笛木管 (Flute)', '早期數位電鋼琴', '原聲鼓組與沙鈴鈴鼓']
  },
  afternoon_sunshine: {
    id: 'afternoon_sunshine',
    targetAge: '65 至 75 歲',
    ageRangeLabel: '65~75歲 高齡長輩',
    era: '1960 年代末至 1970 年代華語電台抒情 (Time Radio Nostalgia)',
    title: '《午後暖陽》',
    englishTitle: 'Time Radio - Afternoon Sunshine',
    artist: '原創純器樂 (無人聲無歌詞)',
    label: '65~75歲專屬曲目：真空管收音機與老唱片質感，親切安心生活感',
    bpm: 84,
    description: '以溫暖原聲鋼琴彈奏優雅抒情主旋律，輔以柔和弦樂群、長笛、單簧管及 Tremolo 顫音吉他點綴，圓潤貝斯結合鼓刷與輕柔沙鈴，穩固 84 BPM 一小節四拍規律對稱。',
    instruments: ['溫暖原聲鋼琴 (優雅主旋律)', '長笛與單簧管木管', '柔和弦樂群', 'Tremolo 顫音電吉他', '鼓刷 (Brushes) 與輕柔沙鈴']
  }
};

// 保持與既有 TrackResource 相容
export interface TrackResource {
  id: string;
  scheme: SchemeType;
  title: string;
  artist: string;
  label: string;
  url: string;
  bpm: number;
  description: string;
}

export const DEMO_TRACKS: Record<SchemeType, TrackResource> = {
  A: {
    id: 'evening_coffee',
    scheme: 'A',
    title: '分齡懷舊純器樂曲目集 (84 BPM)',
    artist: '原創無人聲器樂系列',
    label: 'A方案分齡專屬曲庫（45~75歲三階段年齡層）',
    url: '',
    bpm: 84,
    description: '包含《窗邊晚咖啡》(45~55歲)、《漫步回家》(55~65歲)、《午後暖陽》(65~75歲)，恆定 84 BPM 清晰四拍脈動。'
  },
  B: {
    id: 'track-demo-neutral-b',
    scheme: 'B',
    title: '節奏脈動雙軌樂章 (示範曲)',
    artist: 'Digital Rhythm Labs',
    label: 'B方案示範音源（現代無歌詞節奏遊戲配樂）',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73561.mp3?filename=game-music-loop-7-145285.mp3',
    bpm: 84,
    description: '標準節奏遊戲配樂，無歌詞、中性清晰雙軌推進。'
  }
};
