import React, { useState, useRef } from 'react';
import { Upload, Music, FileText, Download, AlertCircle, Loader2 } from 'lucide-react';
import { parseMidiToText } from './lib/midiParser';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [isParsing, setIsParsing] = useState(false);
  const [outputText, setOutputText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
      setError('Please upload a valid MIDI file (.mid or .midi)');
      return;
    }

    setError(null);
    setFileName(file.name);
    setIsParsing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await parseMidiToText(arrayBuffer);
      setOutputText(result);
    } catch (err) {
      console.error(err);
      setError('Failed to parse MIDI file. It might be corrupted or in an unsupported format.');
    } finally {
      setIsParsing(false);
    }
  };

  const downloadResult = () => {
    if (!outputText) return;
    const blob = new Blob([outputText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName?.replace(/\.[^/.]+$/, "")}_parsed.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 border-b border-[#141414] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-serif italic tracking-tight mb-2">MIDI Measure Parser</h1>
            <p className="text-sm opacity-60 uppercase tracking-widest font-mono">Technical Analysis Tool v1.0</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={triggerFileInput}
              className="px-6 py-2 bg-[#141414] text-[#E4E3E0] text-sm font-mono hover:bg-opacity-90 transition-all flex items-center gap-2"
            >
              <Upload size={16} />
              UPLOAD MIDI
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".mid,.midi"
              className="hidden"
            />
          </div>
        </header>

        <main className="grid grid-cols-1 gap-8">
          {/* Upload Area / Status */}
          <AnimatePresence mode="wait">
            {!outputText && !isParsing && !error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="border-2 border-dashed border-[#141414] border-opacity-20 rounded-lg p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-opacity-40 transition-all"
                onClick={triggerFileInput}
              >
                <Music size={48} className="mb-4 opacity-20" />
                <h2 className="text-xl font-serif italic mb-2">Drop your MIDI file here</h2>
                <p className="text-sm opacity-50 font-mono">Supports .mid and .midi formats</p>
              </motion.div>
            )}

            {isParsing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center p-12"
              >
                <Loader2 size={32} className="animate-spin mb-4" />
                <p className="font-mono text-sm uppercase tracking-widest">Analyzing Harmonics & Ticks...</p>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-50 border border-red-200 p-4 rounded flex items-start gap-3 text-red-700"
              >
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm uppercase tracking-wider mb-1">Analysis Error</p>
                  <p className="text-sm">{error}</p>
                  <button 
                    onClick={() => setError(null)}
                    className="mt-2 text-xs underline uppercase font-bold"
                  >
                    Try Again
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result Area */}
          {outputText && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]"
            >
              <div className="border-b border-[#141414] p-4 flex items-center justify-between bg-[#F0F0EE]">
                <div className="flex items-center gap-2">
                  <FileText size={18} />
                  <span className="font-mono text-xs font-bold uppercase tracking-wider">{fileName}</span>
                </div>
                <button
                  onClick={downloadResult}
                  className="flex items-center gap-2 px-3 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono hover:bg-opacity-80 transition-all"
                >
                  <Download size={12} />
                  EXPORT .TXT
                </button>
              </div>
              <div className="p-6 overflow-auto max-h-[60vh]">
                <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {outputText.split('\n').map((line, i) => {
                    const isMeasureHeader = line.startsWith('Measure');
                    return (
                      <div key={i} className={`py-1 border-b border-gray-100 last:border-0 ${isMeasureHeader ? 'hover:bg-gray-50' : ''}`}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              </div>
            </motion.div>
          )}
        </main>

        {/* Footer Info */}
        <footer className="mt-12 pt-6 border-t border-[#141414] border-opacity-10 grid grid-cols-1 md:grid-cols-3 gap-8 opacity-50">
          <div>
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest mb-2">Logic</h3>
            <p className="text-xs">Calculates measures based on PPQ and time signature. Groups simultaneous notes into chord structures.</p>
          </div>
          <div>
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest mb-2">Notation</h3>
            <p className="text-xs">Converts MIDI integers to scientific pitch notation. Durations are normalized to whole-note fractions.</p>
          </div>
          <div>
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest mb-2">Environment</h3>
            <p className="text-xs">Built with TypeScript, Tone.js/Midi, and Tailwind CSS. Optimized for technical music analysis.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
