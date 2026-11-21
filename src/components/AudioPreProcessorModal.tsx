import React, { useRef, useEffect, useState } from 'react';
import {
  Scissors,
  Layers,
  Play,
  Pause,
  ArrowRight,
  RotateCcw,
  Volume2,
  Music,
  Mic,
  Clock,
  Sparkles,
  X,
} from 'lucide-react';
import { extractWaveformPeaks, trimAudioBuffer } from '../core/audioTrimmer';
import { separateStems, SeparatedStems } from '../core/stemSeparator';

interface AudioPreProcessorModalProps {
  sourceBuffer: AudioBuffer;
  fileName: string;
  onSendToMelodyne: (vocalBuffer: AudioBuffer, instrumentalBuffer?: AudioBuffer, offsetSec?: number) => void;
  onClose: () => void;
}

export const AudioPreProcessorModal: React.FC<AudioPreProcessorModalProps> = ({
  sourceBuffer,
  fileName,
  onSendToMelodyne,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalDuration = sourceBuffer.duration;

  // Region selection in seconds
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(totalDuration);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeAuditionStem, setActiveAuditionStem] = useState<'mix' | 'vocal' | 'inst'>('mix');
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Separation state
  const [isSeparating, setIsSeparating] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressStage, setProgressStage] = useState<string>('');
  const [separatedStems, setSeparatedStems] = useState<SeparatedStems | null>(null);

  // Pre-calculate peaks
  const [peaks, setPeaks] = useState<{ mins: Float32Array; maxs: Float32Array; length: number } | null>(null);

  useEffect(() => {
    const rawData = sourceBuffer.getChannelData(0);
    const calculated = extractWaveformPeaks(rawData, 1200);
    setPeaks(calculated);
    setStartSec(0);
    setEndSec(totalDuration);
  }, [sourceBuffer, totalDuration]);

  // Format time (mm:ss.s)
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
  };

  // Draw Waveform and Region handles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#181b20';
    ctx.fillRect(0, 0, width, height);

    // Waveform
    const halfH = height / 2;
    const bucketWidth = width / peaks.length;

    // Draw non-selected waveform in gray
    for (let i = 0; i < peaks.length; i++) {
      const x = i * bucketWidth;
      const t = (i / peaks.length) * totalDuration;
      const inRegion = t >= startSec && t <= endSec;

      ctx.fillStyle = inRegion ? '#e5a50a' : '#475569';
      const minY = halfH + peaks.mins[i] * (halfH - 8);
      const maxY = halfH + peaks.maxs[i] * (halfH - 8);
      const barH = Math.max(1, maxY - minY);
      ctx.fillRect(x, minY, Math.max(1, bucketWidth - 0.5), barH);
    }

    // Shading outside the selected region
    const startX = (startSec / totalDuration) * width;
    const endX = (endSec / totalDuration) * width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, startX, height);
    ctx.fillRect(endX, 0, width - endX, height);

    // Region boundary lines
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    // Start handle line
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    // End handle line
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // Start / End Handle caps
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(startX - 5, 0, 10, 16);
    ctx.fillRect(endX - 5, height - 16, 10, 16);
  }, [peaks, startSec, endSec, totalDuration]);

  // Waveform click to move handles
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / canvas.width));
    const clickSec = clickRatio * totalDuration;

    // Move closest handle
    const distToStart = Math.abs(clickSec - startSec);
    const distToEnd = Math.abs(clickSec - endSec);

    if (distToStart < distToEnd) {
      if (clickSec < endSec - 0.5) setStartSec(clickSec);
    } else {
      if (clickSec > startSec + 0.5) setEndSec(clickSec);
    }
  };

  // Audio preview playback
  const stopAudio = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      previewSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const playPreview = (stemType: 'mix' | 'vocal' | 'inst') => {
    stopAudio();

    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtxClass();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    let targetBuffer = sourceBuffer;
    if (separatedStems) {
      if (stemType === 'vocal') targetBuffer = separatedStems.vocal;
      else if (stemType === 'inst') targetBuffer = separatedStems.instrumental;
    }

    const trimmed = trimAudioBuffer(targetBuffer, startSec, endSec);
    const source = ctx.createBufferSource();
    source.buffer = trimmed;
    source.connect(ctx.destination);
    source.onended = () => setIsPlaying(false);

    source.start(0);
    previewSourceRef.current = source;
    setIsPlaying(true);
    setActiveAuditionStem(stemType);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playPreview(activeAuditionStem);
    }
  };

  // Perform Stem Separation
  const handleRunSeparation = async () => {
    stopAudio();
    setIsSeparating(true);
    setProgress(5);
    setProgressStage('Khởi tạo bộ tách Mid/Side và lọc Formant...');

    // Extract the trimmed region if user trimmed, or full buffer
    const targetBuffer =
      startSec > 0 || endSec < totalDuration
        ? trimAudioBuffer(sourceBuffer, startSec, endSec)
        : sourceBuffer;

    setTimeout(async () => {
      try {
        const stems = await separateStems(targetBuffer, (prog, stage) => {
          setProgress(prog);
          setProgressStage(stage);
        });
        setSeparatedStems(stems);
        setIsSeparating(false);
      } catch (err) {
        console.error(err);
        setIsSeparating(false);
        alert('Lỗi khi tách stem âm thanh!');
      }
    }, 100);
  };

  // Send selected stem to Melodyne
  const handleProceedToMelodyne = (useVocalStem: boolean) => {
    stopAudio();
    if (useVocalStem && separatedStems) {
      onSendToMelodyne(separatedStems.vocal, separatedStems.instrumental, startSec);
    } else {
      // Send raw trimmed audio directly
      const trimmed =
        startSec > 0 || endSec < totalDuration
          ? trimAudioBuffer(sourceBuffer, startSec, endSec)
          : sourceBuffer;
      onSendToMelodyne(trimmed, undefined, startSec);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-studio-panel border border-studio-border w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden text-gray-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-bg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-100 flex items-center space-x-2">
                <span>Tiền Xử Lý: Cắt Đoạn & Tách Stem</span>
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-normal border border-blue-500/30">
                  Bước 1 / 2
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                File: <strong className="text-gray-200">{fileName}</strong> ({formatTime(totalDuration)})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-studio-surface transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Step 1: Region Selection & Trimming */}
          <div className="space-y-3 bg-studio-bg p-4 rounded-xl border border-studio-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold text-amber-400">
                <Clock className="w-4 h-4" />
                <span>1. CHỌN ĐOẠN CẦN CHỈNH SỬA (TRIM REGION)</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center space-x-3 font-mono">
                <span>
                  Bắt đầu: <strong className="text-gray-200">{formatTime(startSec)}</strong>
                </span>
                <span>
                  Kết thúc: <strong className="text-gray-200">{formatTime(endSec)}</strong>
                </span>
                <span>
                  Độ dài đoạn: <strong className="text-amber-400">{formatTime(endSec - startSec)}</strong>
                </span>
              </div>
            </div>

            {/* Interactive Waveform Canvas */}
            <div className="relative w-full h-28 bg-[#181b20] rounded-lg border border-studio-border overflow-hidden cursor-pointer">
              <canvas
                ref={canvasRef}
                width={800}
                height={112}
                onMouseDown={handleCanvasMouseDown}
                className="w-full h-full block"
              />
            </div>
            {/* Dedicated Sliders for Start & End Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-studio-surface/50 p-3 rounded-lg border border-studio-border">
              {/* Start Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-300 font-semibold flex items-center space-x-1">
                    <span>🟢 Thanh kéo Điểm Bắt Đầu:</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{formatTime(startSec)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, endSec - 0.5)}
                  step={0.1}
                  value={startSec}
                  onChange={(e) => setStartSec(parseFloat(e.target.value))}
                  className="w-full h-2 bg-studio-border rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  title="Kéo để dời điểm bắt đầu đoạn cần chỉnh"
                />
              </div>

              {/* End Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-300 font-semibold flex items-center space-x-1">
                    <span>🔴 Thanh kéo Điểm Kết Thúc:</span>
                  </span>
                  <span className="font-mono text-amber-400 font-bold">{formatTime(endSec)}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(totalDuration, startSec + 0.5)}
                  max={totalDuration}
                  step={0.1}
                  value={endSec}
                  onChange={(e) => setEndSec(parseFloat(e.target.value))}
                  className="w-full h-2 bg-studio-border rounded-lg appearance-none cursor-pointer accent-rose-500"
                  title="Kéo để dời điểm kết thúc đoạn cần chỉnh"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-between items-center text-[11px] text-gray-400 gap-2">
              <span>💡 Bạn có thể kéo trực tiếp 2 thanh trượt ở trên hoặc click trên biểu đồ sóng âm</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setStartSec(0);
                    setEndSec(Math.min(15, totalDuration));
                  }}
                  className="px-2 py-0.5 rounded bg-studio-surface hover:bg-studio-border text-gray-300 border border-studio-border transition"
                >
                  15s đầu
                </button>
                <button
                  onClick={() => {
                    setStartSec(0);
                    setEndSec(Math.min(30, totalDuration));
                  }}
                  className="px-2 py-0.5 rounded bg-studio-surface hover:bg-studio-border text-gray-300 border border-studio-border transition"
                >
                  30s đầu
                </button>
                <button
                  onClick={() => {
                    const mid = totalDuration / 2;
                    setStartSec(Math.max(0, mid - 15));
                    setEndSec(Math.min(totalDuration, mid + 15));
                  }}
                  className="px-2 py-0.5 rounded bg-studio-surface hover:bg-studio-border text-gray-300 border border-studio-border transition"
                >
                  Đoạn giữa (Chorus)
                </button>
                <button
                  onClick={() => {
                    setStartSec(0);
                    setEndSec(totalDuration);
                  }}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-studio-surface hover:bg-studio-border text-amber-400 border border-amber-500/30 transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Cả bài ({formatTime(totalDuration)})</span>
                </button>
              </div>
            </div>

            {/* Preview Selected Region */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={togglePlay}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isPlaying
                    ? 'bg-amber-500 text-black'
                    : 'bg-studio-surface hover:bg-studio-border text-gray-200 border border-studio-border'
                }`}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPlaying ? 'Dừng Nghe Thử' : 'Nghe Thử Đoạn Đã Chọn'}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Stem Separation Section */}
          <div className="space-y-4 bg-studio-bg p-4 rounded-xl border border-studio-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold text-blue-400">
                <Layers className="w-4 h-4" />
                <span>2. TÁCH STEM ÂM THANH (VOCAL & INSTRUMENTAL / BEAT)</span>
              </div>
              <span className="text-[11px] text-gray-400">Mid-Side Spectral & Formant Extraction</span>
            </div>

            {/* Separation Action & Progress */}
            {!separatedStems && !isSeparating && (
              <div className="p-4 bg-studio-surface/50 border border-studio-border rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-200">
                    Bạn muốn tách giọng hát (Vocal) khỏi nhạc nền (Beat)?
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    Hệ thống sẽ tách Vocal độc lập để đưa vào Melodyne chỉnh nốt mượt mà mà không làm méo tiếng nhạc đệm.
                  </div>
                </div>
                <button
                  onClick={handleRunSeparation}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-md whitespace-nowrap ml-4"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Bắt Đầu Tách Stem</span>
                </button>
              </div>
            )}

            {/* Separation In Progress */}
            {isSeparating && (
              <div className="p-4 bg-studio-surface/50 border border-blue-500/30 rounded-lg space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-blue-400 font-semibold">{progressStage}</span>
                  <span className="font-mono text-gray-200">{progress}%</span>
                </div>
                <div className="w-full bg-studio-bg h-2 rounded-full overflow-hidden border border-studio-border">
                  <div
                    className="bg-blue-500 h-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Separated Stems Result Cards */}
            {separatedStems && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Vocal Stem Card */}
                <div className="p-3.5 bg-purple-950/20 border border-purple-700/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs">
                      <Mic className="w-4 h-4 text-purple-400" />
                      <span>🎤 Vocal Stem (Giọng hát)</span>
                    </div>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                      Đã tách
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Giọng hát solo sẵn sàng đưa vào Melodyne để dò cao độ và nắn nốt theo Scale.
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => playPreview('vocal')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                        isPlaying && activeAuditionStem === 'vocal'
                          ? 'bg-purple-600 text-white'
                          : 'bg-studio-surface text-gray-300 hover:text-white border border-studio-border'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{isPlaying && activeAuditionStem === 'vocal' ? 'Đang phát...' : 'Nghe Solo Vocal'}</span>
                    </button>
                    <button
                      onClick={() => handleProceedToMelodyne(true)}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs transition shadow"
                    >
                      <span>Vào Melodyne Sửa Nốt</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Instrumental Stem Card */}
                <div className="p-3.5 bg-blue-950/20 border border-blue-700/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-blue-300 font-bold text-xs">
                      <Music className="w-4 h-4 text-blue-400" />
                      <span>🎵 Instrumental / Beat Stem</span>
                    </div>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                      Nhạc nền
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Phần beat được lưu giữ nguyên bản để tự động ghép lại với Vocal sau khi chỉnh xong.
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => playPreview('inst')}
                      className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition ${
                        isPlaying && activeAuditionStem === 'inst'
                          ? 'bg-blue-600 text-white'
                          : 'bg-studio-surface text-gray-300 hover:text-white border border-studio-border'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{isPlaying && activeAuditionStem === 'inst' ? 'Đang phát...' : 'Nghe Solo Beat'}</span>
                    </button>
                    <span className="text-[11px] text-gray-500 italic">Sẵn sàng để ghép remix</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-studio-border bg-studio-bg flex items-center justify-between">
          <button
            onClick={() => handleProceedToMelodyne(false)}
            className="text-xs text-gray-400 hover:text-gray-200 underline transition"
          >
            Bỏ qua tách stem, nạp thẳng file vào Melodyne
          </button>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-studio-surface hover:bg-studio-border text-gray-300 rounded-lg text-xs font-medium transition border border-studio-border"
            >
              Hủy
            </button>
            <button
              onClick={() => handleProceedToMelodyne(!!separatedStems)}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold rounded-lg text-xs transition shadow-lg"
            >
              <span>{separatedStems ? 'Tiếp tục vào Melodyne Studio' : 'Vào Melodyne Studio'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
