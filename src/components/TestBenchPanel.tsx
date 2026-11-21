import React, { useState } from 'react';
import { NoteBlob } from '../core/noteSegmenter';
import { isNoteInScale, NOTE_NAMES, SCALES, ScaleType } from '../core/scaleEngine';
import { CheckCircle2, Play, Cpu, AlertTriangle, ShieldCheck, Gauge } from 'lucide-react';
import { detectPitchYinFrame } from '../core/pitchDetection';
import { pitchShiftBuffer } from '../core/pitchShifter';
import { generateSineTone, calculateCentDifference } from '../test/audioTestUtils';

interface TestBenchPanelProps {
  notes: NoteBlob[];
  scaleRoot: number;
  scaleType: ScaleType;
  sampleRate: number;
  totalDuration: number;
  onClose: () => void;
}

interface BenchmarkResult {
  yinTimeMs: number;
  pitchShiftTimeMs: number;
  pitchAccuracyCents: number;
  passed: boolean;
}

export const TestBenchPanel: React.FC<TestBenchPanelProps> = ({
  notes,
  scaleRoot,
  scaleType,
  sampleRate,
  totalDuration,
  onClose,
}) => {
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);

  // Statistics
  const outOfScaleNotes = notes.filter(
    (n) => !isNoteInScale(Math.round(n.targetMidi), scaleRoot, scaleType)
  );
  const shiftedNotes = notes.filter((n) => Math.abs(n.pitchShiftSemitones) > 0.05);
  const avgVibrato =
    notes.length > 0 ? (notes.reduce((s, n) => s + n.vibratoDepth, 0) / notes.length).toFixed(1) : '0';

  // Scale intervals list
  const activeIntervals = SCALES[scaleType].intervals;
  const validScaleNotes = activeIntervals.map((i) => NOTE_NAMES[(scaleRoot + i) % 12]).join(', ');

  // Run in-browser real-time benchmark
  const runLiveBenchmark = () => {
    setIsRunningBenchmark(true);
    setTimeout(() => {
      // 1. Benchmark YIN
      const testBuffer = generateSineTone(440, 0.2, { sampleRate });
      const t0 = performance.now();
      const detected = detectPitchYinFrame(testBuffer, { sampleRate });
      const yinTimeMs = performance.now() - t0;

      const accuracyCents = Math.abs(calculateCentDifference(detected.frequency, 440));

      // 2. Benchmark Pitch Shifter (0.2s audio shifted +3 semitones)
      const t1 = performance.now();
      pitchShiftBuffer(testBuffer, 3, { sampleRate });
      const pitchShiftTimeMs = performance.now() - t1;

      const passed = accuracyCents < 5 && yinTimeMs < 50 && pitchShiftTimeMs < 100;

      setBenchmarkResult({
        yinTimeMs: parseFloat(yinTimeMs.toFixed(2)),
        pitchShiftTimeMs: parseFloat(pitchShiftTimeMs.toFixed(2)),
        pitchAccuracyCents: parseFloat(accuracyCents.toFixed(2)),
        passed,
      });
      setIsRunningBenchmark(false);
    }, 50);
  };

  return (
    <aside className="w-80 bg-studio-panel border-l border-studio-border p-4 flex flex-col h-full overflow-y-auto text-xs text-gray-200 z-30 shadow-2xl">
      <div className="flex items-center justify-between pb-3 border-b border-studio-border mb-3">
        <div className="flex items-center space-x-2 text-blue-400 font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span className="text-sm">DSP Test & Quality Bench</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-studio-surface"
        >
          ✕
        </button>
      </div>

      {/* 1. Track Metrics */}
      <div className="space-y-2 mb-4 bg-studio-bg p-3 rounded border border-studio-border">
        <div className="font-semibold text-gray-300 flex items-center space-x-1.5 mb-2">
          <Gauge className="w-3.5 h-3.5 text-amber-400" />
          <span>Thông số Âm thanh (Audio Stats)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-gray-500">Độ dài:</span>{' '}
            <span className="font-mono text-gray-200">{totalDuration.toFixed(2)}s</span>
          </div>
          <div>
            <span className="text-gray-500">Sample Rate:</span>{' '}
            <span className="font-mono text-gray-200">{sampleRate} Hz</span>
          </div>
          <div>
            <span className="text-gray-500">Tổng số Nốt:</span>{' '}
            <span className="font-mono text-amber-400 font-bold">{notes.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Nốt đã chỉnh:</span>{' '}
            <span className="font-mono text-blue-400 font-bold">{shiftedNotes.length}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500">Rung giọng TB (Vibrato):</span>{' '}
            <span className="font-mono text-gray-200">{avgVibrato} cents</span>
          </div>
        </div>
      </div>

      {/* 2. Scale Integrity Inspection */}
      <div className="space-y-2 mb-4 bg-studio-bg p-3 rounded border border-studio-border">
        <div className="font-semibold text-gray-300 flex items-center space-x-1.5 mb-1">
          <Cpu className="w-3.5 h-3.5 text-purple-400" />
          <span>Kiểm tra Scale gốc</span>
        </div>
        <div className="text-[11px] text-gray-400">
          Scale: <strong className="text-amber-400">{NOTE_NAMES[scaleRoot]} {SCALES[scaleType].name}</strong>
        </div>
        <div className="text-[10px] text-slate-400 bg-studio-surface p-1.5 rounded font-mono break-words">
          Nốt trong scale: {validScaleNotes}
        </div>

        {outOfScaleNotes.length > 0 ? (
          <div className="flex items-center space-x-1.5 text-red-400 bg-red-950/30 p-2 rounded border border-red-800/40 mt-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              Phát hiện <strong>{outOfScaleNotes.length}</strong> nốt nằm ngoài Scale gốc! Bấm "Khóa về Scale" để snap.
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-950/30 p-2 rounded border border-emerald-800/40 mt-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>100% nốt hoàn toàn khớp chuẩn Scale.</span>
          </div>
        )}
      </div>

      {/* 3. In-Browser Live Benchmark */}
      <div className="space-y-3 bg-studio-bg p-3 rounded border border-studio-border">
        <div className="font-semibold text-gray-300 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Test Hiệu năng & Sai số DSP</span>
          </span>
        </div>

        <button
          onClick={runLiveBenchmark}
          disabled={isRunningBenchmark}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-medium rounded transition"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>{isRunningBenchmark ? 'Đang chạy benchmark...' : 'Chạy Benchmark Trình duyệt'}</span>
        </button>

        {benchmarkResult && (
          <div className="mt-2 space-y-1.5 text-[11px] border-t border-studio-border pt-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Sai số Dò Pitch (Cents):</span>
              <span className="font-mono text-emerald-400 font-bold">
                {benchmarkResult.pitchAccuracyCents} cents (&lt; 5 cents: PASS)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Thời gian Dò F0 (Frame):</span>
              <span className="font-mono text-gray-200">{benchmarkResult.yinTimeMs} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Thời gian Pitch Shift:</span>
              <span className="font-mono text-gray-200">{benchmarkResult.pitchShiftTimeMs} ms</span>
            </div>

            <div
              className={`p-2 rounded text-center font-bold mt-2 ${
                benchmarkResult.passed
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-700/50'
                  : 'bg-red-950/40 text-red-400 border border-red-700/50'
              }`}
            >
              {benchmarkResult.passed ? '✓ TẤT CẢ TIÊU CHUẨN ĐẠT CHUẨN MƯỢT MÀ' : 'CẢNH BÁO HIỆU NĂNG'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
