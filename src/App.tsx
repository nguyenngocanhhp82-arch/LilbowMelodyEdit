import React, { useState, useEffect, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { PianoRoll } from './components/PianoRoll';
import { TestBenchPanel } from './components/TestBenchPanel';
import { StemManagerBar } from './components/StemManagerBar';
import { AudioPreProcessorModal } from './components/AudioPreProcessorModal';
import { audioEngine } from './core/audioPlayer';
import { analyzeAudioBuffer } from './core/pitchDetection';
import { segmentNotes, NoteBlob } from './core/noteSegmenter';
import { detectKey, isNoteInScale, snapMidiToScale, ScaleType } from './core/scaleEngine';
import { generateArpeggio, generateSyntheticVocal, generateSineTone } from './test/audioTestUtils';
import { createCompatibleBuffer } from './core/audioContextHelper';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [notes, setNotes] = useState<NoteBlob[]>([]);
  const [scaleRoot, setScaleRoot] = useState<number>(0); // 0 = C
  const [scaleType, setScaleType] = useState<ScaleType>('major');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isWet, setIsWet] = useState<boolean>(true);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isTestbenchOpen, setIsTestbenchOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Pre-processing & Multi-track Stems State
  const [isPreProcessorOpen, setIsPreProcessorOpen] = useState<boolean>(false);
  const [preProcessorSourceBuffer, setPreProcessorSourceBuffer] = useState<AudioBuffer | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('demo_song.wav');
  const [instrumentalBuffer, setInstrumentalBuffer] = useState<AudioBuffer | null>(null);
  const [vocalOffsetSec, setVocalOffsetSec] = useState<number>(0);

  // Stem Playback & Mix Volumes
  const [isPlayingWithBeat, setIsPlayingWithBeat] = useState<boolean>(false);
  const [vocalVolume, setVocalVolume] = useState<number>(1.0);
  const [instVolume, setInstVolume] = useState<number>(0.9);

  // Cycle Loop State (Bôi chọn & Lặp vùng)
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [loopStart, setLoopStart] = useState<number>(0.8);
  const [loopEnd, setLoopEnd] = useState<number>(2.8);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  // Playhead update subscriber
  useEffect(() => {
    const unsubscribe = audioEngine.onPlayhead((time) => {
      setCurrentTime(time);
    });
    return () => unsubscribe();
  }, []);

  // Keyboard shortcut: Spacebar for Play/Pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        if (isPlayingWithBeat) {
          handleTogglePlayWithBeat();
        } else {
          handlePlayToggle();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isPlayingWithBeat]);

  // Load and analyze an audio buffer into Melodyne
  const processAudioBuffer = useCallback(
    async (buffer: AudioBuffer, defaultKeyRoot?: number, defaultScale?: ScaleType) => {
      setIsAnalyzing(true);
      setTotalDuration(buffer.duration);
      setSampleRate(buffer.sampleRate);

      setTimeout(() => {
        const rawSamples = buffer.getChannelData(0);
        const frames = analyzeAudioBuffer(rawSamples, {
          sampleRate: buffer.sampleRate,
          bufferSize: 2048,
          hopSize: 512,
        });

        const segmentedNotes = segmentNotes(frames);
        setNotes(segmentedNotes);

        // Auto-detect key if not specified
        if (segmentedNotes.length > 0) {
          if (defaultKeyRoot !== undefined && defaultScale !== undefined) {
            setScaleRoot(defaultKeyRoot);
            setScaleType(defaultScale);
          } else {
            const detected = detectKey(segmentedNotes.map((n) => n.roundedMidi));
            setScaleRoot(detected.rootPitchClass);
            setScaleType(detected.scaleType);
            showToast(`Đã nhận diện Scale: ${detected.rootName} ${detected.scaleType}`);
          }
        }

        setIsAnalyzing(false);
      }, 50);
    },
    []
  );

  // Load initial demo song on mount
  useEffect(() => {
    handleLoadDemo('c_major');
  }, []);

  // Demo loader with Stems
  const handleLoadDemo = (preset: 'c_major' | 'a_minor' | 'sine_sweep') => {
    audioEngine.stop();
    setIsPlaying(false);
    setIsPlayingWithBeat(false);

    if (preset === 'c_major') {
      // C Major with deliberate out-of-scale mistake: F#4 (66) instead of F4 (65)
      const melody = [60, 62, 64, 66, 67, 69, 71, 72];
      const { buffer: vocalSamples } = generateArpeggio(melody, 0.45, 0.05, { sampleRate: 44100 });
      const vocalBuf = audioEngine.createBufferFromFloat32(vocalSamples, 44100);

      // Create a gentle backing chord pad / beat track (C - G - Am - F) as Instrumental Stem
      const instSamples = new Float32Array(vocalSamples.length);
      const rootTone = generateSineTone(130.81, vocalSamples.length / 44100, { sampleRate: 44100, amplitude: 0.35 }); // C3 bass
      const fifthTone = generateSineTone(196.0, vocalSamples.length / 44100, { sampleRate: 44100, amplitude: 0.25 }); // G3
      for (let i = 0; i < instSamples.length; i++) {
        instSamples[i] = rootTone[i] + fifthTone[i];
      }

      const instBuf = createCompatibleBuffer(2, instSamples.length, 44100);
      instBuf.getChannelData(0).set(instSamples);
      instBuf.getChannelData(1).set(instSamples);

      setInstrumentalBuffer(instBuf);
      setVocalOffsetSec(0);
      audioEngine.setInstrumentalTrack(instBuf, 0);

      // Default Loop range around C Major Demo notes (0.8s to 2.8s)
      setLoopStart(0.8);
      setLoopEnd(2.8);
      setIsLooping(true);
      audioEngine.setLoop(true, 0.8, 2.8);

      // Store in pre-processor buffer so user can test the Cutter/Splitter on Demo too!
      setPreProcessorSourceBuffer(vocalBuf);
      setUploadedFileName('Demo_C_Major_Song.wav');

      processAudioBuffer(vocalBuf, 0, 'major');
      showToast('Đã tải Demo C Major (Kèm Stem Beat nền sẵn sàng để ghép)');
    } else if (preset === 'a_minor') {
      const melody = [57, 60, 62, 64, 67, 69, 67, 64, 60];
      const { buffer } = generateArpeggio(melody, 0.4, 0.04, { sampleRate: 44100 });
      const audioBuf = audioEngine.createBufferFromFloat32(buffer, 44100);
      setInstrumentalBuffer(null);
      audioEngine.setInstrumentalTrack(null, 0);
      setPreProcessorSourceBuffer(audioBuf);
      setUploadedFileName('Demo_A_Minor_Pentatonic.wav');
      processAudioBuffer(audioBuf, 9, 'natural_minor');
      showToast('Đã tải Demo A Minor Pentatonic');
    } else if (preset === 'sine_sweep') {
      const tone1 = generateSyntheticVocal(440, 1.5, 5, 20, { sampleRate: 44100 });
      const audioBuf = audioEngine.createBufferFromFloat32(tone1, 44100);
      setInstrumentalBuffer(null);
      audioEngine.setInstrumentalTrack(null, 0);
      setPreProcessorSourceBuffer(audioBuf);
      setUploadedFileName('Sine_Sweep_440Hz.wav');
      processAudioBuffer(audioBuf, 9, 'major');
      showToast('Đã tải Test Signal A4 440Hz');
    }
  };

  // File Upload handler: Opens Pre-Processor Modal directly
  const handleFileUpload = async (file: File) => {
    try {
      showToast(`Đang đọc và phân tích file: ${file.name}...`);
      const buffer = await audioEngine.loadAudio(file);
      setPreProcessorSourceBuffer(buffer);
      setUploadedFileName(file.name);
      // Open the Pre-processing / Stem Separator Modal
      setIsPreProcessorOpen(true);
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi đọc file âm thanh!');
    }
  };

  // Called from AudioPreProcessorModal when user clicks "Vào Melodyne Studio"
  const handleSendFromPreProcessor = (
    vocalBuf: AudioBuffer,
    instBuf?: AudioBuffer,
    offsetSec: number = 0
  ) => {
    setIsPreProcessorOpen(false);
    audioEngine.stop();
    setIsPlaying(false);
    setIsPlayingWithBeat(false);

    // Save instrumental stem and relative time offset in audio player
    if (instBuf) {
      setInstrumentalBuffer(instBuf);
      setVocalOffsetSec(offsetSec);
      audioEngine.setInstrumentalTrack(instBuf, offsetSec);
      showToast('Đã tải Stem Vocal vào Melodyne! Nhạc nền (Beat) đã sẵn sàng để ghép.');
    } else {
      setInstrumentalBuffer(null);
      setVocalOffsetSec(0);
      audioEngine.setInstrumentalTrack(null, 0);
      showToast('Đã tải đoạn Vocal đã cắt vào Melodyne Studio.');
    }

    // Set as active buffer in player and run note analysis
    audioEngine.loadAudio(vocalBuf).then(() => {
      processAudioBuffer(vocalBuf);
    });
  };

  // Play / Pause toggle for single stem
  const handlePlayToggle = () => {
    if (isPlayingWithBeat) {
      audioEngine.stopMerged();
      setIsPlayingWithBeat(false);
    }

    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play();
      setIsPlaying(true);
    }
  };

  // Play / Pause toggle for Merged Vocal + Beat
  const handleTogglePlayWithBeat = () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    }

    if (isPlayingWithBeat) {
      audioEngine.stopMerged();
      setIsPlayingWithBeat(false);
    } else {
      audioEngine.playWithBeat(vocalVolume, instVolume);
      setIsPlayingWithBeat(true);
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stopMerged();
    audioEngine.stop();
    setIsPlaying(false);
    setIsPlayingWithBeat(false);
    setCurrentTime(0);
  };

  const handleSeek = (time: number) => {
    audioEngine.seek(time);
    setCurrentTime(time);
  };

  // Toggle Cycle Loop
  const handleToggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    audioEngine.setLoop(next, loopStart, loopEnd);
    showToast(next ? `Đã bật Lặp: ${loopStart.toFixed(1)}s ➔ ${loopEnd.toFixed(1)}s` : 'Đã tắt Loop');
  };

  // Set Loop from Piano Roll ("Bôi chọn vùng loop")
  const handleSetLoop = (start: number, end: number, enable: boolean = true) => {
    const validStart = Math.max(0, start);
    const validEnd = Math.max(validStart + 0.2, end);
    setLoopStart(validStart);
    setLoopEnd(validEnd);
    setIsLooping(enable);
    audioEngine.setLoop(enable, validStart, validEnd);
    showToast(`Đã bôi vùng Lặp: ${validStart.toFixed(1)}s ➔ ${validEnd.toFixed(1)}s`);
  };

  // When notes are dragged / modified
  const handleNotesChange = (updatedNotes: NoteBlob[]) => {
    setNotes(updatedNotes);
    audioEngine.updatePitchEdits(updatedNotes);
  };

  // Snap All Notes to Active Scale
  const handleSnapAllToScale = () => {
    let changedCount = 0;
    const updated = notes.map((note) => {
      const inScale = isNoteInScale(Math.round(note.targetMidi), scaleRoot, scaleType);
      if (!inScale) {
        changedCount++;
        const { targetMidi } = snapMidiToScale(note.targetMidi, scaleRoot, scaleType);
        return {
          ...note,
          targetMidi,
          pitchShiftSemitones: targetMidi - note.originalMidi,
        };
      }
      return note;
    });

    setNotes(updated);
    audioEngine.updatePitchEdits(updated);
    showToast(`Đã tự động khóa ${changedCount} nốt về đúng Scale!`);
  };

  // Auto Detect Key from current notes
  const handleAutoDetectKey = () => {
    if (notes.length === 0) return;
    const detected = detectKey(notes.map((n) => n.roundedMidi));
    setScaleRoot(detected.rootPitchClass);
    setScaleType(detected.scaleType);
    showToast(`Nhận diện giọng bài hát: ${detected.rootName} ${detected.scaleType}`);
  };

  // Reset all notes to detected original
  const handleResetAllNotes = () => {
    const updated = notes.map((n) => ({
      ...n,
      targetMidi: n.roundedMidi,
      pitchShiftSemitones: n.roundedMidi - n.originalMidi,
    }));
    setNotes(updated);
    audioEngine.updatePitchEdits(updated);
    showToast('Đã khôi phục các nốt về cao độ gốc.');
  };

  // Toggle Wet / Dry
  const handleToggleWetDry = () => {
    const next = !isWet;
    setIsWet(next);
    audioEngine.setWetDry(next);
  };

  // Export Edited Stem Only (WAV)
  const handleExportEditedStem = () => {
    const blob = audioEngine.exportEditedStemWav();
    if (!blob) {
      showToast('Không có audio để xuất!');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocal-stem-tuned-${scaleRoot}-${scaleType}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file Stem Vocal đã sửa thành công!');
  };

  // Replace Vocal into Beat & Merge Full Master Mix (WAV)
  const handleMergeAndExportFullMix = () => {
    const blob = audioEngine.exportFullMergedMixWav(vocalVolume, instVolume);
    if (!blob) {
      showToast('Không có audio để xuất!');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remixed-master-song-${scaleRoot}-${scaleType}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã thay thế Vocal và xuất Full Master Mix thành công!');
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-studio-bg select-none">
      {/* Top Studio Controls */}
      <Toolbar
        isPlaying={isPlaying}
        onPlayToggle={handlePlayToggle}
        onStop={handleStop}
        currentTime={currentTime}
        totalDuration={totalDuration}
        scaleRoot={scaleRoot}
        scaleType={scaleType}
        onScaleRootChange={(r) => setScaleRoot(r)}
        onScaleTypeChange={(s) => setScaleType(s)}
        onAutoDetectKey={handleAutoDetectKey}
        onSnapAllToScale={handleSnapAllToScale}
        onResetAllNotes={handleResetAllNotes}
        isWet={isWet}
        onToggleWetDry={handleToggleWetDry}
        onFileUpload={handleFileUpload}
        onLoadDemo={handleLoadDemo}
        onExportWav={handleExportEditedStem}
        isTestbenchOpen={isTestbenchOpen}
        onToggleTestbench={() => setIsTestbenchOpen(!isTestbenchOpen)}
        onSeek={handleSeek}
        isLooping={isLooping}
        onToggleLoop={handleToggleLoop}
        loopStart={loopStart}
        loopEnd={loopEnd}
        onOpenPreProcessor={() => {
          if (preProcessorSourceBuffer) {
            setIsPreProcessorOpen(true);
          } else {
            showToast('Vui lòng tải một file audio lên để mở bộ cắt & tách stem!');
          }
        }}
      />

      {/* Main Workspace (Piano Roll + TestBench) */}
      <main className="relative flex-1 flex w-full overflow-hidden">
        {/* Loading overlay while analyzing */}
        {isAnalyzing && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-50 text-white space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <div className="text-sm font-semibold">Đang phân tích cao độ và nốt nhạc (YIN F0 Tracking)...</div>
          </div>
        )}

        {/* Melodyne Interactive Piano Roll Canvas */}
        <PianoRoll
          notes={notes}
          onNotesChange={handleNotesChange}
          scaleRoot={scaleRoot}
          scaleType={scaleType}
          currentTime={currentTime}
          totalDuration={totalDuration}
          onSeek={handleSeek}
          isLooping={isLooping}
          loopStart={loopStart}
          loopEnd={loopEnd}
          onSetLoop={handleSetLoop}
        />

        {/* Diagnostic & Quality Testbench Panel */}
        {isTestbenchOpen && (
          <TestBenchPanel
            notes={notes}
            scaleRoot={scaleRoot}
            scaleType={scaleType}
            sampleRate={sampleRate}
            totalDuration={totalDuration}
            onClose={() => setIsTestbenchOpen(false)}
          />
        )}
      </main>

      {/* Multi-Track Stem Session Bar (Bottom) */}
      <StemManagerBar
        hasStems={!!instrumentalBuffer}
        instrumentalBuffer={instrumentalBuffer}
        vocalOffsetSec={vocalOffsetSec}
        isPlayingWithBeat={isPlayingWithBeat}
        onTogglePlayWithBeat={handleTogglePlayWithBeat}
        onExportEditedStem={handleExportEditedStem}
        onMergeAndExportFullMix={handleMergeAndExportFullMix}
        vocalVolume={vocalVolume}
        instVolume={instVolume}
        onChangeVocalVolume={setVocalVolume}
        onChangeInstVolume={setInstVolume}
        onOpenPreProcessor={() => setIsPreProcessorOpen(true)}
      />

      {/* Pre-Processing: Audio Trimmer & Stem Splitter Modal */}
      {isPreProcessorOpen && preProcessorSourceBuffer && (
        <AudioPreProcessorModal
          sourceBuffer={preProcessorSourceBuffer}
          fileName={uploadedFileName}
          onSendToMelodyne={handleSendFromPreProcessor}
          onClose={() => setIsPreProcessorOpen(false)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-800 text-amber-300 border border-amber-500/50 px-4 py-2 rounded-full shadow-2xl text-xs font-semibold z-50 animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;
