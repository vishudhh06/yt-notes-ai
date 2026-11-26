'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PlaySquare,
  Search,
  Copy,
  Check,
  Download,
  Sparkles,
  Loader2,
  Clock,
  Sun,
  Moon,
  ArrowUpRight,
  ClipboardPaste,
} from 'lucide-react';

interface Segment {
  text: string;
  offset: number;
}

function formatTime(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function TranscriptWorkspace() {
  const searchParams = useSearchParams();
  const initialParam = searchParams.get('v');
  const initializedRef = useRef(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [inputUrl, setInputUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [notes, setNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [language, setLanguage] = useState('English');
  const [viewMode, setViewMode] = useState<'transcript' | 'notes'>('transcript');

  const isDark = theme === 'dark';

  const fetchTranscript = async (target: string) => {
    const cleanTarget = target.trim();
    if (!cleanTarget) return;

    setLoading(true);
    setError('');
    setNotes('');
    setViewMode('transcript');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanTarget, action: 'transcript' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Transcript nahi mil paya.');
      } else {
        setVideoId(data.videoId);
        setSegments(data.segments);
        setStartTime(0);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/?v=${data.videoId}`);
        }
      }
    } catch {
      setError('Server connection error. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialParam && !initializedRef.current) {
      initializedRef.current = true;
      setInputUrl(`https://www.youtube.com/watch?v=${initialParam}`);
      fetchTranscript(initialParam);
    }
  }, [initialParam]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTranscript(inputUrl);
  };

  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text);
        fetchTranscript(text);
      }
    } catch {
      setError('Browser clipboard permission blocked hai — box mein Ctrl+V se paste karein.');
    }
  };

  const handleResetHome = () => {
    setVideoId('');
    setSegments([]);
    setInputUrl('');
    setError('');
    setNotes('');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
  };

  const handleGenerateNotes = async () => {
    if (notes && !notes.startsWith('Notes error:')) {
      setViewMode('notes');
      return;
    }
    setNotesLoading(true);
    setViewMode('notes');
    try {
      const fullText = segments.map((s) => s.text).join(' ');
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summarize',
          language,
          transcriptText: fullText,
        }),
      });
      const data = await res.json();
      if (res.ok) setNotes(data.notes);
      else setNotes('Notes error: ' + data.error);
    } catch {
      setNotes('Notes error: Connection failed. Please retry.');
    } finally {
      setNotesLoading(false);
    }
  };

  const filteredSegments = segments.filter((s) =>
    s.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlainText = () => {
    if (viewMode === 'notes') return notes;
    return filteredSegments
      .map((s) => (showTimestamps ? `[${formatTime(s.offset)}] ${s.text}` : s.text))
      .join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getPlainText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([getPlainText()], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${videoId || 'youtube'}-${viewMode}.txt`;
    link.click();
  };

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden flex flex-col transition-colors duration-500 ${
        isDark ? 'bg-[#090807] text-[#F5F2EB]' : 'bg-[#F7F5F0] text-[#181614]'
      }`}
    >
      <style>{`
        @keyframes driftSlow {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(45px, -35px) scale(1.08); }
          66% { transform: translate(-35px, 25px) scale(0.95); }
        }
        @keyframes driftReverse {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-50px, -30px) scale(1.1); }
        }
        .animate-drift-slow { animation: driftSlow 18s ease-in-out infinite; }
        .animate-drift-reverse { animation: driftReverse 22s ease-in-out infinite; }
      `}</style>

      {/* Moving Ambient Blurred Background */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`animate-drift-slow absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] ${
            isDark ? 'bg-amber-600/20' : 'bg-amber-400/30'
          }`}
        />
        <div
          className={`animate-drift-reverse absolute top-1/3 -right-24 w-[460px] h-[460px] rounded-full blur-[150px] ${
            isDark ? 'bg-orange-800/20' : 'bg-teal-400/25'
          }`}
        />
        <div
          className={`animate-drift-slow absolute -bottom-36 left-10 w-[440px] h-[440px] rounded-full blur-[140px] ${
            isDark ? 'bg-stone-700/25' : 'bg-amber-300/25'
          }`}
        />
      </div>

      {/* Navbar */}
      <header className="relative z-30 pt-5 px-4">
        <div
          className={`max-w-6xl mx-auto px-5 py-3 rounded-2xl backdrop-blur-xl border flex items-center justify-between ${
            isDark
              ? 'bg-white/[0.04] border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white/75 border-stone-200/80 shadow-[0_8px_32px_rgba(0,0,0,0.06)]'
          }`}
        >
          <button
            type="button"
            onClick={handleResetHome}
            className="flex items-center gap-3 cursor-pointer text-left group"
          >
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2 rounded-xl shadow-md group-hover:scale-105 transition">
              <PlaySquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg md:text-xl tracking-tight block leading-none">
                YT Transcript AI
              </span>
              <span
                className={`text-[11px] tracking-widest uppercase ${
                  isDark ? 'text-amber-400/80' : 'text-amber-700'
                }`}
              >
                Created by VisionCut Studio
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs md:text-sm font-medium border backdrop-blur-xl transition cursor-pointer ${
              isDark
                ? 'bg-white/[0.06] border-white/[0.12] text-amber-200 hover:bg-white/[0.12]'
                : 'bg-stone-900 text-amber-100 border-stone-800 hover:bg-stone-800'
            }`}
          >
            {isDark ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Bright</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-amber-300" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {!videoId || segments.length === 0 ? (
        <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-3xl text-center space-y-7">
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-medium tracking-wide border backdrop-blur-xl ${
                isDark
                  ? 'bg-amber-500/10 border-amber-400/20 text-amber-300'
                  : 'bg-amber-500/15 border-amber-600/20 text-amber-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Instant Transcripts & AI Study Notes</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.12]">
              Turn Any YouTube Video Into{' '}
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 bg-clip-text text-transparent">
                Clean Notes.
              </span>
            </h1>

            <p
              className={`text-base md:text-xl max-w-2xl mx-auto leading-relaxed ${
                isDark ? 'text-stone-400' : 'text-stone-600'
              }`}
            >
              Paste any YouTube link below to extract clickable timestamped transcripts in 1 second and generate structured AI summaries effortlessly.
            </p>

            {/* Input Form */}
            <form
              onSubmit={handleSubmit}
              className={`relative z-30 p-2.5 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row gap-2.5 ${
                isDark
                  ? 'bg-white/[0.06] border-white/[0.15] shadow-[0_20px_50px_rgba(0,0,0,0.5)]'
                  : 'bg-white/90 border-stone-300 shadow-[0_20px_50px_rgba(0,0,0,0.08)]'
              }`}
            >
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste YouTube link here (e.g., https://youtu.be/lF6MOx6BxXM)"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className={`w-full bg-transparent px-4 py-3.5 text-base md:text-lg focus:outline-none ${
                    isDark
                      ? 'text-white placeholder-stone-500'
                      : 'text-stone-900 placeholder-stone-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={handlePasteClick}
                  title="Paste from clipboard"
                  className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 border cursor-pointer transition ${
                    isDark
                      ? 'bg-white/[0.06] border-white/[0.12] text-stone-300 hover:bg-white/[0.12]'
                      : 'bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  <span>Paste</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-60 text-stone-950 font-bold text-base md:text-lg px-8 py-3.5 rounded-xl transition cursor-pointer shrink-0 flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Fetching...</span>
                  </>
                ) : (
                  <>
                    <span>Get Transcript</span>
                    <ArrowUpRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="bg-red-950/80 border border-red-500/40 text-red-200 px-5 py-3.5 rounded-2xl text-sm md:text-base text-left">
                {error}
              </div>
            )}

            {/* Glass Feature Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-left">
              <div
                className={`p-5 rounded-2xl border backdrop-blur-xl ${
                  isDark
                    ? 'bg-white/[0.03] border-white/[0.08]'
                    : 'bg-white/70 border-stone-200/80'
                }`}
              >
                <div className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-1">
                  01 • Lightning Speed
                </div>
                <p className={`text-sm md:text-base ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                  Click any timestamp to jump directly to that exact moment in the video player.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const demoUrl = 'https://www.youtube.com/watch?v=lF6MOx6BxXM';
                  setInputUrl(demoUrl);
                  fetchTranscript(demoUrl);
                }}
                className={`p-5 rounded-2xl border backdrop-blur-xl cursor-pointer transition text-left group ${
                  isDark
                    ? 'bg-white/[0.03] border-white/[0.08] hover:border-amber-400/40 hover:bg-white/[0.06]'
                    : 'bg-white/70 border-stone-200/80 hover:border-amber-500/50 hover:bg-white'
                }`}
              >
                <div className="text-amber-400 font-semibold text-sm uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>02 • Try Instant Demo</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
                </div>
                <p className={`text-sm md:text-base ${isDark ? 'text-stone-300' : 'text-stone-700'}`}>
                  Click here to test sample video <span className="underline">lF6MOx6BxXM</span> right now.
                </p>
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* Split-Screen Workspace */
        <main className="relative z-20 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
          {/* Top Search Bar */}
          <form
            onSubmit={handleSubmit}
            className={`relative z-30 flex flex-col sm:flex-row gap-2 max-w-3xl mx-auto p-2 rounded-2xl border backdrop-blur-xl ${
              isDark
                ? 'bg-white/[0.05] border-white/[0.12]'
                : 'bg-white/90 border-stone-300'
            }`}
          >
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                autoComplete="off"
                placeholder="Paste another YouTube URL..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className={`w-full bg-transparent px-4 py-2 text-base focus:outline-none ${
                  isDark ? 'text-white placeholder-stone-500' : 'text-stone-900 placeholder-stone-400'
                }`}
              />
              <button
                type="button"
                onClick={handlePasteClick}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 border cursor-pointer ${
                  isDark
                    ? 'bg-white/[0.06] border-white/[0.12] text-stone-300 hover:bg-white/[0.12]'
                    : 'bg-stone-100 border-stone-300 text-stone-700'
                }`}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-amber-500 to-orange-600 text-stone-950 font-bold text-sm md:text-base px-6 py-2.5 rounded-xl cursor-pointer shrink-0"
            >
              {loading ? 'Loading...' : 'Get Transcript'}
            </button>
          </form>

          {error && (
            <div className="max-w-3xl mx-auto bg-red-950/80 border border-red-500/40 text-red-200 px-5 py-3 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Video Player + AI Notes */}
            <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
              <div
                className={`aspect-video w-full rounded-2xl overflow-hidden border shadow-2xl ${
                  isDark ? 'border-white/[0.12] bg-black' : 'border-stone-300 bg-black'
                }`}
              >
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=${startTime > 0 ? 1 : 0}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              <div
                className={`rounded-2xl p-5 border backdrop-blur-xl space-y-4 ${
                  isDark
                    ? 'bg-white/[0.04] border-white/[0.1]'
                    : 'bg-white/85 border-stone-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    AI Study Notes
                  </span>
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      setNotes('');
                    }}
                    className={`border rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none ${
                      isDark
                        ? 'bg-stone-900 border-white/[0.15] text-stone-200'
                        : 'bg-white border-stone-300 text-stone-800'
                    }`}
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Hinglish">Hinglish</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateNotes}
                  disabled={notesLoading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-stone-950 text-base font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                >
                  {notesLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Generating Notes...</span>
                    </>
                  ) : (
                    'Generate AI Summary & Notes'
                  )}
                </button>
              </div>
            </div>

            {/* Right: Transcript / Notes */}
            <div
              className={`lg:col-span-7 rounded-2xl border backdrop-blur-xl overflow-hidden shadow-2xl ${
                isDark
                  ? 'bg-white/[0.04] border-white/[0.1]'
                  : 'bg-white/85 border-stone-200'
              }`}
            >
              <div
                className={`p-4 border-b flex flex-wrap items-center justify-between gap-2 ${
                  isDark ? 'border-white/[0.08]' : 'border-stone-200'
                }`}
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('transcript')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition ${
                      viewMode === 'transcript'
                        ? 'bg-amber-500 text-stone-950'
                        : isDark
                        ? 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
                        : 'bg-stone-200/70 text-stone-700'
                    }`}
                  >
                    Transcript ({segments.length})
                  </button>
                  {notes && (
                    <button
                      type="button"
                      onClick={() => setViewMode('notes')}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition ${
                        viewMode === 'notes'
                          ? 'bg-amber-500 text-stone-950'
                          : isDark
                          ? 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
                          : 'bg-stone-200/70 text-stone-700'
                      }`}
                    >
                      AI Notes
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {viewMode === 'transcript' && (
                    <button
                      type="button"
                      onClick={() => setShowTimestamps(!showTimestamps)}
                      className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                        isDark
                          ? 'bg-white/[0.05] border-white/[0.1] text-stone-300 hover:bg-white/[0.1]'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {showTimestamps ? 'Hide Time' : 'Show Time'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                      isDark
                        ? 'bg-white/[0.05] border-white/[0.1] text-stone-200 hover:bg-white/[0.1]'
                        : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className={`flex items-center gap-1.5 text-xs md:text-sm px-3 py-2 rounded-xl border cursor-pointer transition ${
                      isDark
                        ? 'bg-white/[0.05] border-white/[0.1] text-stone-200 hover:bg-white/[0.1]'
                        : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    .TXT
                  </button>
                </div>
              </div>

              {viewMode === 'transcript' && (
                <div
                  className={`p-3.5 border-b ${
                    isDark ? 'border-white/[0.08] bg-black/20' : 'border-stone-200 bg-stone-50/70'
                  }`}
                >
                  <div className="relative">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Search words in transcript..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full rounded-xl pl-10 pr-4 py-2 text-base border focus:outline-none ${
                        isDark
                          ? 'bg-white/[0.04] border-white/[0.1] text-white placeholder-stone-500'
                          : 'bg-white border-stone-300 text-stone-900 placeholder-stone-400'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="p-5 max-h-[650px] overflow-y-auto space-y-2.5">
                {viewMode === 'notes' ? (
                  <div
                    className={`whitespace-pre-wrap text-base md:text-lg leading-relaxed ${
                      isDark ? 'text-stone-200' : 'text-stone-800'
                    }`}
                  >
                    {notes}
                  </div>
                ) : (
                  filteredSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => setStartTime(seg.offset)}
                      className={`group flex items-start gap-3.5 p-2.5 rounded-xl cursor-pointer transition ${
                        isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-amber-500/10'
                      }`}
                    >
                      {showTimestamps && (
                        <span
                          className={`text-xs md:text-sm font-mono px-2.5 py-1 rounded-lg shrink-0 mt-0.5 transition ${
                            isDark
                              ? 'text-amber-300 bg-amber-500/15 group-hover:bg-amber-500 group-hover:text-stone-950'
                              : 'text-amber-800 bg-amber-500/20 group-hover:bg-amber-500 group-hover:text-white'
                          }`}
                        >
                          {formatTime(seg.offset)}
                        </span>
                      )}
                      <p
                        className={`text-base md:text-[17px] leading-relaxed ${
                          isDark ? 'text-stone-200' : 'text-stone-800'
                        }`}
                      >
                        {seg.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="relative z-20 py-6 text-center">
        <p className="text-xs md:text-sm tracking-wide text-stone-500">
          Created by <span className="font-semibold text-amber-500">VisionCut Studio</span> • Built for Creators & Learners
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090807] text-white p-10">Loading...</div>}>
      <TranscriptWorkspace />
    </Suspense>
  );
}