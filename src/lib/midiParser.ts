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
  channel: number;
}

const GENERAL_MIDI_INSTRUMENTS: { [key: number]: string } = {
  0: "Acoustic Grand Piano", 1: "Bright Acoustic Piano", 2: "Electric Grand Piano", 3: "Honky-tonk Piano",
  4: "Electric Piano 1", 5: "Electric Piano 2", 6: "Harpsichord", 7: "Clavi",
  8: "Celesta", 9: "Glockenspiel", 10: "Music Box", 11: "Vibraphone",
  12: "Marimba", 13: "Xylophone", 14: "Tubular Bells", 15: "Dulcimer",
  16: "Drawbar Organ", 17: "Percussive Organ", 18: "Rock Organ", 19: "Church Organ",
  20: "Reed Organ", 21: "Accordion", 22: "Harmonica", 23: "Tango Accordion",
  24: "Acoustic Guitar (nylon)", 25: "Acoustic Guitar (steel)", 26: "Electric Guitar (jazz)", 27: "Electric Guitar (clean)",
  28: "Electric Guitar (muted)", 29: "Overdriven Guitar", 30: "Distortion Guitar", 31: "Guitar harmonics",
  32: "Acoustic Bass", 33: "Electric Bass (finger)", 34: "Electric Bass (pick)", 35: "Fretless Bass",
  36: "Slap Bass 1", 37: "Slap Bass 2", 38: "Synth Bass 1", 39: "Synth Bass 2",
  40: "Violin", 41: "Viola", 42: "Cello", 43: "Contrabass",
  44: "Tremolo Strings", 45: "Pizzicato Strings", 46: "Orchestral Harp", 47: "Timpani",
  48: "String Ensemble 1", 49: "String Ensemble 2", 50: "SynthStrings 1", 51: "SynthStrings 2",
  52: "Choir Aahs", 53: "Voice Oohs", 54: "Synth Voice", 55: "Orchestra Hit",
  56: "Trumpet", 57: "Trombone", 58: "Tuba", 59: "Muted Trumpet",
  60: "French Horn", 61: "Brass Section", 62: "SynthBrass 1", 63: "SynthBrass 2",
  64: "Soprano Sax", 65: "Alto Sax", 66: "Tenor Sax", 67: "Baritone Sax",
  68: "Oboe", 69: "English Horn", 70: "Bassoon", 71: "Clarinet",
  72: "Piccolo", 73: "Flute", 74: "Recorder", 75: "Pan Flute",
  76: "Blown Bottle", 77: "Shakuhachi", 78: "Whistle", 79: "Ocarina",
  80: "Lead 1 (square)", 81: "Lead 2 (sawtooth)", 82: "Lead 3 (calliope)", 83: "Lead 4 (chiff)",
  84: "Lead 5 (charang)", 85: "Lead 6 (voice)", 86: "Lead 7 (fifths)", 87: "Lead 8 (bass + lead)",
  88: "Pad 1 (new age)", 89: "Pad 2 (warm)", 90: "Pad 3 (polysynth)", 91: "Pad 4 (choir)",
  92: "Pad 5 (bowed)", 93: "Pad 6 (metallic)", 94: "Pad 7 (halo)", 95: "Pad 8 (sweep)",
  96: "FX 1 (rain)", 97: "FX 2 (soundtrack)", 98: "FX 3 (crystal)", 99: "FX 4 (atmosphere)",
  100: "FX 5 (brightness)", 101: "FX 6 (goblins)", 102: "FX 7 (echoes)", 103: "FX 8 (sci-fi)",
  104: "Sitar", 105: "Banjo", 106: "Shamisen", 107: "Koto",
  108: "Kalimba", 109: "Bag pipe", 110: "Fiddle", 111: "Shanai",
  112: "Tinkle Bell", 113: "Agogo", 114: "Steel Drums", 115: "Woodblock",
  116: "Taiko Drum", 117: "Melodic Tom", 118: "Synth Drum", 119: "Reverse Cymbal",
  120: "Guitar Fret Noise", 121: "Breath Noise", 122: "Seashore", 123: "Bird Tweet",
  124: "Telephone Ring", 125: "Helicopter", 126: "Applause", 127: "Gunshot"
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getRhythmicFraction(ticks: number, ticksPerMeasure: number): string {
  if (ticks === 0) return "";
  const ratio = ticks / ticksPerMeasure;
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

  // Group notes by channel and detect instrument
  const channelNotes: Map<number, ParsedNote[]> = new Map();
  const channelInstruments: Map<number, string> = new Map();

  midi.tracks.forEach(track => {
    const channel = track.channel;
    if (!channelNotes.has(channel)) {
      channelNotes.set(channel, []);
      const instNum = track.instrument.number;
      const instName = GENERAL_MIDI_INSTRUMENTS[instNum] || track.instrument.name || "Unknown Instrument";
      channelInstruments.set(channel, instName);
    }

    track.notes.forEach(note => {
      const endTick = note.ticks + note.durationTicks;
      channelNotes.get(channel)!.push({
        name: note.name,
        duration: getDurationFraction(note.durationTicks, ppq),
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        endTick: endTick,
        startMeasure: Math.floor(note.ticks / ticksPerMeasure) + 1,
        startOffset: note.ticks % ticksPerMeasure,
        endMeasure: Math.floor(endTick / ticksPerMeasure) + 1,
        endOffset: endTick % ticksPerMeasure,
        channel: channel
      });
    });
  });

  if (channelNotes.size === 0) {
    return output + "No notes found in MIDI file.";
  }

  const sortedChannels = Array.from(channelNotes.keys()).sort((a, b) => a - b);
  const maxTick = Math.max(...Array.from(channelNotes.values()).flat().map(n => n.endTick));
  const totalMeasures = Math.ceil(maxTick / ticksPerMeasure);

  sortedChannels.forEach(channel => {
    const notes = channelNotes.get(channel)!;
    const instrument = channelInstruments.get(channel)!;
    output += `\nChannel ${channel + 1} - ${instrument}\n`;

    // Sort notes by start tick
    notes.sort((a, b) => a.ticks - b.ticks);

    // Group notes by start measure for this channel
    const notesByStartMeasure: Map<number, ParsedNote[]> = new Map();
    for (let i = 1; i <= totalMeasures; i++) {
      notesByStartMeasure.set(i, []);
    }
    notes.forEach(n => {
      const list = notesByStartMeasure.get(n.startMeasure);
      if (list) list.push(n);
    });

    for (let i = 1; i <= totalMeasures; i++) {
      const measureNotes = notesByStartMeasure.get(i) || [];
      
      // Group notes by their full range for chord detection
      const groups: Map<string, ParsedNote[]> = new Map();
      measureNotes.forEach(n => {
        const key = `${n.ticks}-${n.endTick}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(n);
      });

      const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
        const startA = parseInt(a.split('-')[0]);
        const startB = parseInt(b.split('-')[0]);
        return startA - startB;
      });

      if (sortedGroupKeys.length === 0) {
        output += `Measure ${i}: \n`;
        continue;
      }

      sortedGroupKeys.forEach(key => {
        const groupNotes = groups.get(key)!;
        const first = groupNotes[0];
        const crossesBoundary = Math.floor(first.ticks / ticksPerMeasure) < Math.floor((first.endTick - 1) / ticksPerMeasure);
        
        let rangeStr = "";
        if (crossesBoundary) {
          const startPos = formatPosition(first.startMeasure, first.startOffset, ticksPerMeasure, false);
          const endPos = formatPosition(first.endMeasure, first.endOffset, ticksPerMeasure, true);
          rangeStr = `Measure ${startPos}-${endPos}: `;
        } else {
          rangeStr = `Measure ${i}: `;
        }

        const noteNames = groupNotes.length > 1 ? `[${groupNotes.map(n => n.name).join("/")}]` : groupNotes[0].name;
        const durationStr = groupNotes[0].duration;
        
        output += `${rangeStr}${noteNames} ${durationStr}\n`;
      });
    }
  });

  return output.trim();
}
