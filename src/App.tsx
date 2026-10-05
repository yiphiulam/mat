import React, { useState, useEffect, useRef, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Disc, Music, Footprints, 
  Sparkles, Bell, Volume2, VolumeX,
  ArrowLeft, Play, RotateCcw,
  Download, CheckCircle2,
  Bluetooth, Settings,
  Square, RefreshCw, AlertCircle,
  Upload, Coffee, Radio, Trash2,
  Lock, Unlock, Sliders, Check, ShieldCheck, Gauge, HelpCircle, Activity, ChevronRight, Info
} from 'lucide-react';
import { 
  SchemeType, FootTarget, SessionMode, PilotSettingsSnapshot, 
  DEFAULT_PILOT_SETTINGS, StepTarget, DeviationRecoveryEvent, 
  DEMO_TRACKS, RetroTrackKey, RETRO_AGE_TRACKS,
  CalibrationRoundRecord, CalibrationProfile, SpeedPerception 
} from './types/experiment';
import { stepAudio } from './utils/stepAudio';

// ==============================================================================
// 錯誤防護邊界 (Error Boundary)：杜絕任何情況下出現白畫面
// ==============================================================================
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false, errorInfo: '' };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorInfo: error.message || '未知錯誤' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorInfo: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#fcf8f2] flex flex-col items-center justify-center p-6 text-center text-gray-800">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-amber-200">
            <AlertCircle className="w-16 h-16 text-amber-600 mx-auto mb-4" />
            <h2 className="text-2xl font-black mb-2">系統已自動防護攔截</h2>
            <p className="text-sm text-gray-600 mb-4">
              活動紀錄已妥善保存。點擊下方按鈕即可重新整理並返回體驗選單。
            </p>
            <div className="p-3 bg-gray-50 rounded-xl text-xs font-mono text-gray-500 mb-6 break-all">
              {this.state.errorInfo}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full py-3 px-6 rounded-xl font-bold bg-amber-700 hover:bg-amber-800 text-white flex items-center justify-center gap-2 shadow"
            >
              <RefreshCw className="w-4 h-4" />
              重新返回體驗選單
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==============================================================================
// 智慧地墊 4 格橫向互動系統主程式
// ==============================================================================
function JukeboxApp() {
  // 實驗方案與模式控制
  const [activeScheme, setActiveScheme] = useState<SchemeType>('A');
  const [sessionMode, setSessionMode] = useState<SessionMode>('demo');
  const [pilotSettings, setPilotSettings] = useState<PilotSettingsSnapshot>(DEFAULT_PILOT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 前導校準流程控制與紀錄
  const [activePilotTab, setActivePilotTab] = useState<'calibration' | 'formal'>('calibration');
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile>({
    isLocked: false,
    lockedBpm: 80,
    lockedToleranceMs: 600,
    readinessPassed: false,
    readinessFeedback: '尚未進行前導兩輪測試。請先進行 Round 1 速度校準。'
  });
  const [calibrationRoundSummary, setCalibrationRoundSummary] = useState<CalibrationRoundRecord | null>(null);
  const [pendingPerception, setPendingPerception] = useState<SpeedPerception>('unrated');

  // 遊戲與活動狀態：'idle' | 'comfort_test' | 'prep' | 'active' | 'completed' | 'calibration_feedback'
  const [activityState, setActivityState] = useState<'idle' | 'comfort_test' | 'prep' | 'active' | 'completed' | 'calibration_feedback'>('idle');
  const [prepBeatRemaining, setPrepBeatRemaining] = useState<number>(4);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [totalTargetSec, setTotalTargetSec] = useState<number>(60);

  // 60FPS 垂直平滑下降動畫渲染時鐘
  const [animNowTimeMs, setAnimNowTimeMs] = useState<number>(0);

  // 節奏與拍點引擎狀態
  const [currentStepTargets, setCurrentStepTargets] = useState<StepTarget[]>([]);
  const stepTargetsRef = useRef<StepTarget[]>([]);
  const [beatPulse, setBeatPulse] = useState<boolean>(false);
  const [isMetronomeActive, setIsMetronomeActive] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // 三階段分齡懷舊純器樂曲目選曲 (84 BPM 恆定)
  // 1. 《窗邊晚咖啡》(45~55歲 - 1990s 華語成人流行)
  // 2. 《漫步回家》(55~65歲 - 1980s 校園城市民歌)
  // 3. 《午後暖陽》(65~75歲 - 1960~70s 懷舊電台抒情)
  const [selectedRetroTrack, setSelectedRetroTrack] = useState<RetroTrackKey>('evening_coffee');
  const [customFileNames, setCustomFileNames] = useState<Record<RetroTrackKey, string | null>>({
    evening_coffee: null,
    slow_walk_home: null,
    afternoon_sunshine: null
  });
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [previewTrack, setPreviewTrack] = useState<RetroTrackKey>('evening_coffee');

  // 本機 MP3 上傳/載入處理
  const handleUploadCustomMp3 = (trackKey: RetroTrackKey, file: File) => {
    try {
      const blobUrl = URL.createObjectURL(file);
      stepAudio.setCustomAudioTrack(trackKey, blobUrl);
      setCustomFileNames(prev => ({ ...prev, [trackKey]: file.name }));
      setSelectedRetroTrack(trackKey);
    } catch (e) {
      console.error("Custom MP3 load error:", e);
    }
  };

  // 清除載入音檔，回歸內建原創 procedural 合成管線
  const handleClearCustomMp3 = (trackKey: RetroTrackKey) => {
    stepAudio.setCustomAudioTrack(trackKey, '');
    setCustomFileNames(prev => ({ ...prev, [trackKey]: null }));
  };

  // 切換即時試聽
  const toggleTrackPreview = (trackKey: RetroTrackKey) => {
    if (isPreviewPlaying && previewTrack === trackKey) {
      stepAudio.stopPreview();
      setIsPreviewPlaying(false);
      return;
    }
    setSelectedRetroTrack(trackKey);
    setPreviewTrack(trackKey);
    setIsPreviewPlaying(true);
    stepAudio.startPreview(
      trackKey,
      undefined,
      () => setIsPreviewPlaying(false)
    );
  };

  // 4格即時打擊反饋動畫（觸發光圈波紋）
  const [hitFeedback, setHitFeedback] = useState<Record<FootTarget, { isSuccess: boolean; key: number } | null>>({
    L2: null, L1: null, R1: null, R2: null
  });

  // 偏差與恢復狀態機：'normal' | 'deviated'
  const [deviationState, setDeviationState] = useState<'normal' | 'deviated'>('normal');
  const deviationStateRef = useRef<'normal' | 'deviated'>('normal');
  const consecutiveFailsRef = useRef<number>(0);
  const consecutiveSuccessesRef = useRef<number>(0);
  const [recoveryProgressCount, setRecoveryProgressCount] = useState<number>(0);
  const [deviationEvents, setDeviationEvents] = useState<DeviationRecoveryEvent[]>([]);
  const deviationEventsRef = useRef<DeviationRecoveryEvent[]>([]);
  const nextEventIdRef = useRef<number>(1);
  const currentDeviationEventRef = useRef<DeviationRecoveryEvent | null>(null);
  const lastHighResTimestampRef = useRef<number>(0);

  // 取得保證嚴格單調遞增之高精度時間戳記 (同步強制執行 performance.now()，杜絕閉包延遲與微秒重複)
  const getSynchronousMonotonicNow = (): number => {
    const rawNow = performance.now();
    let candidate = rawNow;
    if (candidate <= lastHighResTimestampRef.current) {
      candidate = lastHighResTimestampRef.current + 0.000001;
    }
    lastHighResTimestampRef.current = candidate;
    return candidate;
  };
  const getStrictMonotonicTimestamp = getSynchronousMonotonicNow;

  // 4格物理接觸狀態（L2: 左外, L1: 左內, R1: 右內, R2: 右外）
  const [contactsActive, setContactsActive] = useState<Record<FootTarget, boolean>>({
    L2: false, L1: false, R1: false, R2: false
  });
  const contactsRef = useRef<Record<FootTarget, boolean>>({
    L2: false, L1: false, R1: false, R2: false
  });

  // 評估指標統計
  const [totalScheduledTargets, setTotalScheduledTargets] = useState(0);
  const [successfulTargetsCount, setSuccessfulTargetsCount] = useState(0);
  const [missedTargetsCount, setMissedTargetsCount] = useState(0);
  const [wrongZoneTargetsCount, setWrongZoneTargetsCount] = useState(0);
  const [extraContactsCount, setExtraContactsCount] = useState(0);

  // 藍牙智慧地墊
  const [btStatus, setBtStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [debugMat, setDebugMat] = useState<string>('');
  const deviceRef = useRef<any>(null);
  const ledCharRef = useRef<any>(null);

  // 參考計時與動畫 Frame Ref
  const activityStartTimeMsRef = useRef<number>(0);
  const activityDurationMsRef = useRef<number>(60000);
  const beatIntervalMsRef = useRef<number>(750); // 60000 / BPM (預設 80 BPM ~ 750ms)
  const toleranceMsRef = useRef<number>(600); // 預設示範 600ms 反應窗

  // 同步偏差狀態至 Ref
  useEffect(() => {
    deviationStateRef.current = deviationState;
  }, [deviationState]);

  // 同步參數 Ref (獨立區分節奏速度與反應窗)
  useEffect(() => {
    beatIntervalMsRef.current = 60000 / pilotSettings.bpm;
    toleranceMsRef.current = pilotSettings.customToleranceMs !== undefined
      ? pilotSettings.customToleranceMs
      : beatIntervalMsRef.current * pilotSettings.toleranceRatio;
  }, [pilotSettings.bpm, pilotSettings.toleranceRatio, pilotSettings.customToleranceMs]);

  // 音訊靜音連動
  useEffect(() => {
    stepAudio.setMuted(isMuted);
  }, [isMuted]);

  // 鍵盤操作監聽（4格橫向：A/S/K/L 或 1/2/3/4 或 ←/↓/↑/→）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activityState !== 'active' && activityState !== 'comfort_test') return;
      const key = e.key.toLowerCase();
      let targetLane: FootTarget | undefined = undefined;

      if (key === 'a' || key === 'd' || key === '1' || key === 'arrowleft') targetLane = 'L2';
      if (key === 's' || key === 'f' || key === '2' || key === 'arrowdown') targetLane = 'L1';
      if (key === 'j' || key === 'k' || key === '3' || key === 'arrowup') targetLane = 'R1';
      if (key === 'l' || key === '4' || key === 'arrowright') targetLane = 'R2';

      if (targetLane && !contactsRef.current[targetLane]) {
        contactsRef.current[targetLane] = true;
        setContactsActive(prev => ({ ...prev, [targetLane!]: true }));
        handlePhysicalStep(targetLane, performance.now());
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      let targetLane: FootTarget | undefined = undefined;

      if (key === 'a' || key === 'd' || key === '1' || key === 'arrowleft') targetLane = 'L2';
      if (key === 's' || key === 'f' || key === '2' || key === 'arrowdown') targetLane = 'L1';
      if (key === 'j' || key === 'k' || key === '3' || key === 'arrowup') targetLane = 'R1';
      if (key === 'l' || key === '4' || key === 'arrowright') targetLane = 'R2';

      if (targetLane) {
        contactsRef.current[targetLane] = false;
        setContactsActive(prev => ({ ...prev, [targetLane!]: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activityState]);

  // 藍牙智慧地墊連線
  const connectBluetooth = async () => {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      alert('您的瀏覽器不支援 Web Bluetooth API。請使用 Chrome 或 Edge 瀏覽器。\n\n若地墊是藍牙鍵盤模式，請在作業系統設定中連線，並直接使用 A/S/K/L 或 1/2/3/4 操作。');
      return;
    }

    if (btStatus === 'connected' && deviceRef.current) {
      deviceRef.current.gatt?.disconnect();
      return;
    }

    try {
      setBtStatus('connecting');
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000fff0-0000-1000-8000-00805f9b34fb',
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
        ]
      });

      deviceRef.current = device;
      const server = await device.gatt.connect();

      let notifyChar: any = null;
      const serviceUuids = [
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000fff0-0000-1000-8000-00805f9b34fb',
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
      ];

      for (const sUuid of serviceUuids) {
        try {
          const service = await server.getPrimaryService(sUuid);
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.notify || c.properties.indicate) {
              notifyChar = c;
            }
            if (c.properties.write || c.properties.writeWithoutResponse) {
              ledCharRef.current = c;
            }
          }
          if (notifyChar) break;
        } catch {
          // ignore
        }
      }

      if (!notifyChar) {
        throw new Error('未找到通知特徵值');
      }

      await notifyChar.startNotifications();

      const lastPressMap: Record<number, boolean> = { 0: false, 1: false, 2: false, 3: false };

      notifyChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const now = performance.now();
        const pressedCols: Record<number, boolean> = { 0: false, 1: false, 2: false, 3: false };

        if (value.byteLength >= 1) {
          const byte0 = value.getUint8(0);
          if (byte0 & 0x01) pressedCols[0] = true;
          if (byte0 & 0x02) pressedCols[1] = true;
          if (byte0 & 0x04) pressedCols[2] = true;
          if (byte0 & 0x08) pressedCols[3] = true;
        }

        const colToLane: Record<number, FootTarget> = {
          0: 'L2', 1: 'L1', 2: 'R1', 3: 'R2'
        };

        [0, 1, 2, 3].forEach(col => {
          const isPressed = pressedCols[col];
          const wasPressed = !!lastPressMap[col];
          const lane = colToLane[col];

          if (isPressed && !wasPressed) {
            lastPressMap[col] = true;
            contactsRef.current[lane] = true;
            setContactsActive(prev => ({ ...prev, [lane]: true }));
            setDebugMat(`第 ${col + 1} 格 (${lane}) 踏下`);
            handlePhysicalStep(lane, now);
          } else if (!isPressed && wasPressed) {
            lastPressMap[col] = false;
            contactsRef.current[lane] = false;
            setContactsActive(prev => ({ ...prev, [lane]: false }));
            setDebugMat(`第 ${col + 1} 格 (${lane}) 釋放`);
          }
        });
      });

      device.addEventListener('gattserverdisconnected', () => {
        setBtStatus('disconnected');
        deviceRef.current = null;
        ledCharRef.current = null;
        handleInterruption('signal_loss');
      });

      setBtStatus('connected');
    } catch (err) {
      console.error(err);
      setBtStatus('disconnected');
      deviceRef.current = null;
      ledCharRef.current = null;
    }
  };

  // 處理物理踏步接觸 (強制同步獲取 performance.now()，杜絕任何閉包與事件傳遞延遲)
  const handlePhysicalStep = (foot: FootTarget, timestampMs?: number) => {
    // 強制同步獲取當前 performance.now()
    const validatedStepTime = getSynchronousMonotonicNow();
    const startTime = activityStartTimeMsRef.current;

    console.log(
      `[Mat Physical Step] Foot: ${foot}, ` +
      `stepTime=${validatedStepTime.toFixed(6)} ms, ` +
      `(value - startTime).toFixed(6)=${(validatedStepTime - startTime).toFixed(6)} ms`
    );

    if (activityState === 'comfort_test') {
      setDebugMat(`舒適踩踏感測：${foot.startsWith('L') ? '左側' : '右側'} (${foot}) [${validatedStepTime.toFixed(3)} ms]`);
      return;
    }

    if (activityState !== 'active') return;

    // 尋找目前時間戳落在 windowStartMs ~ windowEndMs 且尚未被有效接觸標記的目標
    const targets = stepTargetsRef.current;
    let matchedIndex = -1;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.evaluated) continue;
      if (validatedStepTime >= t.windowStartMs && validatedStepTime <= t.windowEndMs) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex !== -1) {
      const target = targets[matchedIndex];
      if (!target.firstContactTimeMs) {
        // 每個目標以時間窗內第一個有效接觸事件評分
        target.firstContactTimeMs = validatedStepTime;
        const isCorrectFoot = (target.foot === foot);

        const isNeutralMode = (sessionMode === 'practice' || sessionMode === 'calibration_r1' || sessionMode === 'calibration_r2');
        if (isCorrectFoot) {
          target.status = 'success';
          stepAudio.playHitSound(true, activeScheme, isNeutralMode);
          setHitFeedback(prev => ({ ...prev, [foot]: { isSuccess: true, key: validatedStepTime } }));
        } else {
          target.status = 'wrong_zone';
          stepAudio.playHitSound(false, activeScheme, isNeutralMode);
          setHitFeedback(prev => ({ ...prev, [foot]: { isSuccess: false, key: validatedStepTime } }));
        }
      } else {
        // 同一窗內其餘接觸記為額外接觸
        target.extraContactsCount += 1;
        setExtraContactsCount(c => c + 1);
      }
    } else {
      // 窗外踩踏
      setExtraContactsCount(c => c + 1);
      const isNeutralMode = (sessionMode === 'practice' || sessionMode === 'calibration_r1' || sessionMode === 'calibration_r2');
      stepAudio.playHitSound(false, activeScheme, isNeutralMode);
      setHitFeedback(prev => ({ ...prev, [foot]: { isSuccess: false, key: validatedStepTime } }));
    }

    setCurrentStepTargets([...targets]);
  };

  // 偏差狀態機判定（單一目標時間窗關閉時觸發結算，同步即時評估狀態機）
  const evaluateTargetClosed = (target: StepTarget) => {
    let isSuccess = false;

    if (target.firstContactTimeMs && target.status === 'success') {
      isSuccess = true;
      setSuccessfulTargetsCount(c => c + 1);
    } else {
      if (target.status === 'wrong_zone') {
        setWrongZoneTargetsCount(c => c + 1);
      } else {
        target.status = 'miss';
        setMissedTargetsCount(c => c + 1);
      }
    }

    target.evaluated = true;

    // 狀態機評估：連續 2 個目標不合格成立偏差
    if (!isSuccess) {
      consecutiveFailsRef.current += 1;
      consecutiveSuccessesRef.current = 0;
      setRecoveryProgressCount(0);

      if (consecutiveFailsRef.current >= pilotSettings.deviationErrorThreshold) {
        if (deviationStateRef.current === 'normal') {
          triggerDeviationEvent();
        }
      }
    } else {
      consecutiveFailsRef.current = 0;

      if (deviationStateRef.current === 'deviated') {
        consecutiveSuccessesRef.current += 1;
        setRecoveryProgressCount(consecutiveSuccessesRef.current);
        if (consecutiveSuccessesRef.current >= pilotSettings.recoverySuccessThreshold) {
          triggerRecoverySuccess();
          consecutiveSuccessesRef.current = 0;
          setRecoveryProgressCount(0);
        }
      }
    }
  };

  // 觸發偏差事件 (同步獲取最新 performance.now()，杜絕閉包延遲與微秒重複)
  const triggerDeviationEvent = () => {
    setDeviationState('deviated');
    deviationStateRef.current = 'deviated';
    setRecoveryProgressCount(0);

    const eventId = nextEventIdRef.current++;
    // 同步強制執行 performance.now()
    const deviationStartTimeMs = getSynchronousMonotonicNow();
    const startTime = activityStartTimeMsRef.current;
    const relDiffSecStr = ((deviationStartTimeMs - startTime) / 1000).toFixed(6);

    const newEvent: DeviationRecoveryEvent = {
      eventId,
      scheme: activeScheme,
      deviationStartTimeMs,
      relativeStartMs: +(deviationStartTimeMs - startTime).toFixed(3),
      isRecovered: false,
      isRightCensored: false,
      interruptionReason: 'none'
    };
    currentDeviationEventRef.current = newEvent;
    deviationEventsRef.current = [...deviationEventsRef.current, newEvent];
    setDeviationEvents([...deviationEventsRef.current]);

    // 依據研究規範輸出 (value - startTime).toFixed(6)
    console.log(
      `[PERL StateMachine] 事件 #${eventId} 偏差開始: ` +
      `deviationStartTimeMs=${deviationStartTimeMs.toFixed(6)} ms, ` +
      `(value - startTime).toFixed(6)=${(deviationStartTimeMs - startTime).toFixed(6)} ms (${relDiffSecStr} s)`
    );

    // 聲音回饋：前導校準/練習模式下採中性回饋，不觸發緊張的低通降級；正式實驗中A方案平滑低通降級，B方案播放中性提示音
    const isNeutralMode = (sessionMode === 'practice' || sessionMode === 'calibration_r1' || sessionMode === 'calibration_r2');
    if (!isNeutralMode) {
      if (activeScheme === 'A') {
        stepAudio.degradeTimbre(pilotSettings.aSchemeFilterCutoffDegraded, pilotSettings.aSchemeFilterTransitionMs);
      } else {
        stepAudio.playNeutralCueTone();
      }
    }
  };

  // 觸發恢復完成 (同步獲取最新 performance.now()，精準計算 PERL 並輸出 (value - startTime).toFixed(6))
  const triggerRecoverySuccess = () => {
    setDeviationState('normal');
    deviationStateRef.current = 'normal';
    setRecoveryProgressCount(0);

    if (currentDeviationEventRef.current) {
      const targetId = currentDeviationEventRef.current.eventId;
      const startTime = currentDeviationEventRef.current.deviationStartTimeMs;

      // 同步強制執行 performance.now()
      let recoveryEndTimeMs = getSynchronousMonotonicNow();
      if (recoveryEndTimeMs <= startTime) {
        recoveryEndTimeMs = startTime + 0.000001;
        lastHighResTimestampRef.current = recoveryEndTimeMs;
      }

      const perl = +(recoveryEndTimeMs - startTime).toFixed(3);
      const activityStart = activityStartTimeMsRef.current;

      const completedEvent: DeviationRecoveryEvent = {
        ...currentDeviationEventRef.current,
        recoveryEndTimeMs,
        relativeEndMs: +(recoveryEndTimeMs - activityStart).toFixed(3),
        perlMs: perl,
        isRecovered: true,
        isRightCensored: false,
      };
      currentDeviationEventRef.current = null;
      deviationEventsRef.current = deviationEventsRef.current.map(ev => ev.eventId === targetId ? completedEvent : ev);
      setDeviationEvents([...deviationEventsRef.current]);

      // 依據研究規範輸出具體偏差值與 PERL (value - startTime).toFixed(6)
      const perlExactStr = (recoveryEndTimeMs - startTime).toFixed(6);
      const relEndExactStr = (recoveryEndTimeMs - activityStart).toFixed(6);
      console.log(
        `[PERL StateMachine] 事件 #${targetId} 恢復達成: ` +
        `recoveryEndTimeMs=${recoveryEndTimeMs.toFixed(6)} ms, ` +
        `PERL具體偏差值 (value - startTime).toFixed(6)=${perlExactStr} ms, ` +
        `活動總耗時 (recoveryEndTimeMs - activityStartTime).toFixed(6)=${relEndExactStr} ms`
      );
    }

    // A方案：平滑還原伴奏音色 (若非中性練習/校準模式)
    const isNeutralMode = (sessionMode === 'practice' || sessionMode === 'calibration_r1' || sessionMode === 'calibration_r2');
    if (!isNeutralMode && activeScheme === 'A') {
      stepAudio.restoreTimbre(pilotSettings.aSchemeFilterTransitionMs);
    }
  };

  // 處理意外中斷（安全停止、訊號中斷）
  const handleInterruption = (reason: 'rest' | 'signal_loss' | 'manual_assist' | 'safety_stop') => {
    if (currentDeviationEventRef.current) {
      const targetId = currentDeviationEventRef.current.eventId;
      const startTime = currentDeviationEventRef.current.deviationStartTimeMs;
      let now = getSynchronousMonotonicNow();
      if (now <= startTime) {
        now = startTime + 0.000001;
        lastHighResTimestampRef.current = now;
      }
      const relEnd = +Math.max(0, now - activityStartTimeMsRef.current).toFixed(3);
      const perl = +(now - startTime).toFixed(3);

      const interruptedEvent: DeviationRecoveryEvent = {
        ...currentDeviationEventRef.current,
        interruptionReason: reason,
        isRightCensored: true,
        recoveryEndTimeMs: now,
        relativeEndMs: relEnd,
        perlMs: perl,
      };
      currentDeviationEventRef.current = null;
      deviationEventsRef.current = deviationEventsRef.current.map(ev => ev.eventId === targetId ? interruptedEvent : ev);
      setDeviationEvents([...deviationEventsRef.current]);

      console.log(
        `[PERL StateMachine] 中斷事件 #${targetId} (${reason}): ` +
        `now=${now.toFixed(6)} ms, ` +
        `(value - startTime).toFixed(6)=${(now - startTime).toFixed(6)} ms`
      );
    }
    setDeviationState('normal');
    deviationStateRef.current = 'normal';
    consecutiveFailsRef.current = 0;
    consecutiveSuccessesRef.current = 0;
    setRecoveryProgressCount(0);
    stepAudio.restoreTimbre(100);
  };

  // 開始活動主程序
  const startSession = (mode: SessionMode, scheme: SchemeType) => {
    stepAudio.init();
    setActiveScheme(scheme);
    setSessionMode(mode);

    // 依模式指定秒數：demo(60s), practice(60s), formal(60s~120s)
    let durationSec = pilotSettings.demoDurationSec;
    if (mode === 'practice') durationSec = pilotSettings.practiceDurationSec;
    if (mode === 'formal') durationSec = pilotSettings.formalDurationSec;

    setTotalTargetSec(durationSec);
    activityDurationMsRef.current = durationSec * 1000;

    // 清空歷史步數與指標
    setSuccessfulTargetsCount(0);
    setMissedTargetsCount(0);
    setWrongZoneTargetsCount(0);
    setExtraContactsCount(0);
    nextEventIdRef.current = 1;
    lastHighResTimestampRef.current = 0;
    deviationEventsRef.current = [];
    setDeviationEvents([]);
    currentDeviationEventRef.current = null;
    setDeviationState('normal');
    deviationStateRef.current = 'normal';
    consecutiveFailsRef.current = 0;
    consecutiveSuccessesRef.current = 0;
    setRecoveryProgressCount(0);
    setElapsedSec(0);

    // 停止任何正在播放的試聽
    stepAudio.stopPreview();
    setIsPreviewPlaying(false);

    // 設定分齡懷舊曲目與載入音源 (84 BPM)
    if (scheme === 'A') {
      stepAudio.setRetroTrack(selectedRetroTrack);
      stepAudio.stopBgm(); // 停止通用背景音樂
    } else {
      stepAudio.setupBgm(DEMO_TRACKS[scheme].url, 0.25);
    }

    // 開始 4 拍準備
    setActivityState('prep');
    setPrepBeatRemaining(pilotSettings.prepBeats);

    let prepCount = pilotSettings.prepBeats;
    const prepInterval = setInterval(() => {
      prepCount -= 1;
      stepAudio.playPrepBeep(prepCount === 0);
      setPrepBeatRemaining(prepCount);

      if (prepCount <= 0) {
        clearInterval(prepInterval);
        launchActiveStepping(scheme, durationSec);
      }
    }, beatIntervalMsRef.current);
  };

  // 正式進入踩踏時序
  const launchActiveStepping = (scheme: SchemeType, durationSec: number) => {
    setActivityState('active');
    stepAudio.playCurrentTrack(scheme);

    const startTimestamp = performance.now();
    activityStartTimeMsRef.current = startTimestamp;

    // 建立 4 格橫向目標序列 (L2, L1, R1, R2 交替循環，一拍一次接觸)
    const beatInterval = beatIntervalMsRef.current;
    const tolerance = toleranceMsRef.current;
    const totalBeats = Math.floor((durationSec * 1000) / beatInterval);
    setTotalScheduledTargets(totalBeats);

    const laneSequence: FootTarget[] = ['L2', 'R1', 'L1', 'R2'];
    const generatedTargets: StepTarget[] = [];
    for (let i = 0; i < totalBeats; i++) {
      const scheduledTime = startTimestamp + (i + 1) * beatInterval;
      generatedTargets.push({
        id: i + 1,
        beatIndex: i,
        foot: laneSequence[i % 4],
        scheduledTimeMs: scheduledTime,
        windowStartMs: scheduledTime - tolerance,
        windowEndMs: scheduledTime + tolerance,
        evaluated: false,
        status: 'pending',
        extraContactsCount: 0
      });
    }

    stepTargetsRef.current = generatedTargets;
    setCurrentStepTargets(generatedTargets);
  };

  // 60FPS 垂直下降節奏遊戲循環
  useEffect(() => {
    if (activityState !== 'active') return;

    let lastBeatTickedIndex = -1;
    let animationFrameId: number;

    const gameLoop = () => {
      const now = performance.now();
      setAnimNowTimeMs(now);

      const elapsedTotalMs = now - activityStartTimeMsRef.current;
      const currentElapsedSec = Math.floor(elapsedTotalMs / 1000);
      setElapsedSec(currentElapsedSec);

      // 檢查是否已達預定活動時間
      if (elapsedTotalMs >= activityDurationMsRef.current) {
        finishSession(now);
        return;
      }

      const beatInterval = beatIntervalMsRef.current;
      const currentBeat = Math.floor(elapsedTotalMs / beatInterval);

      // 節奏脈動、伴奏和弦拍與獨立節拍音層
      if (currentBeat > lastBeatTickedIndex) {
        lastBeatTickedIndex = currentBeat;
        setBeatPulse(true);
        setTimeout(() => setBeatPulse(false), 120);

        // 背景音樂伴奏和弦（經低通濾波器）
        stepAudio.playAccompanimentBeat(currentBeat, activeScheme);

        // 獨立節拍音（不受伴奏降級影響）
        if (isMetronomeActive) {
          stepAudio.playIndependentMetronomeBeat(currentBeat % 2 === 0);
        }
      }

      // 檢查到期的目標時間窗
      const targets = stepTargetsRef.current;
      let hasUpdate = false;

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.evaluated && now > t.windowEndMs) {
          hasUpdate = true;
          // 即刻評估過期目標，同步驅動狀態機採集即時 performance.now()
          evaluateTargetClosed(t);
        }
      }

      if (hasUpdate) {
        setCurrentStepTargets([...targets]);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [activityState, isMetronomeActive, activeScheme]);

  // 活動正常完成（杜絕白畫面：安全拷貝事件資料）
  const finishSession = (finalTimestampMs: number) => {
    setActivityState('completed');
    stepAudio.stopAllMusic();

    if (currentDeviationEventRef.current) {
      const targetId = currentDeviationEventRef.current.eventId;
      const startTime = currentDeviationEventRef.current.deviationStartTimeMs;
      let finalTs = getSynchronousMonotonicNow();
      if (finalTs <= startTime) {
        finalTs = startTime + 0.000001;
        lastHighResTimestampRef.current = finalTs;
      }
      const relEnd = +Math.max(0, finalTs - activityStartTimeMsRef.current).toFixed(3);
      const perl = +(finalTs - startTime).toFixed(3);

      const completedEvent: DeviationRecoveryEvent = {
        ...currentDeviationEventRef.current,
        isRightCensored: true,
        recoveryEndTimeMs: finalTs,
        relativeEndMs: relEnd,
        perlMs: perl,
      };
      currentDeviationEventRef.current = null;
      deviationEventsRef.current = deviationEventsRef.current.map(ev => ev.eventId === targetId ? completedEvent : ev);
      setDeviationEvents([...deviationEventsRef.current]);

      console.log(
        `[PERL StateMachine] 活動結束右設限 事件 #${targetId}: ` +
        `finalTs=${finalTs.toFixed(6)} ms, ` +
        `(value - startTime).toFixed(6)=${(finalTs - startTime).toFixed(6)} ms`
      );
    }
  };

  // 提早中止活動
  const stopSessionEarly = () => {
    handleInterruption('safety_stop');
    setActivityState('idle');
    stepAudio.stopAllMusic();
  };

  // 匯出論文標準格式之逐事件日誌與 PERL 紀錄 (微秒級高精度小數點後三位)
  const exportExperimentEventLog = () => {
    const accuracy = totalScheduledTargets > 0 ? Math.round((successfulTargetsCount / totalScheduledTargets) * 100) : 0;
    let csv = "data:text/csv;charset=utf-8,\uFEFF";

    const currentTrackInfo = RETRO_AGE_TRACKS[selectedRetroTrack];
    const trackName = activeScheme === 'A' 
      ? `${currentTrackInfo.title} (${currentTrackInfo.ageRangeLabel})`
      : '現代節奏雙軌配樂';

    csv += `[實驗基本紀錄]\n方案,模式,曲目,設定版本,目標BPM,預告拍數,時間容許值(%),正式時長(s),實際時長(s)\n`;
    csv += `${activeScheme},${sessionMode},${trackName},${pilotSettings.version},${pilotSettings.bpm},${pilotSettings.previewBeats},${pilotSettings.toleranceRatio * 100}%,${totalTargetSec},${elapsedSec}\n\n`;

    csv += `[表現統計摘要]\n總排程目標,合格目標,錯區目標,漏踩目標,額外接觸,踩踏同步率(%)\n`;
    csv += `${totalScheduledTargets},${successfulTargetsCount},${wrongZoneTargetsCount},${missedTargetsCount},${extraContactsCount},${accuracy}%\n\n`;

    csv += `# 研究設計架構: [何時踩]=84BPM獨立節拍軌(時間參照) | [踩哪裡]=畫面4格目標與修正文字 | [目前狀態]=音訊優雅降級(任務狀態回饋)\n`;
    csv += `[錯誤後恢復時間 (PERL) 事件紀錄 - 微秒級高精度驗證]\n事件編號,方案,活動相對起點(秒),偏差起點(ms),恢復終點(ms),PERL(ms),是否恢復,是否右設限,中斷備註\n`;
    if (deviationEvents.length === 0) {
      csv += `無事件,${activeScheme},0.000,無偏差,無,無,完全平穩,否,正常完成\n`;
    } else {
      deviationEvents.forEach(ev => {
        const relSec = ev.relativeStartMs !== undefined 
          ? (ev.relativeStartMs / 1000).toFixed(3)
          : (Math.max(0, ev.deviationStartTimeMs - activityStartTimeMsRef.current) / 1000).toFixed(3);
        const startMsStr = ev.deviationStartTimeMs.toFixed(3);
        const endMsStr = ev.recoveryEndTimeMs !== undefined ? ev.recoveryEndTimeMs.toFixed(3) : '無';
        const perlMsStr = ev.perlMs !== undefined ? ev.perlMs.toFixed(3) : '未恢復';
        csv += `${ev.eventId},${ev.scheme},${relSec},${startMsStr},${endMsStr},${perlMsStr},${ev.isRecovered ? '是' : '否'},${ev.isRightCensored ? '是(右設限)' : '否'},${ev.interruptionReason}\n`;
      });
    }

    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `智慧地墊_${activeScheme}方案_${sessionMode}_PERL事件紀錄.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 計算預告時間窗
  const previewLeadTimeMs = pilotSettings.previewBeats * beatIntervalMsRef.current;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between overflow-hidden font-sans select-none relative transition-colors duration-700 ${
      activeScheme === 'A' 
        ? 'bg-[#fcf8f2] text-[#3e2723]' 
        : 'bg-[#f4f7fb] text-[#1a237e]'
    }`}>

      {/* 頂部通用控制與診斷列 */}
      <header className="w-full flex justify-between items-center px-4 py-3 border-b z-30 backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-black tracking-wider border shadow-sm ${
            activeScheme === 'A'
              ? 'bg-amber-100 text-amber-950 border-amber-300'
              : 'bg-blue-100 text-blue-950 border-blue-300'
          }`}>
            {activeScheme === 'A' ? 'A方案：懷舊容錯留聲機' : 'B方案：一般移動方塊'}
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-200/80 text-gray-700">
            {sessionMode === 'demo' ? '體驗示範' : sessionMode === 'practice' ? '60秒練習' : '正式活動'}
          </span>
          <span className="text-[11px] text-gray-500 hidden sm:inline">
            [{pilotSettings.statusLabel} v{pilotSettings.version}]
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 藍牙連線 */}
          <button 
            onClick={connectBluetooth}
            className={`p-2 rounded-full border shadow-sm transition-all flex items-center gap-1.5 text-xs font-bold ${
              btStatus === 'connected' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-300' 
                : btStatus === 'connecting'
                ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            title="連接智慧地墊"
          >
            <Bluetooth className="w-4 h-4" />
            <span className="hidden md:inline">{btStatus === 'connected' ? '地墊已連線' : btStatus === 'connecting' ? '連線中...' : '連接地墊'}</span>
          </button>

          {/* 獨立節拍音層切換 */}
          <button 
            onClick={() => setIsMetronomeActive(!isMetronomeActive)}
            className={`p-2 rounded-full border shadow-sm text-xs font-bold flex items-center gap-1 ${
              isMetronomeActive ? 'bg-amber-100 text-amber-900 border-amber-400' : 'bg-white text-gray-400 border-gray-200'
            }`}
            title="獨立節拍音層（不受伴奏降級影響）"
          >
            <Bell className="w-4 h-4" />
            <span className="hidden md:inline">節拍層</span>
          </button>

          {/* 靜音切換 */}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white border border-gray-300 text-gray-700 shadow-sm"
            title={isMuted ? '解除靜音' : '靜音'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-gray-700" />}
          </button>

          {/* 前導研究者參數面板 */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full bg-white border border-gray-300 text-gray-700 shadow-sm"
            title="前導起始設定與快照"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 藍牙感測診斷列 */}
      {debugMat && (
        <div className="absolute top-14 left-4 z-40 bg-black/75 text-white text-[11px] px-3 py-1 rounded-md shadow">
          {debugMat}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 畫面 1: 首頁/體驗模式入口 */}
      {/* ========================================================================= */}
      {activityState === 'idle' && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-4xl z-10">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-8 md:p-10 rounded-[2.5rem] shadow-xl w-full border backdrop-blur-md text-center ${
              activeScheme === 'A'
                ? 'bg-white/95 border-amber-200 shadow-amber-900/5'
                : 'bg-white/95 border-blue-200 shadow-blue-900/5'
            }`}
          >
            {/* 方案切換標籤 */}
            <div className="inline-flex p-1.5 rounded-2xl bg-gray-100 border border-gray-200 mb-6">
              <button 
                onClick={() => setActiveScheme('A')}
                className={`py-2 px-5 rounded-xl text-sm font-black transition-all ${
                  activeScheme === 'A' 
                    ? 'bg-amber-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                A方案：懷舊容錯留聲機
              </button>
              <button 
                onClick={() => setActiveScheme('B')}
                className={`py-2 px-5 rounded-xl text-sm font-black transition-all ${
                  activeScheme === 'B' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                B方案：一般移動方塊
              </button>
            </div>

            {/* 方案視覺主圖 */}
            {activeScheme === 'A' ? (
              <div className="flex flex-col items-center mb-4">
                <div className="w-24 h-24 rounded-full bg-neutral-900 border-4 border-amber-600/40 flex items-center justify-center shadow-lg animate-spin-slow mb-3">
                  <div className="w-18 h-18 rounded-full border border-neutral-700 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-neutral-900"></div>
                    </div>
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-1">時光留聲機 Retro Jukebox</h1>
                <p className="text-amber-900 text-sm font-bold bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  懷舊容錯方案：旋律陪伴、平滑音色過渡與連續動作支持
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center mb-4">
                <div className="w-24 h-24 rounded-2xl bg-blue-900 border-4 border-blue-400 flex items-center justify-center shadow-lg mb-3">
                  <div className="flex gap-2">
                    <div className="w-6 h-12 bg-blue-300 rounded"></div>
                    <div className="w-6 h-12 bg-indigo-400 rounded"></div>
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-gray-900 mb-1">節奏方塊 Rhythm Blocks</h1>
                <p className="text-blue-900 text-sm font-bold bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  一般移動方塊方案：標準節奏判定與中性回饋
                </p>
              </div>
            )}

            {/* 音樂來源清楚標示與分齡曲目選擇 */}
            {activeScheme === 'A' ? (
              <div className="max-w-2xl mx-auto mb-6 p-4 md:p-5 rounded-2xl border bg-amber-50/90 border-amber-300 text-left text-xs text-amber-950 shadow-sm space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-amber-800" />
                    <span className="font-black text-sm text-amber-900">
                      三階段分齡純器樂無人聲曲目庫 (恆定 84 BPM)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-extrabold text-[11px] border border-amber-300">
                      嚴格恆定 84 BPM
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px] border border-emerald-300">
                      伴奏與節拍獨立雙層
                    </span>
                  </div>
                </div>

                {/* 3 首分齡曲目卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(Object.keys(RETRO_AGE_TRACKS) as RetroTrackKey[]).map((trackKey) => {
                    const track = RETRO_AGE_TRACKS[trackKey];
                    const isSelected = selectedRetroTrack === trackKey;
                    const isAuditioning = isPreviewPlaying && previewTrack === trackKey;
                    const customFileName = customFileNames[trackKey];

                    return (
                      <div
                        key={trackKey}
                        onClick={() => {
                          setSelectedRetroTrack(trackKey);
                          stepAudio.setRetroTrack(trackKey);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative ${
                          isSelected
                            ? 'bg-amber-700 text-white border-amber-800 shadow-md ring-2 ring-amber-400'
                            : 'bg-white hover:bg-amber-100/60 border-amber-200 text-gray-800 shadow-xs'
                        }`}
                      >
                        <div>
                          {/* 年齡標籤與選用狀態 */}
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                              isSelected
                                ? 'bg-amber-800/80 text-amber-100 border-amber-500'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}>
                              {track.targetAge}
                            </span>
                            {isSelected && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" /> 選用中
                              </span>
                            )}
                          </div>

                          <h3 className="font-black text-sm block leading-snug">{track.title}</h3>
                          <span className={`text-[10px] block opacity-90 mt-0.5 italic ${isSelected ? 'text-amber-100' : 'text-gray-500'}`}>
                            {track.englishTitle}
                          </span>

                          <span className={`text-[11px] font-bold block mt-1.5 ${isSelected ? 'text-amber-200' : 'text-amber-800'}`}>
                            {track.era}
                          </span>

                          <p className={`text-[10px] leading-relaxed mt-1.5 line-clamp-3 ${isSelected ? 'text-amber-50/90' : 'text-gray-600'}`}>
                            {track.description}
                          </p>

                          {/* 樂器標籤摘要 */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {track.instruments.slice(0, 2).map((inst, i) => (
                              <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-amber-800/60 text-amber-200' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {inst}
                              </span>
                            ))}
                          </div>

                          {/* 已載入自訂 MP3 提示 */}
                          {customFileName && (
                            <div className={`mt-2 p-1.5 rounded-lg text-[10px] flex items-center justify-between font-mono ${
                              isSelected ? 'bg-amber-900/60 text-amber-200' : 'bg-amber-100/80 text-amber-900'
                            }`}>
                              <span className="truncate max-w-[120px] font-bold">🎵 {customFileName}</span>
                              <button
                                type="button"
                                title="清除自訂音檔"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClearCustomMp3(trackKey);
                                }}
                                className="text-red-500 hover:text-red-700 ml-1 p-0.5"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 控制按鈕組：試聽 + 載入MP3 */}
                        <div className="mt-3 pt-2 border-t border-amber-200/40 flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTrackPreview(trackKey);
                            }}
                            className={`w-full py-1.5 px-2 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-colors ${
                              isAuditioning
                                ? 'bg-amber-400 text-amber-950 animate-pulse shadow-xs'
                                : isSelected
                                  ? 'bg-white/20 hover:bg-white/30 text-white border border-white/30'
                                  : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            }`}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            {isAuditioning ? '停止試聽' : `試聽播放 (84 BPM)`}
                          </button>

                          <label
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full py-1 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-white/10 hover:bg-white/20 text-amber-100 border border-white/20'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                            }`}
                          >
                            <Upload className="w-3 h-3" />
                            <span>{customFileName ? '重新抽換 MP3' : '載入本機 MP3'}</span>
                            <input
                              type="file"
                              accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadCustomMp3(trackKey, file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1.5 text-[11px] text-amber-900/90 leading-relaxed bg-white/70 p-3 rounded-xl border border-amber-200/60 flex items-start gap-2">
                  <span className="font-bold text-amber-800">💡 聲音工程說明：</span>
                  <div>
                    <p>• <strong>嚴格 84 BPM 脈動</strong>：低音大鼓與貝斯每拍同步，步態節拍易於辨識，步態訓練穩定不急促。</p>
                    <p>• <strong>無縫循環與優雅降級</strong>：對稱規律小節，偏差成立時低通濾波平滑變悶，基底 4 拍與獨立節拍層始終清晰。</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto mb-6 p-3 rounded-xl border bg-gray-50 flex items-center justify-between text-xs text-gray-700">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-gray-600" />
                  <span className="font-bold">{DEMO_TRACKS[activeScheme].title}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-medium">現代無歌詞配樂</span>
              </div>
            )}

            {/* 任務操作指引說明 */}
            <div className="text-left bg-white/70 p-5 rounded-2xl border border-gray-200 max-w-xl mx-auto mb-6 space-y-2 text-sm md:text-base text-gray-700">
              <p className="font-extrabold text-gray-900 flex items-center gap-2">
                <Footprints className="w-5 h-5 text-amber-700" />
                橫向 4 格踩踏任務說明：
              </p>
              <p>• 遊戲設有橫向 4 個踩踏區域（左外、左內、右內、右外）。</p>
              <p>• 方塊／唱片標記隨音樂節奏由上方下降至底部判定線。</p>
              <p>• 當標記接近底線時，請<strong className="text-amber-800">踏下該直行對應的區域</strong>，跟隨音樂踩踏。</p>
              <p>• 鍵盤支援 A/S/K/L 或 1/2/3/4 或 ←/↓/↑/→ 鍵；地墊支援橫向 4 點感測。</p>
              <p>• 若未踏準請勿慌張，<strong className="text-blue-700">跟著下一個標記繼續踩踏</strong>即可平穩繼續。</p>

              {/* 活動時長快捷選取 (60s ~ 120s，已移除480S) */}
              <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-600">正式活動單回時長：</span>
                <div className="flex gap-1.5">
                  {[60, 90, 120].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setPilotSettings({ ...pilotSettings, formalDurationSec: sec })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        pilotSettings.formalDurationSec === sec
                          ? 'bg-amber-700 text-white shadow-sm'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {sec}秒
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 操作按鈕組 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
              <button 
                onClick={() => startSession('demo', activeScheme)}
                className="py-3.5 px-4 rounded-xl font-bold text-base bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Play className="w-5 h-5 fill-current" />
                體驗示範 (60秒)
              </button>
              <button 
                onClick={() => startSession('practice', activeScheme)}
                className="py-3.5 px-4 rounded-xl font-bold text-base bg-amber-700 hover:bg-amber-800 text-white shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-5 h-5" />
                練習模式 (60秒)
              </button>
              <button 
                onClick={() => startSession('formal', activeScheme)}
                className="py-3.5 px-4 rounded-xl font-bold text-base bg-blue-700 hover:bg-blue-800 text-white shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Footprints className="w-5 h-5" />
                正式活動 ({pilotSettings.formalDurationSec}秒)
              </button>
            </div>
          </motion.div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* 畫面 2: 4 拍準備提示 */}
      {/* ========================================================================= */}
      {activityState === 'prep' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
          <motion.div 
            key={prepBeatRemaining}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            className="text-center"
          >
            <p className="text-white/80 font-bold text-2xl mb-4">準備踏步</p>
            <div className="text-9xl font-black text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.6)]">
              {prepBeatRemaining > 0 ? prepBeatRemaining : 'GO!'}
            </div>
            <p className="text-white/70 text-lg mt-6">放鬆雙肩，雙腳置於地墊左右兩側</p>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 畫面 3: 正式踏步互動主畫面 (4 格橫向直立下降軌道 + 音樂節奏) */}
      {/* ========================================================================= */}
      {activityState === 'active' && (
        <main className="w-full flex-1 flex flex-col justify-between max-w-4xl mx-auto px-4 py-2 z-10 relative">
          
          {/* 上方活動進度列 */}
          <div className="w-full flex justify-between items-center py-2 px-4 rounded-2xl bg-white/80 border shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500">活動進度:</span>
              <div className="w-36 md:w-56 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    activeScheme === 'A' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, (elapsedSec / totalTargetSec) * 100)}%` }}
                ></div>
              </div>
              <span className="text-xs font-mono font-bold text-gray-700">{elapsedSec}s / {totalTargetSec}s</span>
            </div>

            {/* 節拍脈動視覺指示器 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">拍點參照:</span>
              <div className={`w-3.5 h-3.5 rounded-full transition-transform ${
                beatPulse ? 'scale-150 bg-amber-500 shadow-md' : 'scale-100 bg-gray-300'
              }`}></div>
            </div>

            <button 
              onClick={stopSessionEarly}
              className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
            >
              中途休息
            </button>
          </div>

          {/* 三類資訊整合任務狀態回饋：何時踩 (時間參照) | 踩哪裡 (目標與修正) | 目前狀態 (音訊優雅降級任務狀態回饋) */}
          <div className="w-full min-h-[3.25rem] flex items-center justify-center my-1.5">
            <AnimatePresence mode="wait">
              {deviationState === 'deviated' ? (
                <motion.div
                  key="deviated"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  className={`w-full max-w-xl px-4 py-2 rounded-2xl border-2 shadow-md flex items-center justify-between gap-3 text-xs md:text-sm ${
                    activeScheme === 'A'
                      ? 'bg-amber-50/95 border-amber-500 text-amber-950'
                      : 'bg-blue-50/95 border-blue-500 text-blue-950'
                  }`}
                >
                  {/* 踩哪裡：修正文字導引 */}
                  <div className="flex items-center gap-2">
                    <Footprints className="w-5 h-5 text-amber-600 animate-bounce shrink-0" />
                    <div>
                      <span className="font-black text-sm md:text-base block">跟著下一個標記，左右交替踩踏</span>
                      <span className="text-[10px] text-gray-500 font-semibold">【踩哪裡】空間落點導引</span>
                    </div>
                  </div>

                  {/* 目前狀態：音訊優雅降級任務狀態回饋與恢復進度 */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                      {activeScheme === 'A' ? '伴奏音色優雅降級中 (沉悶提示)' : '偏差提示中'}
                    </span>
                    <span className="text-xs font-black text-amber-900 flex items-center gap-1">
                      <span>恢復進度:</span>
                      <span className="font-mono bg-white/80 px-1.5 py-0.5 rounded border border-amber-300 text-amber-800">
                        {recoveryProgressCount} / {pilotSettings.recoverySuccessThreshold} 拍
                      </span>
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="normal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full max-w-xl px-4 py-1.5 rounded-xl flex items-center justify-between text-xs text-gray-600 bg-white/60 border border-gray-200/80 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-800">
                      【目前狀態】{activeScheme === 'A' ? '伴奏音色正常 (清澈明朗)' : '步態節奏穩定'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 text-[11px]">
                    <span>【何時踩】84 BPM 獨立節拍軌</span>
                    <span className="text-gray-300">|</span>
                    <span>【踩哪裡】橫向4軌目標</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 中央主要互動軌道區域：4格橫向 (L2, L1, R1, R2) */}
          <div className="flex-1 w-full max-w-2xl mx-auto flex flex-col justify-between relative py-2 px-2 md:px-6">
            
            {/* 留聲機背景輪廓裝飾 (A方案專屬) */}
            {activeScheme === 'A' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10">
                <svg viewBox="0 0 400 400" className="w-80 h-80 text-amber-900 fill-current">
                  <path d="M200,80 C270,30 350,60 360,130 C370,200 300,240 230,220 L190,240 L190,280 L160,280 L160,220 C180,200 190,150 200,80 Z" />
                  <rect x="100" y="270" width="200" height="70" rx="15" />
                  <rect x="80" y="330" width="240" height="20" rx="6" />
                </svg>
              </div>
            )}

            {/* 4格橫向直立軌道區 */}
            <div className={`w-full flex-1 rounded-3xl border-2 relative overflow-hidden grid grid-cols-4 p-2 shadow-inner backdrop-blur-sm ${
              activeScheme === 'A' 
                ? 'bg-[#f7efe3]/90 border-amber-300' 
                : 'bg-white/80 border-blue-200'
            }`}>
              
              {/* 橫向4軌道背景分隔線與標籤 */}
              {(['L2', 'L1', 'R1', 'R2'] as FootTarget[]).map((laneKey) => {
                const laneLabels: Record<FootTarget, { name: string, sub: string, color: string }> = {
                  L2: { name: '左外', sub: '第 1 格', color: 'border-blue-400 text-blue-700' },
                  L1: { name: '左內', sub: '第 2 格', color: 'border-cyan-400 text-cyan-700' },
                  R1: { name: '右內', sub: '第 3 格', color: 'border-emerald-400 text-emerald-700' },
                  R2: { name: '右外', sub: '第 4 格', color: 'border-amber-400 text-amber-700' },
                };
                const laneInfo = laneLabels[laneKey];
                const isLaneActive = contactsActive[laneKey];
                const laneFeedback = hitFeedback[laneKey];

                return (
                  <div 
                    key={laneKey} 
                    className={`h-full border-r last:border-r-0 relative flex flex-col justify-between items-center py-2 transition-colors ${
                      isLaneActive 
                        ? activeScheme === 'A' ? 'bg-amber-100/70' : 'bg-blue-100/70' 
                        : 'border-black/5'
                    }`}
                  >
                    {/* 上方軌道名稱 */}
                    <div className="z-10 text-center">
                      <span className="text-xs md:text-sm font-black block text-gray-700">{laneInfo.name}</span>
                      <span className="text-[10px] text-gray-400 block">{laneInfo.sub}</span>
                    </div>

                    {/* 下降中的方塊／唱片標記 (以 60FPS animNowTimeMs 計算平滑位移) */}
                    <div className="w-full flex-1 relative overflow-hidden pointer-events-none">
                      {currentStepTargets
                        .filter(t => !t.evaluated && t.foot === laneKey && Math.abs(t.scheduledTimeMs - animNowTimeMs) <= previewLeadTimeMs + toleranceMsRef.current)
                        .map(target => {
                          const timeDiffMs = target.scheduledTimeMs - animNowTimeMs;
                          const progress = 1 - (timeDiffMs / previewLeadTimeMs);
                          // 判定線位於 86% 處
                          const topPercent = Math.max(0, Math.min(100, progress * 86));

                          const isHit = target.firstContactTimeMs !== undefined;
                          const isCorrect = target.status === 'success';

                          return (
                            <div
                              key={target.id}
                              className={`absolute left-1/2 -translate-x-1/2 flex flex-col items-center transition-opacity duration-150 ${
                                isHit ? 'opacity-80 scale-110' : 'opacity-100'
                              }`}
                              style={{ top: `${topPercent}%` }}
                            >
                              {activeScheme === 'A' ? (
                                /* A方案：旋轉黑膠唱片圓形標記 */
                                <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full bg-neutral-900 border-2 flex items-center justify-center shadow-lg animate-spin-slow transition-all ${
                                  isHit 
                                    ? isCorrect 
                                      ? 'border-emerald-400 ring-4 ring-emerald-300' 
                                      : 'border-rose-400' 
                                    : 'border-amber-400'
                                }`}>
                                  <div className="w-5 h-5 md:w-7 md:h-7 rounded-full bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center">
                                    <Footprints className="w-3 h-3 text-white" />
                                  </div>
                                </div>
                              ) : (
                                /* B方案：立體長方形節奏方塊 */
                                <div className={`w-12 h-8 md:w-16 md:h-10 rounded-xl border-2 shadow-lg flex items-center justify-center text-white font-bold transition-all ${
                                  isHit 
                                    ? isCorrect 
                                      ? 'bg-emerald-600 border-emerald-300 ring-4 ring-emerald-300' 
                                      : 'bg-rose-600 border-rose-300' 
                                    : 'bg-blue-600 border-blue-300'
                                }`}>
                                  <Square className="w-4 h-4 fill-current opacity-80" />
                                </div>
                              )}

                              {/* 踏中標記浮字 */}
                              {isHit && (
                                <span className={`text-[10px] md:text-xs font-black mt-1 px-1.5 py-0.5 rounded shadow ${
                                  isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {isCorrect ? '踏中' : '錯位'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* 底部踏步判定線 (判定目標降落之位置，具踏下反饋光暈) */}
                    <div className={`w-11/12 h-14 md:h-16 rounded-xl border-2 flex flex-col items-center justify-center transition-all relative ${
                      isLaneActive 
                        ? 'bg-amber-500 border-amber-600 text-white scale-95 shadow-lg' 
                        : activeScheme === 'A' 
                        ? 'border-amber-400/80 bg-amber-50/80 text-amber-900' 
                        : 'border-blue-400/80 bg-blue-50/80 text-blue-900'
                    }`}>
                      <Footprints className="w-5 h-5 opacity-80" />
                      <span className="text-[10px] font-bold mt-0.5">判定線</span>

                      {/* 打擊瞬間光圈反饋 */}
                      {laneFeedback && (
                        <span 
                          key={laneFeedback.key}
                          className={`absolute inset-0 rounded-xl animate-ping opacity-60 border-2 pointer-events-none ${
                            laneFeedback.isSuccess ? 'border-emerald-400 bg-emerald-400/30' : 'border-amber-400 bg-amber-400/30'
                          }`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 下方智慧地墊 4 格橫向固定接觸區域與觸控模擬按鈕 */}
          <div className="w-full flex justify-center items-end gap-2 md:gap-4 pt-1 pb-4 z-20">
            {([
              { lane: 'L2', title: '左外 (1)', sub: 'Col 0 / 鍵盤 A/1/←', color: 'border-blue-400' },
              { lane: 'L1', title: '左內 (2)', sub: 'Col 1 / 鍵盤 S/2/↓', color: 'border-cyan-400' },
              { lane: 'R1', title: '右內 (3)', sub: 'Col 2 / 鍵盤 K/3/↑', color: 'border-emerald-400' },
              { lane: 'R2', title: '右外 (4)', sub: 'Col 3 / 鍵盤 L/4/→', color: 'border-amber-400' },
            ] as const).map(({ lane, title, sub, color }) => {
              const isPressed = contactsActive[lane];

              return (
                <motion.button
                  key={lane}
                  whileTap={{ scale: 0.95 }}
                  onMouseDown={() => {
                    if (!contactsRef.current[lane]) {
                      contactsRef.current[lane] = true;
                      setContactsActive(prev => ({ ...prev, [lane]: true }));
                      handlePhysicalStep(lane, performance.now());
                    }
                  }}
                  onMouseUp={() => {
                    contactsRef.current[lane] = false;
                    setContactsActive(prev => ({ ...prev, [lane]: false }));
                  }}
                  onTouchStart={() => {
                    if (!contactsRef.current[lane]) {
                      contactsRef.current[lane] = true;
                      setContactsActive(prev => ({ ...prev, [lane]: true }));
                      handlePhysicalStep(lane, performance.now());
                    }
                  }}
                  onTouchEnd={() => {
                    contactsRef.current[lane] = false;
                    setContactsActive(prev => ({ ...prev, [lane]: false }));
                  }}
                  className={`flex-1 h-32 md:h-40 rounded-2xl border-4 relative flex flex-col items-center justify-center transition-all shadow-md ${
                    isPressed 
                      ? 'bg-amber-600 border-amber-700 text-white translate-y-1 shadow-inner' 
                      : 'bg-[#2b3036] hover:bg-[#343a42] text-white ' + color
                  }`}
                >
                  <Footprints className="w-7 h-7 md:w-9 md:h-9 mb-1" />
                  <span className="text-xl md:text-2xl font-black tracking-wider">{title}</span>
                  <span className="text-[10px] md:text-xs text-white/70 font-medium mt-0.5">{sub}</span>
                </motion.button>
              );
            })}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* 畫面 4: 本次活動完成結算畫面 (中性客觀呈現，安全防護杜絕白畫面) */}
      {/* ========================================================================= */}
      {activityState === 'completed' && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-3xl z-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/95 p-8 rounded-[2rem] shadow-2xl w-full border border-gray-200 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-3xl font-black text-gray-800 mb-1">本次活動已完成</h2>
            <p className="text-gray-600 text-sm font-medium mb-6">
              感謝您的參與，以下是本次活動的紀錄摘要（{activeScheme === 'A' ? 'A方案：懷舊容錯' : 'B方案：一般移動方塊'}）
            </p>

            {/* 統計摘要數據卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                <span className="text-xs text-gray-500 font-bold block mb-1">總排程目標</span>
                <span className="text-2xl font-black text-gray-800">{totalScheduledTargets}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <span className="text-xs text-blue-700 font-bold block mb-1">踩踏同步率</span>
                <span className="text-2xl font-black text-blue-700">
                  {totalScheduledTargets > 0 ? Math.round((successfulTargetsCount / totalScheduledTargets) * 100) : 0}%
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-center">
                <span className="text-xs text-purple-700 font-bold block mb-1">合格目標數</span>
                <span className="text-2xl font-black text-purple-700">{successfulTargetsCount}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <span className="text-xs text-amber-700 font-bold block mb-1">偏差事件數</span>
                <span className="text-2xl font-black text-amber-700">{deviationEvents.length}</span>
              </div>
            </div>

            {/* 錯誤後恢復時間 (PERL) 紀錄清單 */}
            <div className="text-left bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 max-h-48 overflow-y-auto">
              <h4 className="text-xs font-bold text-gray-700 uppercase mb-2 flex items-center justify-between">
                <span>偏差與恢復 (PERL) 事件歷程</span>
                <span className="text-[11px] text-gray-500 font-normal">連續4拍踏準達成恢復</span>
              </h4>
              {deviationEvents.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">無偏差事件（活動全程維持平穩踩踏）</p>
              ) : (
                <div className="space-y-1.5 text-xs text-gray-700">
                  {deviationEvents.map((ev) => {
                    const startSec = ev.relativeStartMs !== undefined
                      ? (ev.relativeStartMs / 1000).toFixed(3)
                      : (Math.max(0, ev.deviationStartTimeMs - activityStartTimeMsRef.current) / 1000).toFixed(3);
                    return (
                      <div key={ev.eventId} className="flex justify-between items-center py-2 px-2.5 rounded bg-white border border-gray-100 shadow-xs">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">事件 #{ev.eventId}</span>
                            <span className="text-[11px] font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                              第 {startSec} 秒
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            起點: {ev.deviationStartTimeMs.toFixed(3)} ms | 終點: {ev.recoveryEndTimeMs !== undefined ? `${ev.recoveryEndTimeMs.toFixed(3)} ms` : '未終止'}
                          </div>
                        </div>
                        <div className="text-right">
                          {ev.isRecovered ? (
                            <span className="text-emerald-700 font-bold font-mono text-xs">PERL: {ev.perlMs !== undefined ? ev.perlMs.toFixed(3) : '0.000'} ms (已恢復)</span>
                          ) : ev.isRightCensored ? (
                            <span className="text-amber-700 font-bold font-mono text-xs">觀察 {ev.perlMs !== undefined ? ev.perlMs.toFixed(3) : '0.000'} ms (右設限)</span>
                          ) : (
                            <span className="text-gray-500 font-mono text-xs">未恢復</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 操作按鈕 */}
            <div className="flex flex-wrap gap-3 justify-center">
              <button 
                onClick={exportExperimentEventLog}
                className="py-3 px-5 rounded-xl text-sm font-bold bg-gray-800 hover:bg-gray-900 text-white flex items-center gap-1.5 shadow"
              >
                <Download className="w-4 h-4" />
                匯出 PERL 事件紀錄 CSV
              </button>
              <button 
                onClick={() => setActivityState('idle')}
                className="py-3 px-5 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow"
              >
                <ArrowLeft className="w-4 h-4" />
                回體驗選單
              </button>
            </div>
          </motion.div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* 彈出式研究者設定面板 (已移除 480S，聚焦 60~120 秒) */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-gray-200 text-gray-800 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <div>
                  <h3 className="text-lg font-black text-gray-900">研究者前導參數設定</h3>
                  <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">
                    {pilotSettings.statusLabel}
                  </span>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-gray-700 text-sm font-bold p-1"
                >
                  ✕ 關閉
                </button>
              </div>

              <div className="space-y-4 text-xs md:text-sm">
                {/* 論文核心理論架構說明卡片 */}
                <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 shadow-xs">
                  <div className="font-black text-xs md:text-sm text-amber-900 mb-1.5 flex items-center gap-1.5">
                    <Footprints className="w-4 h-4 text-amber-700" />
                    三類資訊多模態恢復支持理論架構 (Multimodal Recovery Support)
                  </div>
                  <div className="space-y-1.5 text-[11px] md:text-xs text-amber-900/90 leading-relaxed">
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold text-amber-800 shrink-0">①【何時踩 (時間參照)】：</span>
                      <span>獨立節拍軌持續提供恆定 84 BPM 脈動（不受伴奏降級濾波影響，維持穩定聽覺時間錨點）。</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold text-amber-800 shrink-0">②【踩哪裡 (空間目標)】：</span>
                      <span>畫面提供 4 格目標落點、判定線光圈反饋與即時修正導引文字（「跟著下一個標記，左右交替踩踏」）。</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="font-bold text-amber-800 shrink-0">③【目前狀態 (任務狀態回饋)】：</span>
                      <span>音訊優雅降級（Graceful Audio Degradation）——偏差成立時伴奏音色平滑過渡變暗；達成連續 4 拍合格恢復標準後音色平滑還原。</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold block">共用基準 BPM (目前: {pilotSettings.bpm} BPM)</label>
                    <button
                      type="button"
                      onClick={() => setPilotSettings({ ...pilotSettings, bpm: 84 })}
                      className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-600 text-white hover:bg-amber-700"
                    >
                      恢復 84 BPM 規範值
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-1.5">純器樂曲目維持 4/4 拍與恆定 84 BPM 恆速，低音大鼓與貝斯緊扣每拍，活動中不自動加速。</p>
                  <div className="flex gap-2 mb-2">
                    {[72, 80, 84, 90].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setPilotSettings({ ...pilotSettings, bpm: b })}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          pilotSettings.bpm === b
                            ? 'bg-amber-700 text-white ring-2 ring-amber-400'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {b} BPM {b === 84 ? '★標準' : ''}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="range" min="60" max="100" step="1"
                    value={pilotSettings.bpm}
                    onChange={(e) => setPilotSettings({ ...pilotSettings, bpm: Number(e.target.value) })}
                    className="w-full accent-amber-600"
                  />
                  <div className="flex justify-between text-[11px] text-gray-400">
                    <span>60 BPM (舒緩)</span>
                    <span className="font-bold text-amber-800">84 BPM (標準低強度步態)</span>
                    <span>100 BPM</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <label className="font-bold block mb-1">目標預告拍數</label>
                    <input 
                      type="number" min="1" max="4"
                      value={pilotSettings.previewBeats}
                      onChange={(e) => setPilotSettings({ ...pilotSettings, previewBeats: Number(e.target.value) })}
                      className="w-full border rounded-lg p-2 font-mono"
                    />
                    <span className="text-[10px] text-gray-500">論文規範：提前 2 拍出現</span>
                  </div>

                  <div>
                    <label className="font-bold block mb-1">時間容許窗比例</label>
                    <input 
                      type="number" min="0.1" max="0.4" step="0.05"
                      value={pilotSettings.toleranceRatio}
                      onChange={(e) => setPilotSettings({ ...pilotSettings, toleranceRatio: Number(e.target.value) })}
                      className="w-full border rounded-lg p-2 font-mono"
                    />
                    <span className="text-[10px] text-gray-500">論文規範：拍間隔 × 20%</span>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <label className="font-bold block mb-1">正式活動時長 (秒, 範圍 60~120秒)</label>
                  <div className="flex gap-2 mb-2">
                    {[60, 75, 90, 105, 120].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPilotSettings({ ...pilotSettings, formalDurationSec: s })}
                        className={`px-3 py-1 rounded text-xs font-bold ${
                          pilotSettings.formalDurationSec === s 
                            ? 'bg-amber-700 text-white' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {s}秒
                      </button>
                    ))}
                  </div>
                  <input 
                    type="number" min="30" max="180" step="5"
                    value={pilotSettings.formalDurationSec}
                    onChange={(e) => setPilotSettings({ ...pilotSettings, formalDurationSec: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 font-mono"
                  />
                  <span className="text-[10px] text-gray-500">自訂每輪活動秒數 (聚焦 60~120 秒安全低強度範圍)</span>
                </div>

                <div className="pt-2 border-t">
                  <label className="font-bold block mb-1">A方案音訊降級低通截止頻率 (Hz)</label>
                  <input 
                    type="range" min="300" max="1500" step="50"
                    value={pilotSettings.aSchemeFilterCutoffDegraded}
                    onChange={(e) => setPilotSettings({ ...pilotSettings, aSchemeFilterCutoffDegraded: Number(e.target.value) })}
                    className="w-full accent-amber-600"
                  />
                  <div className="flex justify-between text-[11px] text-gray-500 font-mono">
                    <span>300 Hz (極悶)</span>
                    <span className="font-bold text-amber-800">{pilotSettings.aSchemeFilterCutoffDegraded} Hz</span>
                    <span>1500 Hz (輕度)</span>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <label className="font-bold block mb-1">A方案音色過渡時間 (ms)</label>
                  <input 
                    type="number" min="100" max="1000" step="50"
                    value={pilotSettings.aSchemeFilterTransitionMs}
                    onChange={(e) => setPilotSettings({ ...pilotSettings, aSchemeFilterTransitionMs: Number(e.target.value) })}
                    className="w-full border rounded-lg p-2 font-mono"
                  />
                  <span className="text-[10px] text-gray-500">平滑過渡，避免突兀驚嚇 (預設 400ms)</span>
                </div>

                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold block">A方案三階段分齡純器樂曲目庫 (84 BPM 恆定)</label>
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">
                      支援自訂 MP3 載入
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    專為 45~75 歲使用者在智慧地墊節奏踩踏活動中設計，無人聲無歌詞，嚴格恆定 84 BPM，基底四拍節奏清晰，支援低通濾波優雅降級。
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-2.5">
                    {(Object.keys(RETRO_AGE_TRACKS) as RetroTrackKey[]).map((trackKey) => {
                      const track = RETRO_AGE_TRACKS[trackKey];
                      const isSelected = selectedRetroTrack === trackKey;
                      const isAuditioning = isPreviewPlaying && previewTrack === trackKey;
                      const customFileName = customFileNames[trackKey];

                      return (
                        <div
                          key={trackKey}
                          onClick={() => {
                            setSelectedRetroTrack(trackKey);
                            stepAudio.setRetroTrack(trackKey);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-amber-700 text-white border-amber-800 shadow-sm'
                              : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-800'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected ? 'bg-amber-800 text-amber-100' : 'bg-amber-100 text-amber-900'
                              }`}>
                                {track.targetAge}
                              </span>
                              {isSelected && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500 text-white font-bold">已選</span>}
                            </div>
                            <span className="font-bold block text-xs leading-snug">{track.title}</span>
                            <span className={`text-[10px] block opacity-80 mt-0.5 ${isSelected ? 'text-amber-100' : 'text-gray-500'}`}>
                              {track.era}
                            </span>
                            {customFileName && (
                              <div className={`mt-1 p-1 rounded text-[9px] flex items-center justify-between ${
                                isSelected ? 'bg-amber-900 text-amber-100' : 'bg-amber-100 text-amber-900'
                              }`}>
                                <span className="truncate max-w-[90px]">🎵 {customFileName}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearCustomMp3(trackKey);
                                  }}
                                  className="text-red-500 hover:text-red-700 ml-1"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-amber-200/30 flex gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTrackPreview(trackKey);
                              }}
                              className={`flex-1 py-1 px-1.5 rounded text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                                isAuditioning
                                  ? 'bg-amber-400 text-amber-950 animate-pulse'
                                  : isSelected
                                    ? 'bg-white/20 text-white border border-white/30'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              <Volume2 className="w-3 h-3" />
                              {isAuditioning ? '停止' : '試聽'}
                            </button>

                            <label
                              onClick={(e) => e.stopPropagation()}
                              className={`py-1 px-1.5 rounded text-[11px] font-bold flex items-center justify-center cursor-pointer ${
                                isSelected ? 'bg-white/10 text-white border border-white/20' : 'bg-gray-200 text-gray-700'
                              }`}
                              title="載入本機 MP3 音檔"
                            >
                              <Upload className="w-3 h-3" />
                              <input
                                type="file"
                                accept="audio/mp3,audio/mpeg,audio/wav,audio/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadCustomMp3(trackKey, file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-gray-500 bg-gray-50 p-2 rounded-lg border">
                    音訊架構驗證：伴奏層經由 Biquad 低通濾波器輸出；獨立節拍層直接直通 destination 輸出，維持 84 BPM 木質節拍。若已載入 MP3，系統將自動無縫循環該音檔。
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-[11px] text-gray-500">
                    * 註：所有前導數值皆完整保存於各次測試日誌快照中，非最終固定論文數據。
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full mt-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold text-sm"
              >
                確認並保存設定快照
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <JukeboxApp />
    </AppErrorBoundary>
  );
}
