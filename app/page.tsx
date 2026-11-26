'use client';

import { useState } from 'react';
import { PlaySquare, Sparkles, Copy, Check, FileText, Loader2 } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [transcript, setTranscript] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'transcript'>('notes');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setNotes('');
    setTranscript('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, language }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Kuch galat ho gaya.');
      } else {
        setNotes(data.notes);
        setTranscript(data.transcript);
      }
    } catch {
      setError('Server se connect nahi ho paya. Dobara try karein.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = activeTab === 'notes' ? notes : transcript;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-red-600 p-2 rounded-lg">
              <PlaySquare className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">YT Notes AI</span>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full">
            100% Free Tool
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            YouTube Video to AI Notes & Transcript
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Kisi bhi YouTube video ka link paste karein aur seconds mein uske detailed study notes, summary aur full transcript nikalein.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleGenerate} className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="url"
              required
              placeholder="Paste YouTube Video URL here (e.g., https://www.youtube.com/watch?v=...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-slate-200 focus:outline-none focus:border-red-500"
            >
              <option value="English">English Notes</option>
              <option value="Hindi">Hindi Notes</option>
              <option value="Hinglish">Hinglish Notes</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-semibold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Notes
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="mt-4 text-red-400 text-sm bg-red-950/50 border border-red-900 p-3 rounded-lg">
              {error}
            </p>
          )}
        </form>

        {/* Results Section */}
        {(notes || transcript) && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-16">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/80">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'notes' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  AI Summary & Notes
                </button>
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                    activeTab === 'transcript' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Full Transcript
                </button>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Text'}
              </button>
            </div>

            <div className="p-6 whitespace-pre-wrap leading-relaxed text-slate-300 max-h-[600px] overflow-y-auto">
              {activeTab === 'notes' ? notes : transcript}
            </div>
          </div>
        )}

        {/* SEO Content Section for Google Ranking */}
        <section className="mt-16 border-t border-slate-800 pt-12 text-slate-400 space-y-6">
          <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-6 h-6 text-red-500" />
            How to Convert YouTube Videos into Study Notes?
          </h2>
          <p>
            YT Notes AI helps students, researchers, and content creators extract accurate transcripts and structured summaries from any YouTube video in seconds. Whether you are watching long lectures, podcasts, or tutorials, simply paste the link above to get clean notes in English, Hindi, or Hinglish.
          </p>
        </section>
      </main>
    </div>
  );
}