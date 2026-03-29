/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Midi } from "@tonejs/midi";

export interface ParsedNote {
  name: string;
  duration: string;
  ticks: number;
  durationTicks: number;
  startMeasure: number;
  startOffset: number;
  endMeasure: number;
  endOffset: number;
  endTick: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getRhythmicFraction(ticks: number, ticksPerMeasure: number): string {
  if (ticks === 0) return "";
  const ratio = ticks / ticksPerMeasure;
  // Try common denominators: 2, 4, 8, 16, 32
  for (const den of [2, 4, 8, 16, 32]) {
    const num = Math.round(ratio * den);
    if (Math.abs(num / den - ratio) < 0.001) {
      if (num === 0) return "";
      const common = gcd(num, den);
      return `(${num / common}/${den / common})`;
    }
  }
  return `(${ratio.toFixed(2)})`;
}

function getDurationFraction(durationTicks: number, ticksPerBeat: number): string {
  const wholeNoteTicks = ticksPerBeat * 4;
  const ratio = durationTicks / wholeNoteTicks;

  if (Math.abs(ratio - 1) < 0.01) return "1/1";
  if (Math.abs(ratio - 0.5) < 0.01) return "1/2";
  if (Math.abs(ratio - 0.25) < 0.01) return "1/4";
  if (Math.abs(ratio - 0.125) < 0.01) return "1/8";
  if (Math.abs(ratio - 0.0625) < 0.01) return "1/16";
  if (Math.abs(ratio - 0.03125) < 0.01) return "1/32";

  if (Math.abs(ratio - 0.75) < 0.01) return "1/2.";
  if (Math.abs(ratio - 0.375) < 0.01) return "1/4.";
  if (Math.abs(ratio - 0.1875) < 0.01) return "1/8.";

  return `~${Math.round(1 / ratio)}th`;
}

function formatPosition(m: number, o: number, tpm: number, isEnd: boolean): string {
  if (o === 0) return isEnd ? `${m - 1}` : `${m}`;
  const frac = getRhythmicFraction(o, tpm);
  // Requirement 2.C uses (Fraction)M for start, but example output uses M(Fraction).
  // I will use M(Fraction) as it's more common in lead sheets.
  return `${m}${frac}`;
}

export async function parseMidiToText(buffer: ArrayBuffer): Promise<string> {
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq;

  // Header Metadata
  const initialBpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
  const keySig = midi.header.keySignatures.length > 0 
    ? `${midi.header.keySignatures[0].key} ${midi.header.keySignatures[0].scale.charAt(0).toUpperCase() + midi.header.keySignatures[0].scale.slice(1)}`
    : "C Major";
  
  let output = `${initialBpm} BPM - ${keySig}\n`;

  // Time Signature
  let timeSignature = { numerator: 4, denominator: 4 };
  if (midi.header.timeSignatures.length > 0) {
    timeSignature = {
      numerator: midi.header.timeSignatures[0].timeSignature[0],
      denominator: midi.header.timeSignatures[0].timeSignature[1]
    };
  }
  const ticksPerMeasure = (ppq * 4 * timeSignature.numerator) / timeSignature.denominator;

  // Collect and process all notes
  const allNotes: ParsedNote[] = [];
  midi.tracks.forEach(track => {
    track.notes.forEach(note => {
      const endTick = note.ticks + note.durationTicks;
      allNotes.push({
        name: note.name,
        duration: getDurationFraction(note.durationTicks, ppq),
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        endTick: endTick,
        startMeasure: Math.floor(note.ticks / ticksPerMeasure) + 1,
        startOffset: note.ticks % ticksPerMeasure,
        endMeasure: Math.floor(endTick / ticksPerMeasure) + 1,
        endOffset: endTick % ticksPerMeasure
      });
    });
  });

  if (allNotes.length === 0) {
    return output + "No notes found in MIDI file.";
  }

  // Sort by start tick
  allNotes.sort((a, b) => a.ticks - b.ticks);

  const maxTick = Math.max(...allNotes.map(n => n.endTick));
  const totalMeasures = Math.ceil(maxTick / ticksPerMeasure);

  // Group notes by start measure
  const notesByStartMeasure: Map<number, ParsedNote[]> = new Map();
  for (let i = 1; i <= totalMeasures; i++) {
    notesByStartMeasure.set(i, []);
  }
  allNotes.forEach(n => {
    const list = notesByStartMeasure.get(n.startMeasure);
    if (list) list.push(n);
  });

  for (let i = 1; i <= totalMeasures; i++) {
    const measureNotes = notesByStartMeasure.get(i) || [];
    
    // Group notes by their full range and start tick for chord detection
    // We want to group notes that have the SAME range (startTick and endTick)
    const groups: Map<string, ParsedNote[]> = new Map();
    measureNotes.forEach(n => {
      const key = `${n.ticks}-${n.endTick}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    });

    // Sort groups by start tick
    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
      const startA = parseInt(a.split('-')[0]);
      const startB = parseInt(b.split('-')[0]);
      return startA - startB;
    });

    if (sortedGroupKeys.length === 0) {
      output += `Measure ${i}: \n`;
      continue;
    }

    const measureLines: string[] = [];
    sortedGroupKeys.forEach(key => {
      const notes = groups.get(key)!;
      const first = notes[0];
      const isMultiMeasure = first.endMeasure > first.startMeasure || (first.endMeasure === first.startMeasure && first.endOffset === 0 && first.ticks > 0);
      // Wait, if it ends at the beginning of next measure, it's multi-measure if it crosses the boundary.
      // Actually, if floor(start/TPM) < floor(end/TPM), it crosses a boundary.
      const crossesBoundary = Math.floor(first.ticks / ticksPerMeasure) < Math.floor((first.endTick - 1) / ticksPerMeasure);
      
      let rangeStr = "";
      if (crossesBoundary) {
        const startPos = formatPosition(first.startMeasure, first.startOffset, ticksPerMeasure, false);
        const endPos = formatPosition(first.endMeasure, first.endOffset, ticksPerMeasure, true);
        rangeStr = `Measure ${startPos}-${endPos}: `;
      } else {
        rangeStr = `Measure ${i}: `;
      }

      const noteNames = notes.length > 1 ? `[${notes.map(n => n.name).join("/")}]` : notes[0].name;
      const durationStr = notes[0].duration;
      
      measureLines.push(`${rangeStr}${noteNames} ${durationStr}`);
    });

    // Combine lines. If they all have the same range (e.g. Measure 1), we can combine them.
    // But multi-measure notes should probably be on their own lines as per example.
    measureLines.forEach(line => {
      output += line + "\n";
    });
  }

  return output.trim();
}
