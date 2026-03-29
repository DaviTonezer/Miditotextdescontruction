/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Midi } from "@tonejs/midi";

export interface ParsedNote {
  name: string;
  duration: string;
  time: number;
  ticks: number;
}

export interface MeasureData {
  measureNumber: number;
  notes: ParsedNote[][]; // Grouped by start time (chords)
}

/**
 * Converts a duration in ticks to a fraction of a whole note.
 * Standard whole note is 4 * ticksPerBeat.
 */
function getDurationFraction(durationTicks: number, ticksPerBeat: number): string {
  const wholeNoteTicks = ticksPerBeat * 4;
  const ratio = durationTicks / wholeNoteTicks;

  // Common fractions
  if (Math.abs(ratio - 1) < 0.01) return "1/1";
  if (Math.abs(ratio - 0.5) < 0.01) return "1/2";
  if (Math.abs(ratio - 0.25) < 0.01) return "1/4";
  if (Math.abs(ratio - 0.125) < 0.01) return "1/8";
  if (Math.abs(ratio - 0.0625) < 0.01) return "1/16";
  if (Math.abs(ratio - 0.03125) < 0.01) return "1/32";

  // Dotted notes
  if (Math.abs(ratio - 0.75) < 0.01) return "1/2.";
  if (Math.abs(ratio - 0.375) < 0.01) return "1/4.";
  if (Math.abs(ratio - 0.1875) < 0.01) return "1/8.";

  // Fallback to decimal or simplified fraction if needed, but requirements ask for e.g. 1/4
  return `~${Math.round(1 / ratio)}th`;
}

export async function parseMidiToText(buffer: ArrayBuffer): Promise<string> {
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq; // ticksPerBeat

  // Default time signature 4/4
  let timeSignature = { numerator: 4, denominator: 4 };
  if (midi.header.timeSignatures.length > 0) {
    timeSignature = {
      numerator: midi.header.timeSignatures[0].timeSignature[0],
      denominator: midi.header.timeSignatures[0].timeSignature[1]
    };
  }

  const ticksPerMeasure = (ppq * 4 * timeSignature.numerator) / timeSignature.denominator;

  // Collect all notes from all tracks
  const allNotes: ParsedNote[] = [];
  midi.tracks.forEach(track => {
    track.notes.forEach(note => {
      allNotes.push({
        name: note.name,
        duration: getDurationFraction(note.durationTicks, ppq),
        time: note.time,
        ticks: note.ticks
      });
    });
  });

  // Sort notes by start time
  allNotes.sort((a, b) => a.ticks - b.ticks);

  if (allNotes.length === 0) {
    return "No notes found in MIDI file.";
  }

  const lastTick = Math.max(...allNotes.map(n => n.ticks + (ppq * 4))); // rough estimate for end
  const totalMeasures = Math.ceil(lastTick / ticksPerMeasure);

  const measures: Map<number, Map<number, ParsedNote[]>> = new Map();

  // Initialize measures
  for (let i = 1; i <= totalMeasures; i++) {
    measures.set(i, new Map());
  }

  // Group notes into measures and then by start time (chords)
  allNotes.forEach(note => {
    const measureNum = Math.floor(note.ticks / ticksPerMeasure) + 1;
    if (!measures.has(measureNum)) {
        // If MIDI is longer than expected
        measures.set(measureNum, new Map());
    }
    const measureMap = measures.get(measureNum)!;
    if (!measureMap.has(note.ticks)) {
      measureMap.set(note.ticks, []);
    }
    measureMap.get(note.ticks)!.push(note);
  });

  let output = "";
  const sortedMeasureNums = Array.from(measures.keys()).sort((a, b) => a - b);

  // Filter out trailing empty measures if they are excessive, but keep internal ones
  let maxMeasureWithNotes = 0;
  measures.forEach((map, num) => {
      if (map.size > 0) maxMeasureWithNotes = Math.max(maxMeasureWithNotes, num);
  });

  for (let i = 1; i <= maxMeasureWithNotes; i++) {
    const measureMap = measures.get(i)!;
    output += `Measure ${i}: `;

    if (measureMap.size === 0) {
      output += "\n";
      continue;
    }

    const sortedTicks = Array.from(measureMap.keys()).sort((a, b) => a - b);
    const measureStrings: string[] = [];

    sortedTicks.forEach(tick => {
      const notesAtTime = measureMap.get(tick)!;
      if (notesAtTime.length > 1) {
        // Chord
        const chordNotes = notesAtTime.map(n => n.name).join("/");
        const duration = notesAtTime[0].duration; // Assuming same duration for chord
        measureStrings.push(`[${chordNotes}] ${duration}`);
      } else {
        // Single note
        const note = notesAtTime[0];
        measureStrings.push(`${note.name} ${note.duration}`);
      }
    });

    output += measureStrings.join(", ") + "\n";
  }

  return output.trim();
}
