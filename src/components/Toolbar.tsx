import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  Upload,
  Download,
  Music,
  Wand2,
  Volume2,
  Activity,
  Layers,
  Scissors,
  Repeat,
} from 'lucide-react';
import { NOTE_NAMES, SCALES, ScaleType } from '../core/scaleEngine';

interface ToolbarProps {
  isPlaying: boolean;
  onPlayToggle: () => void;
  onStop: () => void;
  currentTime: number;
  totalDuration: number;
  scaleRoot: number;
  scaleType: ScaleType;
  onScaleRootChange: (root: number) => void;
  onScaleTypeChange: (type: ScaleType) => void;
  onAutoDetectKey: () => void;
  onSnapAllToScale: () => void;
  onResetAllNotes: () => void;
  isWet: boolean;
  onToggleWetDry: () => void;
  onFileUpload: (file: File) => void;
  onLoadDemo: (preset: 'c_major' | 'a_minor' | 'sine_sweep') => void;
  onExportWav: () => void;
  isTestbenchOpen: boolean;
  onToggleTestbench: () => void;
  onOpenPreProcessor: () => void;
  onSeek: (time: number) => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  loopStart: number;
  loopEnd: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  isPlaying,
  onPlayToggle,
  onStop,
  currentTime,
  totalDuration,
  scaleRoot,
  scaleType,
  onScaleRootChange,
  onScaleTypeChange,
  onAutoDetectKey,
  onSnapAllToScale,
  onResetAllNotes,
  isWet,
  onToggleWetDry,
  onFileUpload,
  onLoadDemo,
  onExportWav,
  isTestbenchOpen,
  onToggleTestbench,
  onOpenPreProcessor,
  onSeek,
  isLooping,
  onToggleLoop,
  loopStart,
  loopEnd,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toFixed(1);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-studio-panel border-b border-studio-border text-xs select-none gap-2 z-20">
      {/* Brand & Project Name */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-amber-500 font-bold text-sm tracking-wide">
          <Music className="w-5 h-5 text-amber-400" />
          <span className="text-gray-100">Web Melodyne</span>
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
            PRO STUDIO
          </span>
        </div>

        {/* Upload Audio File */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept="audio/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-studio-surface hover:bg-studio-border text-gray-200 rounded border border-studio-border transition"
          title="Tải file Vocal hoặc Bài hát hoàn chỉnh"
        >
          <Upload className="w-3.5 h-3.5 text-blue-400" />
          <span>Tải Audio Bài Hát</span>
        </button>

        {/* Pre-processor / Stem Splitter button */}
        <button
          onClick={onOpenPreProcessor}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 rounded border border-blue-600/40 transition font-medium"
          title="Mở bộ cắt đoạn và tách Vocal / Beat"
        >
          <Scissors className="w-3.5 h-3.5 text-blue-400" />
          <span>Cắt & Tách Stem</span>
        </button>

        {/* Demo Presets Dropdown */}
        <select
          onChange={(e) => {
            const val = e.target.value as 'c_major' | 'a_minor' | 'sine_sweep';
            if (val) {
              onLoadDemo(val);
              e.target.value = '';
            }
          }}
          defaultValue=""
          className="bg-studio-surface hover:bg-studio-border text-gray-200 px-2.5 py-1.5 rounded border border-studio-border transition outline-none cursor-pointer"
        >
          <option value="" disabled>
            📂 Chọn Demo mẫu...
          </option>
          <option value="c_major">Demo 1: Vocal C Major Melody</option>
          <option value="a_minor">Demo 2: Vocal A Minor Pentatonic</option>
          <option value="sine_sweep">Demo 3: Sine Wave Test Sweep</option>
        </select>
      </div>

      {/* Center Transport (Play, Stop, Playhead Slider, Loop, Time) */}
      <div className="flex items-center space-x-2.5 bg-studio-bg px-3 py-1.5 rounded-lg border border-studio-border">
        <button
          onClick={onPlayToggle}
          className={`p-1.5 rounded transition ${
            isPlaying ? 'bg-amber-500 text-black font-bold shadow-md' : 'bg-studio-surface hover:bg-studio-border text-gray-200'
          }`}
          title="Play / Pause (Space)"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        <button
          onClick={onStop}
          className="p-1.5 bg-studio-surface hover:bg-studio-border text-gray-200 rounded transition"
          title="Stop & Return to Start"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>

        {/* Dedicated Playhead Scrubber Slider (Thanh kéo phát nhạc) */}
        <div className="flex items-center space-x-2 px-2 border-l border-r border-studio-border">
          <span className="font-mono text-amber-400 font-semibold text-[11px] w-12 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, totalDuration)}
            step={0.05}
            value={Math.min(currentTime, totalDuration || 1)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-28 sm:w-36 h-2 bg-studio-border rounded-lg appearance-none cursor-pointer accent-amber-500"
            title="Thanh kéo vị trí phát: Kéo để nhảy đến bất kỳ giây nào trong bài"
          />
          <span className="font-mono text-gray-500 text-[11px] w-12">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* Loop Toggle Button */}
        <button
          onClick={onToggleLoop}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition ${
            isLooping
              ? 'bg-amber-500 text-black border-amber-400 font-bold shadow'
              : 'bg-studio-surface text-gray-400 border-studio-border hover:text-white'
          }`}
          title={
            isLooping
              ? `Đang lặp vùng: ${formatTime(loopStart)} - ${formatTime(loopEnd)} (Nhấp để tắt)`
              : 'Bật Lặp Vùng Chọn (Cycle Loop)'
          }
        >
          <Repeat className={`w-3.5 h-3.5 ${isLooping ? 'animate-spin-slow text-black' : ''}`} />
          <span>{isLooping ? `Loop: ${formatTime(loopStart)} ➔ ${formatTime(loopEnd)}` : 'Loop'}</span>
        </button>

        {/* A/B Compare Toggle (Wet vs Dry) */}
        <button
          onClick={onToggleWetDry}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded border text-[11px] font-medium transition ${
            isWet
              ? 'bg-blue-600/30 border-blue-500 text-blue-300'
              : 'bg-orange-600/30 border-orange-500 text-orange-300'
          }`}
          title="Toggle between Pitched (Wet) and Original (Dry)"
        >
          <Volume2 className="w-3 h-3" />
          <span>{isWet ? 'WET' : 'DRY'}</span>
        </button>
      </div>

      {/* Scale & Quantize Controls */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-studio-bg px-2 py-1 rounded border border-studio-border">
          <span className="text-gray-400 text-[11px]">Key:</span>
          {/* Root Note selector */}
          <select
            value={scaleRoot}
            onChange={(e) => onScaleRootChange(Number(e.target.value))}
            className="bg-studio-surface text-amber-400 font-bold px-1.5 py-0.5 rounded outline-none cursor-pointer"
          >
            {NOTE_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          {/* Scale Type selector */}
          <select
            value={scaleType}
            onChange={(e) => onScaleTypeChange(e.target.value as ScaleType)}
            className="bg-studio-surface text-gray-200 px-2 py-0.5 rounded outline-none cursor-pointer"
          >
            {Object.values(SCALES).map((scale) => (
              <option key={scale.type} value={scale.type}>
                {scale.name}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Detect Key */}
        <button
          onClick={onAutoDetectKey}
          className="flex items-center space-x-1 px-2.5 py-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded border border-purple-700/60 transition"
          title="Tự động nhận diện Scale gốc từ bài hát"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Dò Scale</span>
        </button>

        {/* Snap All Notes to Scale */}
        <button
          onClick={onSnapAllToScale}
          className="flex items-center space-x-1 px-2.5 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded border border-amber-500/50 transition font-medium"
          title="Ép toàn bộ các nốt lạc về đúng Scale"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Khóa về Scale</span>
        </button>

        {/* Reset Notes */}
        <button
          onClick={onResetAllNotes}
          className="p-1.5 bg-studio-surface hover:bg-studio-border text-gray-300 rounded border border-studio-border transition"
          title="Khôi phục nốt về ban đầu"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Export WAV */}
        <button
          onClick={onExportWav}
          className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition shadow-sm"
          title="Xuất file âm thanh WAV đã chỉnh sửa"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất WAV</span>
        </button>

        {/* Testbench Diagnostics Drawer Toggle */}
        <button
          onClick={onToggleTestbench}
          className={`flex items-center space-x-1 px-2 py-1.5 rounded border transition ${
            isTestbenchOpen
              ? 'bg-blue-600 text-white border-blue-400'
              : 'bg-studio-surface hover:bg-studio-border text-gray-400 border-studio-border'
          }`}
          title="Mở bảng Test Môi trường & Đo lường DSP"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Testbed</span>
        </button>
      </div>
    </header>
  );
};
