import React, { useState } from 'react';
import {
  Layers,
  Mic,
  Music,
  Download,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sparkles,
} from 'lucide-react';

interface StemManagerBarProps {
  hasStems: boolean;
  instrumentalBuffer: AudioBuffer | null;
  vocalOffsetSec: number;
  isPlayingWithBeat: boolean;
  onTogglePlayWithBeat: () => void;
  onExportEditedStem: () => void;
  onMergeAndExportFullMix: () => void;
  vocalVolume: number;
  instVolume: number;
  onChangeVocalVolume: (vol: number) => void;
  onChangeInstVolume: (vol: number) => void;
  onOpenPreProcessor: () => void;
}

export const StemManagerBar: React.FC<StemManagerBarProps> = ({
  hasStems,
  instrumentalBuffer,
  vocalOffsetSec,
  isPlayingWithBeat,
  onTogglePlayWithBeat,
  onExportEditedStem,
  onMergeAndExportFullMix,
  vocalVolume,
  instVolume,
  onChangeVocalVolume,
  onChangeInstVolume,
  onOpenPreProcessor,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!hasStems || !instrumentalBuffer) {
    return (
      <div className="bg-studio-panel/80 border-t border-studio-border px-4 py-2 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Chưa tách Stem đa track. Bạn đang chỉnh sửa trực tiếp audio gốc.</span>
        </div>
        <button
          onClick={onOpenPreProcessor}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-studio-surface hover:bg-studio-border text-amber-400 rounded border border-amber-500/30 transition text-[11px]"
        >
          <Sparkles className="w-3 h-3" />
          <span>Mở Bộ Tách Stem & Cắt Đoạn</span>
        </button>
      </div>
    );
  }

  const formatOffset = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
  };

  return (
    <div className="bg-studio-panel border-t border-studio-border text-xs text-gray-200 select-none shadow-xl">
      {/* Bar Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-studio-bg border-b border-studio-border">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-blue-400 font-bold">
            <Layers className="w-4 h-4" />
            <span>Multi-Track Stem Session</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono">
            Vocal Offset: {formatOffset(vocalOffsetSec)}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Play Merged with Beat */}
          <button
            onClick={onTogglePlayWithBeat}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition ${
              isPlayingWithBeat
                ? 'bg-amber-500 text-black'
                : 'bg-studio-surface hover:bg-studio-border text-gray-200 border border-studio-border'
            }`}
            title="Nghe thử Vocal đã sửa ghép cùng Beat gốc"
          >
            {isPlayingWithBeat ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlayingWithBeat ? 'Dừng Nghe Full' : 'Nghe Thử Ghép Cả Beat'}</span>
          </button>

          {/* Export Edited Stem Only */}
          <button
            onClick={onExportEditedStem}
            className="flex items-center space-x-1.5 px-3 py-1 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 rounded border border-purple-700/60 transition font-medium"
            title="Chỉ xuất riêng file Vocal đã sửa cao độ"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Stem Vocal</span>
          </button>

          {/* Replace & Merge Back to Full Song */}
          <button
            onClick={onMergeAndExportFullMix}
            className="flex items-center space-x-1.5 px-3.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded transition shadow-md"
            title="Thay thế Vocal đã sửa vào bài gốc và xuất file Master hoàn chỉnh"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Ghép & Xuất Full Master Mix</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-studio-surface"
          >
            {isExpanded ? '▲ Thu gọn' : '▼ Mở rộng'}
          </button>
        </div>
      </div>

      {/* Expanded Track Mix Sliders */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-2.5 bg-studio-surface/40">
          {/* Vocal Track Volume */}
          <div className="flex items-center space-x-3 bg-studio-bg px-3 py-1.5 rounded-lg border border-studio-border">
            <Mic className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-purple-300">Track 1: Vocal (Đang sửa trong Melodyne)</span>
                <span className="font-mono text-gray-400">{Math.round(vocalVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={vocalVolume}
                onChange={(e) => onChangeVocalVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-studio-border rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
            <button
              onClick={() => onChangeVocalVolume(vocalVolume > 0 ? 0 : 1.0)}
              className="text-gray-400 hover:text-white p-1 rounded"
              title="Mute Vocal"
            >
              {vocalVolume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Instrumental Track Volume */}
          <div className="flex items-center space-x-3 bg-studio-bg px-3 py-1.5 rounded-lg border border-studio-border">
            <Music className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-semibold text-blue-300">Track 2: Instrumental (Beat nhạc nền)</span>
                <span className="font-mono text-gray-400">{Math.round(instVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={instVolume}
                onChange={(e) => onChangeInstVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-studio-border rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <button
              onClick={() => onChangeInstVolume(instVolume > 0 ? 0 : 1.0)}
              className="text-gray-400 hover:text-white p-1 rounded"
              title="Mute Instrumental"
            >
              {instVolume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
