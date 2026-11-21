import React, { useRef, useEffect, useState, useCallback } from 'react';
import { NoteBlob } from '../core/noteSegmenter';
import {
  isNoteInScale,
  snapMidiToScale,
  midiToNoteName,
  NOTE_NAMES,
  ScaleType,
} from '../core/scaleEngine';
import { ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, MoveHorizontal, Repeat } from 'lucide-react';
import { audioEngine } from '../core/audioPlayer';

interface PianoRollProps {
  notes: NoteBlob[];
  onNotesChange: (updatedNotes: NoteBlob[]) => void;
  scaleRoot: number; // 0..11
  scaleType: ScaleType;
  currentTime: number;
  totalDuration: number;
  onSeek: (time: number) => void;
  isLooping: boolean;
  loopStart: number;
  loopEnd: number;
  onSetLoop: (start: number, end: number, enable: boolean) => void;
}

const BASE_PIXELS_PER_SECOND = 140;
const ROW_HEIGHT = 24;
const KEYBOARD_WIDTH = 64;
const RULER_HEIGHT = 32;
const MIN_MIDI = 48; // C3
const MAX_MIDI = 84; // C6
const TOTAL_ROWS = MAX_MIDI - MIN_MIDI + 1;

export const PianoRoll: React.FC<PianoRollProps> = ({
  notes,
  onNotesChange,
  scaleRoot,
  scaleType,
  currentTime,
  totalDuration,
  onSeek,
  isLooping,
  loopStart,
  loopEnd,
  onSetLoop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const pixelsPerSec = Math.max(40, Math.min(500, BASE_PIXELS_PER_SECOND * zoom));

  const [scrollX, setScrollX] = useState<number>(0);
  const [scrollY, setScrollY] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(1000);

  // Note dragging state
  const draggingNoteRef = useRef<{
    noteId: string;
    startY: number;
    initialTargetMidi: number;
  } | null>(null);

  // Minimap dragging state
  const isDraggingMinimapRef = useRef<boolean>(false);

  // Loop & Ruler dragging state ("Bôi chọn vùng loop")
  const rulerDragRef = useRef<{
    startX: number;
    startTime: number;
    mode: 'select_loop' | 'move_loop' | 'resize_start' | 'resize_end' | 'seek';
    initialLoopStart: number;
    initialLoopEnd: number;
    hasDragged: boolean;
  } | null>(null);

  const [hoveredNote, setHoveredNote] = useState<NoteBlob | null>(null);

  const effectiveDuration = Math.max(6, totalDuration || 10);
  const maxScrollTime = Math.max(0, effectiveDuration - (viewportWidth - KEYBOARD_WIDTH) / pixelsPerSec);
  const maxScrollX = maxScrollTime * pixelsPerSec;

  // Auto-scroll vertically to fit notes on initial load
  useEffect(() => {
    if (notes.length > 0 && containerRef.current) {
      const avgMidi = notes.reduce((sum, n) => sum + n.roundedMidi, 0) / notes.length;
      const targetY = (MAX_MIDI - avgMidi) * ROW_HEIGHT - containerRef.current.clientHeight / 2;
      setScrollY(Math.max(0, targetY));
    }
  }, [notes.length]);

  // Global mouseup listener to guarantee audio preview stops cleanly
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      audioEngine.stopNotePreview();
      draggingNoteRef.current = null;
      if (rulerDragRef.current) {
        rulerDragRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Update viewport width on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setViewportWidth(containerRef.current.clientWidth);
      }
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = Math.max(
          TOTAL_ROWS * ROW_HEIGHT + RULER_HEIGHT,
          containerRef.current.clientHeight
        );
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m.toString().padStart(2, '0')}:${s.padStart(4, '0')}`;
  };

  // -------------------------------------------------------------
  // Render Minimap Overview Navigator
  // -------------------------------------------------------------
  useEffect(() => {
    const mini = minimapCanvasRef.current;
    if (!mini) return;
    const ctx = mini.getContext('2d');
    if (!ctx) return;

    const w = mini.width;
    const h = mini.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#16191d';
    ctx.fillRect(0, 0, w, h);

    // Draw Loop highlight on minimap
    if (loopEnd > loopStart) {
      const lx1 = (loopStart / effectiveDuration) * w;
      const lx2 = (loopEnd / effectiveDuration) * w;
      ctx.fillStyle = isLooping ? 'rgba(245, 158, 11, 0.35)' : 'rgba(100, 116, 139, 0.25)';
      ctx.fillRect(lx1, 0, Math.max(4, lx2 - lx1), h);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(lx1, 0, Math.max(4, lx2 - lx1), h);
    }

    // Draw miniature note dots across the song timeline
    for (const note of notes) {
      const nx = (note.startTime / effectiveDuration) * w;
      const nw = Math.max(3, (note.duration / effectiveDuration) * w);
      const ny = ((MAX_MIDI - note.targetMidi) / TOTAL_ROWS) * (h - 8) + 4;

      const inScale = isNoteInScale(Math.round(note.targetMidi), scaleRoot, scaleType);
      ctx.fillStyle = inScale ? '#e5a50a' : '#ef4444';
      ctx.fillRect(nx, ny, nw, 3);
    }

    // Current playhead line in minimap
    const playheadX = (currentTime / effectiveDuration) * w;
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();

    // Draggable Viewport Box
    const visibleDuration = (viewportWidth - KEYBOARD_WIDTH) / pixelsPerSec;
    const boxStartRatio = (scrollX / pixelsPerSec) / effectiveDuration;
    const boxWidthRatio = visibleDuration / effectiveDuration;

    const boxX = Math.max(0, boxStartRatio * w);
    const boxW = Math.max(24, Math.min(w - boxX, boxWidthRatio * w));

    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.fillRect(boxX, 0, boxW, h);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, 1, boxW, h - 2);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(boxX, 0, 4, h);
    ctx.fillRect(boxX + boxW - 4, 0, 4, h);
  }, [notes, effectiveDuration, currentTime, scrollX, pixelsPerSec, viewportWidth, scaleRoot, scaleType, isLooping, loopStart, loopEnd]);

  const handleMinimapMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mini = minimapCanvasRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / mini.width));

    const visibleDuration = (viewportWidth - KEYBOARD_WIDTH) / pixelsPerSec;
    const targetStartSec = ratio * effectiveDuration - visibleDuration / 2;
    const clampedSec = Math.max(0, Math.min(maxScrollTime, targetStartSec));

    setScrollX(clampedSec * pixelsPerSec);
    isDraggingMinimapRef.current = true;
  };

  const handleMinimapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingMinimapRef.current) return;
    const mini = minimapCanvasRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / mini.width));

    const visibleDuration = (viewportWidth - KEYBOARD_WIDTH) / pixelsPerSec;
    const targetStartSec = ratio * effectiveDuration - visibleDuration / 2;
    const clampedSec = Math.max(0, Math.min(maxScrollTime, targetStartSec));

    setScrollX(clampedSec * pixelsPerSec);
  };

  const handleMinimapMouseUp = () => {
    isDraggingMinimapRef.current = false;
  };

  // -------------------------------------------------------------
  // Main Piano Roll Canvas Render
  // -------------------------------------------------------------
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Rows (Pitch rows)
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const rowIndex = MAX_MIDI - midi;
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY;

      if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;

      const inScale = isNoteInScale(midi, scaleRoot, scaleType);
      const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);

      if (inScale) {
        ctx.fillStyle = isBlackKey ? '#22272e' : '#2d333b';
      } else {
        ctx.fillStyle = '#16191d';
      }

      ctx.fillRect(KEYBOARD_WIDTH, y, width - KEYBOARD_WIDTH, ROW_HEIGHT);

      ctx.strokeStyle = '#2d333b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(KEYBOARD_WIDTH, y + ROW_HEIGHT);
      ctx.lineTo(width, y + ROW_HEIGHT);
      ctx.stroke();

      if (midi % 12 === scaleRoot) {
        ctx.fillStyle = 'rgba(229, 165, 10, 0.08)';
        ctx.fillRect(KEYBOARD_WIDTH, y, width - KEYBOARD_WIDTH, ROW_HEIGHT);
      }
    }

    // 2. Loop Region Highlight Background (Golden Translucent Column)
    if (loopEnd > loopStart) {
      const loopX1 = KEYBOARD_WIDTH + loopStart * pixelsPerSec - scrollX;
      const loopX2 = KEYBOARD_WIDTH + loopEnd * pixelsPerSec - scrollX;
      const loopW = loopX2 - loopX1;

      // Draw vertical translucent banner across notes
      ctx.fillStyle = isLooping ? 'rgba(245, 158, 11, 0.08)' : 'rgba(148, 163, 184, 0.05)';
      ctx.fillRect(Math.max(KEYBOARD_WIDTH, loopX1), RULER_HEIGHT, Math.min(width - Math.max(KEYBOARD_WIDTH, loopX1), loopW), height - RULER_HEIGHT);

      // Loop side boundaries
      ctx.strokeStyle = isLooping ? '#f59e0b' : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (loopX1 >= KEYBOARD_WIDTH && loopX1 <= width) {
        ctx.moveTo(loopX1, RULER_HEIGHT);
        ctx.lineTo(loopX1, height);
      }
      if (loopX2 >= KEYBOARD_WIDTH && loopX2 <= width) {
        ctx.moveTo(loopX2, RULER_HEIGHT);
        ctx.lineTo(loopX2, height);
      }
      ctx.stroke();
    }

    // 3. Vertical Beat & Time Grid Lines
    const stepSec = pixelsPerSec > 250 ? 0.25 : pixelsPerSec > 100 ? 0.5 : 1.0;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    const visibleStartTime = Math.max(0, scrollX / pixelsPerSec);
    const visibleEndTime = visibleStartTime + (width - KEYBOARD_WIDTH) / pixelsPerSec + 1;
    const firstGridTime = Math.floor(visibleStartTime / stepSec) * stepSec;

    for (let t = firstGridTime; t <= visibleEndTime; t += stepSec) {
      const x = KEYBOARD_WIDTH + t * pixelsPerSec - scrollX;
      if (x < KEYBOARD_WIDTH || x > width) continue;

      ctx.strokeStyle = t % 1 === 0 ? '#38404a' : '#252a32';
      ctx.lineWidth = t % 1 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // 4. Draw Note Blobs (Melodyne style capsules)
    for (const note of notes) {
      const noteMidi = note.targetMidi;
      const rowIndex = MAX_MIDI - Math.round(noteMidi);
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY + 3;
      const x = KEYBOARD_WIDTH + note.startTime * pixelsPerSec - scrollX;
      const noteWidth = Math.max(16, note.duration * pixelsPerSec);

      if (x + noteWidth < KEYBOARD_WIDTH || x > width || y + ROW_HEIGHT < RULER_HEIGHT || y > height) {
        continue;
      }

      const inScale = isNoteInScale(Math.round(noteMidi), scaleRoot, scaleType);
      const isShifted = Math.abs(note.pitchShiftSemitones) > 0.05;

      const grad = ctx.createLinearGradient(x, y, x, y + ROW_HEIGHT - 6);
      if (!inScale) {
        grad.addColorStop(0, '#f87171');
        grad.addColorStop(1, '#dc2626');
      } else if (isShifted) {
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(1, '#0284c7');
      } else {
        grad.addColorStop(0, '#fbbf24');
        grad.addColorStop(1, '#d97706');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      const radius = 6;
      ctx.roundRect(x, y, noteWidth, ROW_HEIGHT - 6, radius);
      ctx.fill();

      ctx.strokeStyle = note.isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = note.isSelected ? 2 : 1;
      ctx.stroke();

      if (note.pitchContour && note.pitchContour.length > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        for (let i = 0; i < note.pitchContour.length; i++) {
          const pt = note.pitchContour[i];
          const px = KEYBOARD_WIDTH + pt.time * pixelsPerSec - scrollX;
          const py = y + (ROW_HEIGHT - 6) / 2 - (pt.centOffset / 100) * (ROW_HEIGHT / 2);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px sans-serif';
      const label = `${midiToNoteName(note.targetMidi)}${
        isShifted ? ` (${note.pitchShiftSemitones > 0 ? '+' : ''}${Math.round(note.pitchShiftSemitones)})` : ''
      }`;
      ctx.fillText(label, x + 8, y + 13);
    }

    // 5. Playhead (Vertical red cursor)
    const playheadX = KEYBOARD_WIDTH + currentTime * pixelsPerSec - scrollX;
    if (playheadX >= KEYBOARD_WIDTH && playheadX <= width) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, RULER_HEIGHT);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead top triangle handle
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, RULER_HEIGHT);
      ctx.lineTo(playheadX + 6, RULER_HEIGHT);
      ctx.lineTo(playheadX, RULER_HEIGHT + 8);
      ctx.closePath();
      ctx.fill();
    }

    // 6. Left Keyboard (Sticky on left)
    ctx.fillStyle = '#1e2227';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, height);

    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const rowIndex = MAX_MIDI - midi;
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY;

      if (y + ROW_HEIGHT < RULER_HEIGHT || y > height) continue;

      const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);
      const inScale = isNoteInScale(midi, scaleRoot, scaleType);
      const isRoot = midi % 12 === scaleRoot;

      ctx.fillStyle = isBlackKey ? '#181a1f' : '#f1f5f9';
      ctx.fillRect(0, y, KEYBOARD_WIDTH, ROW_HEIGHT - 1);

      ctx.fillStyle = '#0f1115';
      ctx.fillRect(0, y + ROW_HEIGHT - 1, KEYBOARD_WIDTH, 1);

      if (inScale) {
        ctx.fillStyle = isRoot ? '#f59e0b' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(8, y + ROW_HEIGHT / 2, isRoot ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isBlackKey ? '#94a3b8' : '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(midiToNoteName(midi), KEYBOARD_WIDTH - 6, y + ROW_HEIGHT / 2 + 3);
    }

    ctx.strokeStyle = '#3b4252';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(KEYBOARD_WIDTH, 0);
    ctx.lineTo(KEYBOARD_WIDTH, height);
    ctx.stroke();

    // 7. Top Time Ruler & Loop Ribbon (Sticky on top)
    ctx.fillStyle = '#1a1d21';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);
    ctx.strokeStyle = '#3b4252';
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    ctx.stroke();

    // Draw Cycle Loop Ribbon Bar on the top portion of Ruler (0..14px)
    if (loopEnd > loopStart) {
      const loopX1 = KEYBOARD_WIDTH + loopStart * pixelsPerSec - scrollX;
      const loopX2 = KEYBOARD_WIDTH + loopEnd * pixelsPerSec - scrollX;
      const loopW = Math.max(8, loopX2 - loopX1);

      // Ribbon background
      ctx.fillStyle = isLooping ? '#f59e0b' : '#64748b';
      ctx.fillRect(Math.max(KEYBOARD_WIDTH, loopX1), 1, Math.min(width - Math.max(KEYBOARD_WIDTH, loopX1), loopW), 14);

      // Left bracket handle [
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(loopX1 - 2, 0, 4, 16);
      // Right bracket handle ]
      ctx.fillRect(loopX2 - 2, 0, 4, 16);

      // Label inside loop ribbon
      if (loopW > 50) {
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
          `🔁 LOOP [${formatTime(loopStart)} - ${formatTime(loopEnd)}]`,
          Math.max(KEYBOARD_WIDTH + 6, loopX1 + 6),
          11
        );
      }
    }

    // Ruler Timestamps & Ticks on bottom portion (14..32px)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    const rulerStep = pixelsPerSec > 180 ? 0.5 : 1.0;
    const firstRulerTime = Math.floor(visibleStartTime / rulerStep) * rulerStep;

    for (let t = firstRulerTime; t <= visibleEndTime; t += rulerStep) {
      const x = KEYBOARD_WIDTH + t * pixelsPerSec - scrollX;
      if (x >= KEYBOARD_WIDTH && x <= width) {
        ctx.fillText(`${t.toFixed(1)}s`, x, 27);
        ctx.fillRect(x, RULER_HEIGHT - 4, 1, 4);
      }
    }

    // Top-left corner cell
    ctx.fillStyle = '#141619';
    ctx.fillRect(0, 0, KEYBOARD_WIDTH, RULER_HEIGHT);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${NOTE_NAMES[scaleRoot]} ${scaleType.slice(0, 4)}`, KEYBOARD_WIDTH / 2, 21);
  }, [notes, scaleRoot, scaleType, currentTime, pixelsPerSec, scrollX, scrollY, isLooping, loopStart, loopEnd]);

  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderCanvas();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvas]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const delta = e.deltaX || e.deltaY;
      setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + delta)));
    } else {
      setScrollY((prev) =>
        Math.max(0, Math.min(TOTAL_ROWS * ROW_HEIGHT - (containerRef.current?.clientHeight || 400), prev + e.deltaY))
      );
    }
  };

  // Mouse Down in Piano Roll & Ruler
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // 1. Interaction on the TOP RULER (Loop Selection & Seek)
    if (clickY <= RULER_HEIGHT) {
      const clickTime = Math.max(0, (clickX - KEYBOARD_WIDTH + scrollX) / pixelsPerSec);

      // Check if clicking near loop start or loop end bracket handles
      const loopX1 = KEYBOARD_WIDTH + loopStart * pixelsPerSec - scrollX;
      const loopX2 = KEYBOARD_WIDTH + loopEnd * pixelsPerSec - scrollX;

      if (Math.abs(clickX - loopX1) < 10) {
        // Resize loop start
        rulerDragRef.current = {
          startX: clickX,
          startTime: clickTime,
          mode: 'resize_start',
          initialLoopStart: loopStart,
          initialLoopEnd: loopEnd,
          hasDragged: false,
        };
        return;
      }

      if (Math.abs(clickX - loopX2) < 10) {
        // Resize loop end
        rulerDragRef.current = {
          startX: clickX,
          startTime: clickTime,
          mode: 'resize_end',
          initialLoopStart: loopStart,
          initialLoopEnd: loopEnd,
          hasDragged: false,
        };
        return;
      }

      if (clickX > loopX1 + 10 && clickX < loopX2 - 10 && clickY <= 16) {
        // Move entire loop window
        rulerDragRef.current = {
          startX: clickX,
          startTime: clickTime,
          mode: 'move_loop',
          initialLoopStart: loopStart,
          initialLoopEnd: loopEnd,
          hasDragged: false,
        };
        return;
      }

      // Otherwise: Start "Bôi chọn" (Drag to create new Loop Region)
      rulerDragRef.current = {
        startX: clickX,
        startTime: clickTime,
        mode: 'select_loop',
        initialLoopStart: clickTime,
        initialLoopEnd: clickTime,
        hasDragged: false,
      };
      return;
    }

    // 2. Click on Note Blob
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const rowIndex = MAX_MIDI - Math.round(note.targetMidi);
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY + 3;
      const x = KEYBOARD_WIDTH + note.startTime * pixelsPerSec - scrollX;
      const noteWidth = Math.max(16, note.duration * pixelsPerSec);

      if (clickX >= x && clickX <= x + noteWidth && clickY >= y && clickY <= y + ROW_HEIGHT - 6) {
        draggingNoteRef.current = {
          noteId: note.id,
          startY: clickY,
          initialTargetMidi: note.targetMidi,
        };
        const updated = notes.map((n) => ({ ...n, isSelected: n.id === note.id }));
        onNotesChange(updated);

        // Phát tiếng ngay khi ấn vào note & giữ tiếng nếu đang giữ chuột!
        audioEngine.startNotePreview(note, note.targetMidi);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Handle Ruler Loop Dragging ("Bôi chọn" / Resize / Move)
    if (rulerDragRef.current) {
      const r = rulerDragRef.current;
      const currentMouseTime = Math.max(0, (mouseX - KEYBOARD_WIDTH + scrollX) / pixelsPerSec);

      if (Math.abs(mouseX - r.startX) > 4) {
        r.hasDragged = true;
      }

      if (r.mode === 'select_loop') {
        const s = Math.min(r.startTime, currentMouseTime);
        const end = Math.max(r.startTime, currentMouseTime);
        if (end - s >= 0.1) {
          onSetLoop(s, end, true);
        }
      } else if (r.mode === 'resize_start') {
        const newStart = Math.min(r.initialLoopEnd - 0.2, currentMouseTime);
        onSetLoop(newStart, r.initialLoopEnd, true);
      } else if (r.mode === 'resize_end') {
        const newEnd = Math.max(r.initialLoopStart + 0.2, currentMouseTime);
        onSetLoop(r.initialLoopStart, newEnd, true);
      } else if (r.mode === 'move_loop') {
        const delta = currentMouseTime - r.startTime;
        const dur = r.initialLoopEnd - r.initialLoopStart;
        const newStart = Math.max(0, r.initialLoopStart + delta);
        onSetLoop(newStart, newStart + dur, true);
      }
      return;
    }

    // Handle Note Dragging
    if (draggingNoteRef.current) {
      const { noteId, startY, initialTargetMidi } = draggingNoteRef.current;
      const deltaY = mouseY - startY;
      const semitoneChange = -deltaY / ROW_HEIGHT;
      const continuousMidi = initialTargetMidi + semitoneChange;

      const { targetMidi } = snapMidiToScale(continuousMidi, scaleRoot, scaleType);

      const updated = notes.map((n) => {
        if (n.id === noteId) {
          return {
            ...n,
            targetMidi,
            pitchShiftSemitones: targetMidi - n.originalMidi,
          };
        }
        return n;
      });
      onNotesChange(updated);

      // Phát tiếng thay đổi cao độ thời gian thực khi kéo note lên / xuống!
      const targetNote = notes.find((n) => n.id === noteId);
      if (targetNote) {
        audioEngine.updateNotePreviewPitch(targetNote, targetMidi);
      }
      return;
    }

    // Hover detection
    let found: NoteBlob | null = null;
    for (const note of notes) {
      const rowIndex = MAX_MIDI - Math.round(note.targetMidi);
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY + 3;
      const x = KEYBOARD_WIDTH + note.startTime * pixelsPerSec - scrollX;
      const noteWidth = Math.max(16, note.duration * pixelsPerSec);

      if (mouseX >= x && mouseX <= x + noteWidth && mouseY >= y && mouseY <= y + ROW_HEIGHT - 6) {
        found = note;
        break;
      }
    }
    setHoveredNote(found);
  };

  const handleMouseUp = () => {
    // Dừng phát tiếng note khi thả chuột
    audioEngine.stopNotePreview();

    // If user clicked on ruler without dragging, perform a Seek!
    if (rulerDragRef.current) {
      if (!rulerDragRef.current.hasDragged) {
        onSeek(rulerDragRef.current.startTime);
      }
      rulerDragRef.current = null;
    }
    draggingNoteRef.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    for (const note of notes) {
      const rowIndex = MAX_MIDI - Math.round(note.targetMidi);
      const y = rowIndex * ROW_HEIGHT + RULER_HEIGHT - scrollY + 3;
      const x = KEYBOARD_WIDTH + note.startTime * pixelsPerSec - scrollX;
      const noteWidth = Math.max(16, note.duration * pixelsPerSec);

      if (clickX >= x && clickX <= x + noteWidth && clickY >= y && clickY <= y + ROW_HEIGHT - 6) {
        const updated = notes.map((n) => {
          if (n.id === note.id) {
            return {
              ...n,
              targetMidi: n.roundedMidi,
              pitchShiftSemitones: n.roundedMidi - n.originalMidi,
            };
          }
          return n;
        });
        onNotesChange(updated);
        break;
      }
    }
  };

  const stepTimeline = (deltaSec: number) => {
    setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + deltaSec * pixelsPerSec)));
  };

  return (
    <div className="relative flex-1 flex flex-col w-full h-full bg-studio-bg overflow-hidden select-none">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP TIMELINE MINIMAP & DRAGGABLE VIEWPORT NAVIGATOR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#121417] border-b border-studio-border px-3 py-1 flex items-center space-x-3 text-[11px] text-gray-400">
        <span className="font-semibold text-amber-400 whitespace-nowrap flex items-center space-x-1">
          <MoveHorizontal className="w-3.5 h-3.5" />
          <span>Thanh Kéo Tổng Quan:</span>
        </span>

        {/* Minimap Interactive Canvas */}
        <div className="relative flex-1 h-7 bg-[#16191d] rounded border border-studio-border overflow-hidden cursor-ew-resize">
          <canvas
            ref={minimapCanvasRef}
            width={700}
            height={28}
            onMouseDown={handleMinimapMouseDown}
            onMouseMove={handleMinimapMouseMove}
            onMouseUp={handleMinimapMouseUp}
            onMouseLeave={handleMinimapMouseUp}
            className="w-full h-full block"
            title="Kéo hộp màu xanh để lướt toàn bài, dải màu vàng là vùng đang lặp (Loop)"
          />
        </div>

        {/* Loop Status Pill on Top */}
        {isLooping && (
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono">
            <Repeat className="w-3 h-3 animate-spin-slow" />
            <span>Lặp: {formatTime(loopStart)} - {formatTime(loopEnd)}</span>
          </div>
        )}

        <span className="font-mono text-gray-300 text-[11px] whitespace-nowrap">
          Đang xem: <strong className="text-amber-400">{formatTime(scrollX / pixelsPerSec)}</strong> / {formatTime(effectiveDuration)}
        </span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN PIANO ROLL WORKSPACE */}
      {/* ------------------------------------------------------------- */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="relative flex-1 w-full h-full overflow-hidden bg-studio-bg cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className="block w-full h-full"
        />

        {/* Note Hover Tooltip */}
        {hoveredNote && (
          <div
            className="absolute pointer-events-none bg-slate-900 border border-slate-700 text-xs text-white px-2 py-1 rounded shadow-lg z-30"
            style={{
              left: Math.min(
                window.innerWidth - 180,
                KEYBOARD_WIDTH + hoveredNote.startTime * pixelsPerSec - scrollX + 10
              ),
              top: Math.max(
                40,
                (MAX_MIDI - Math.round(hoveredNote.targetMidi)) * ROW_HEIGHT + RULER_HEIGHT - scrollY - 26
              ),
            }}
          >
            <div className="font-semibold text-amber-400">
              {midiToNoteName(hoveredNote.targetMidi)} (Gốc: {midiToNoteName(hoveredNote.originalMidi)})
            </div>
            <div className="text-slate-300">
              Dịch: {hoveredNote.pitchShiftSemitones > 0 ? '+' : ''}
              {hoveredNote.pitchShiftSemitones.toFixed(1)} semitones
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. BOTTOM HORIZONTAL SCROLL SLIDER & ZOOM TOOLBAR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#181a1f] border-t border-studio-border px-4 py-1.5 flex items-center justify-between text-xs text-gray-300 gap-4">
        {/* Navigation Step Buttons & Slider */}
        <div className="flex items-center space-x-2 flex-1 max-w-xl">
          <button
            onClick={() => stepTimeline(-2)}
            className="p-1 rounded bg-studio-surface hover:bg-studio-border text-gray-300 transition"
            title="Lùi 2 giây"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Dedicated Horizontal Range Slider */}
          <div className="flex-1 flex items-center space-x-2 bg-studio-bg px-2.5 py-1 rounded border border-studio-border">
            <span className="text-[10px] text-gray-500 font-mono">0:00</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, maxScrollX)}
              step={1}
              value={Math.min(scrollX, maxScrollX)}
              onChange={(e) => setScrollX(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-studio-border rounded-lg appearance-none cursor-pointer accent-amber-500"
              title="Kéo thanh này để di chuyển vị trí hiển thị dọc theo bài hát"
            />
            <span className="text-[10px] text-gray-500 font-mono">{formatTime(effectiveDuration)}</span>
          </div>

          <button
            onClick={() => stepTimeline(2)}
            className="p-1 rounded bg-studio-surface hover:bg-studio-border text-gray-300 transition"
            title="Tiến 2 giây"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Instructions Hint */}
        <div className="hidden lg:flex items-center space-x-1 text-[11px] text-amber-400/80">
          <span>💡 <strong>Mẹo:</strong> Bôi chuột trên thước thời gian trên cùng để tạo vùng <strong>Loop</strong> nghe lặp đoạn</span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-gray-400">Thu phóng:</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.4, parseFloat((z - 0.2).toFixed(1))))}
            className="p-1 rounded bg-studio-surface hover:bg-studio-border text-gray-300 transition"
            title="Thu nhỏ timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-amber-400 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3.0, parseFloat((z + 0.2).toFixed(1))))}
            className="p-1 rounded bg-studio-surface hover:bg-studio-border text-gray-300 transition"
            title="Phóng to timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoom(1.0);
              setScrollX(0);
            }}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-studio-surface hover:bg-studio-border text-gray-300 text-[11px] transition"
            title="Xem vừa màn hình"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Fit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
