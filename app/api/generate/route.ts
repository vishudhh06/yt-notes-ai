import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function cleanArticleMarkdown(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((javascript:[^)]+\vert{}#)\)/gi, '$1')
    .replace(/!\[[^\]]*\]\(data:image[^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function generateSummaryWithFallback(
  text: string,
  language: string,
  format: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing in environment variables.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

  const langInstruction =
    language === 'hindi'
      ? 'Write the entire summary in natural, clear Hindi (Devanagari script).'
      : language === 'hinglish'
      ? 'Write the entire summary in natural conversational Hinglish (Hindi words in English/Roman alphabet).'
      : 'Write the entire summary in clear, crisp English.';

  const formatInstruction =
    format === 'short'
      ? 'Keep it ultra-concise: 1-line TL;DR + 5 sharp bullet points.'
      : 'Provide a well-structured breakdown with: ## TL;DR (2 lines), ## Key Takeaways (5-8 detailed bullet points with bold lead-ins), and ## Actionable Conclusion.';

  const safeText = text.slice(0, 28000);
  const prompt = `You are an expert research assistant. Summarize the following content accurately.\n${langInstruction}\n${formatInstruction}\nDo not add meta-intro like "Here is the summary". Start directly with the summary.\n\nCONTENT:\n${safeText}`;

  let lastError: unknown = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const output = result.response.text();
      if (output && output.trim()) return output.trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('AI summary generation failed.');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      url,
      mode = 'extract',
      text = '',
      language = 'english',
      format = 'detailed',
    } = body;

    // 1. On-demand AI Summary Mode
    if (mode === 'summary') {
      if (!text || text.trim().length < 30) {
        return NextResponse.json(
          { error: 'Not enough content available to summarize.' },
          { status: 400 }
        );
      }
      const summary = await generateSummaryWithFallback(text, language, format);
      return NextResponse.json({ summary });
    }

    // 2. Content Extraction Mode (YouTube or Article)
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }

    const cleanUrl = url.trim();
    const videoId = extractYouTubeId(cleanUrl);

    // A. YouTube Transcript Flow
    if (videoId) {
      const supadataKey = process.env.SUPADATA_API_KEY;
      if (!supadataKey) {
        return NextResponse.json(
          { error: 'SUPADATA_API_KEY is not configured.' },
          { status: 500 }
        );
      }

      const ytRes = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=false`,
        {
          headers: { 'x-api-key': supadataKey },
          cache: 'no-store',
        }
      );

      if (!ytRes.ok) {
        return NextResponse.json(
          { error: 'Transcript unavailable for this video (captions may be disabled).' },
          { status: 400 }
        );
      }

      const ytData = await ytRes.json();
      const rawSegments = Array.isArray(ytData.content) ? ytData.content : [];

      if (rawSegments.length === 0) {
        return NextResponse.json(
          { error: 'No spoken captions found in this video.' },
          { status: 404 }
        );
      }

      const segments = rawSegments.map((item: { text?: string; offset?: number }) => ({
        text: (item.text || '').trim(),
        offset: Math.floor((item.offset || 0) / 1000),
      }));

      const plainText = segments.map((s: { text: string }) => s.text).join(' ');

      let title = `YouTube Video (${videoId})`;
      try {
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembed.ok) {
          const meta = await oembed.json();
          if (meta.title) title = meta.title;
        }
      } catch {
        // Fallback to default title
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

    // B. Web Article Flow (Jina Reader + HTML Fallback)
    const targetUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
    let articleMarkdown = '';
    let articleTitle = new URL(targetUrl).hostname.replace('www.', '');

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
      // Proceed to direct HTML fallback
    }

    if (!articleMarkdown || articleMarkdown.length < 100) {
      const directRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
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