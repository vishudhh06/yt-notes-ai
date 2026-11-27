import { NextRequest, NextResponse } from 'next/server';

interface TranscriptSegment {
  text: string;
  offset: number;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n/g, ' ')
    .trim();
}

async function fetchDirectYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
    },
    cache: 'no-store',
  });

  if (!watchRes.ok) return [];
  const html = await watchRes.text();

  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match || !match[1]) return [];

  const tracks = JSON.parse(match[1]) as Array<{ baseUrl: string; languageCode?: string }>;
  if (!tracks.length) return [];

  const preferredTrack =
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => t.languageCode === 'hi') ||
    tracks[0];

  if (!preferredTrack?.baseUrl) return [];

  const xmlRes = await fetch(preferredTrack.baseUrl, { cache: 'no-store' });
  if (!xmlRes.ok) return [];
  const xml = await xmlRes.text();

  const segments: TranscriptSegment[] = [];
  const regex = /<text start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(xml)) !== null) {
    const startSec = Math.floor(parseFloat(m[1] || '0'));
    const cleanText = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ''));
    if (cleanText) {
      segments.push({ text: cleanText, offset: startSec });
    }
  }

  return segments;
}

function cleanArticleMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((javascript:[^)]+\vert{}#)\)/gi, '$1')
    .replace(/!\[[^\]]*\]\(data:image[^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function generateSummaryDirect(
  text: string,
  language: string,
  format: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment variables.');
  }

  const langInstruction =
    language === 'hindi'
      ? 'Write the entire summary in natural, clear Hindi (Devanagari script).'
      : language === 'hinglish'
      ? 'Write the entire summary in natural conversational Hinglish (Hindi words written in English alphabet).'
      : 'Write the entire summary in clear, crisp English.';

  const formatInstruction =
    format === 'short'
      ? 'Keep it ultra-concise: 1-line TL;DR + 5 sharp bullet points.'
      : 'Provide a structured breakdown with: ## TL;DR (2 lines), ## Key Takeaways (5-8 detailed bullet points with bold lead-ins), and ## Conclusion.';

  const safeText = text.slice(0, 28000);
  const prompt = `You are an expert research assistant. Summarize the following content accurately.\n${langInstruction}\n${formatInstruction}\nStart directly with the summary without any intro.\n\nCONTENT:\n${safeText}`;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr = 'AI summary generation failed.';

  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastErr = errData?.error?.message || `Gemini error (${res.status})`;
        continue;
      }

      const data = await res.json();
      const output: string =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (output.trim()) {
        return output.trim();
      }
    } catch (e: unknown) {
      if (e instanceof Error) lastErr = e.message;
    }
  }

  throw new Error(lastErr);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = typeof body?.url === 'string' ? body.url : '';
    const mode = typeof body?.mode === 'string' ? body.mode : 'extract';
    const text = typeof body?.text === 'string' ? body.text : '';
    const language = typeof body?.language === 'string' ? body.language : 'english';
    const format = typeof body?.format === 'string' ? body.format : 'detailed';

    // Mode 1: AI Summary
    if (mode === 'summary') {
      if (text.trim().length < 25) {
        return NextResponse.json(
          { error: 'Not enough content available to summarize.' },
          { status: 400 }
        );
      }
      const summary = await generateSummaryDirect(text, language, format);
      return NextResponse.json({ summary });
    }

    // Mode 2: Content Extraction
    if (!url.trim()) {
      return NextResponse.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }

    const cleanUrl = url.trim();
    const videoId = extractYouTubeId(cleanUrl);

    // A. YouTube Transcript Flow
    if (videoId) {
      let segments: TranscriptSegment[] = [];

      const supadataKey = process.env.SUPADATA_API_KEY;
      if (supadataKey) {
        try {
          const ytRes = await fetch(
            `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=false`,
            {
              headers: { 'x-api-key': supadataKey },
              cache: 'no-store',
            }
          );

          if (ytRes.ok) {
            const ytData = await ytRes.json();
            const rawSegments = Array.isArray(ytData.content) ? ytData.content : [];
            segments = rawSegments
              .map((item: { text?: string; offset?: number }) => ({
                text: (item.text || '').trim(),
                offset: Math.floor((item.offset || 0) / 1000),
              }))
              .filter((s: TranscriptSegment) => s.text.length > 0);
          }
        } catch {
          // Fallback below
        }
      }

      if (segments.length === 0) {
        try {
          segments = await fetchDirectYouTubeTranscript(videoId);
        } catch {
          // Handled below
        }
      }

      if (segments.length === 0) {
        return NextResponse.json(
          {
            error:
              'Transcript unavailable for this video. Captions may be disabled by the creator.',
          },
          { status: 404 }
        );
      }

      const plainText = segments.map((s) => s.text).join(' ');

      let title = `YouTube Video (${videoId})`;
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembed.ok) {
          const meta = await oembed.json();
          if (meta?.title) title = meta.title;
        }
      } catch {
        // Default title
      }

      return NextResponse.json({
        type: 'youtube',
        videoId,
        title,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        segments,
        content: plainText,
      });
    }

    // B. Web Article Flow
    let targetUrl = cleanUrl;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format.' }, { status: 400 });
    }

    let articleMarkdown = '';
    let articleTitle = parsedUrl.hostname.replace('www.', '');

    try {
      const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
        headers: {
          Accept: 'text/plain',
          'X-Remove-Selector': 'nav, footer, header, aside, .ads, .sidebar, .comments',
        },
        cache: 'no-store',
      });

      if (jinaRes.ok) {
        const rawMd = await jinaRes.text();
        const titleMatch = rawMd.match(/^Title:\s*(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          articleTitle = titleMatch[1].trim();
        }
        const cleaned = rawMd
          .replace(/^Title:.*$/m, '')
          .replace(/^URL Source:.*$/m, '')
          .replace(/^Markdown Content:\s*/m, '');
        articleMarkdown = cleanArticleMarkdown(cleaned);
      }
    } catch {
      // Direct HTML fallback
    }

    if (!articleMarkdown || articleMarkdown.length < 100) {
      const directRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        },
      });
      if (!directRes.ok) {
        return NextResponse.json(
          { error: 'Unable to fetch this webpage. The site may block automated readers.' },
          { status: 400 }
        );
      }
      const html = await directRes.text();
      const h1Match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (h1Match && h1Match[1]) articleTitle = h1Match[1].trim();

      articleMarkdown = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return NextResponse.json({
      type: 'article',
      title: articleTitle,
      sourceUrl: targetUrl,
      content: articleMarkdown,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}