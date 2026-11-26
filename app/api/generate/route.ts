import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const match = input.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

async function generateNotesWithFallback(prompt: string) {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.4 },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (text) return text;
    } catch (err: any) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastError || new Error('AI servers abhi busy hain, 10 second baad dobara try karein.');
}

// Clean Web Article Extractor (smry.ai style via Jina Reader + Direct HTML fallback)
async function fetchWebArticle(targetUrl: string) {
  let formattedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  // Primary: Fast clean markdown reader extraction
  try {
    const readerRes = await fetch(`https://r.jina.ai/${formattedUrl}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
      },
    });
    if (readerRes.ok) {
      const rawText = await readerRes.text();
      if (rawText && rawText.length > 200) {
        const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : new URL(formattedUrl).hostname;
        const cleanBody = rawText
          .replace(/^Title:.*$/m, '')
          .replace(/^URL Source:.*$/m, '')
          .replace(/^Markdown Content:.*$/m, '')
          .trim();

        const wordCount = cleanBody.split(/\s+/).length;
        return {
          type: 'article' as const,
          url: formattedUrl,
          title,
          wordCount,
          readTime: Math.max(1, Math.ceil(wordCount / 200)),
          content: cleanBody,
        };
      }
    }
  } catch {
    // Fallback to direct HTML fetch
  }

  // Fallback: Direct HTML text extraction
  const res = await fetch(formattedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error('Is webpage ko read nahi kiya ja saka. Link check karein.');
  }

  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : formattedUrl;

  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|br)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (textOnly.length < 100) {
    throw new Error('Is page par readable article content nahi mila.');
  }

  const wordCount = textOnly.split(/\s+/).length;
  return {
    type: 'article' as const,
    url: formattedUrl,
    title,
    wordCount,
    readTime: Math.max(1, Math.ceil(wordCount / 200)),
    content: textOnly,
  };
}

export async function POST(req: Request) {
  try {
    const { url, action, language, transcriptText } = await req.json();

    // Generate AI Summary (Works for both YouTube & Articles)
    if (action === 'summarize') {
      if (!transcriptText) {
        return NextResponse.json({ error: 'Content empty hai.' }, { status: 400 });
      }
      const prompt = `You are an expert study and reading assistant. Create a crystal-clear, structured summary in ${language || 'English'} from the content below.

Format clearly with:
- **TL;DR (Quick Summary)** (3-4 crisp lines)
- **Key Points & Takeaways** (Clear bullet points)
- **Important Conclusion**

Content:
${transcriptText.slice(0, 40000)}`;

      const notes = await generateNotesWithFallback(prompt);
      return NextResponse.json({ notes });
    }

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'Koi valid YouTube ya Article URL paste karein.' }, { status: 400 });
    }

    const videoId = extractVideoId(url);

    // Branch 1: YouTube Video URL
    if (videoId) {
      if (!process.env.SUPADATA_API_KEY) {
        return NextResponse.json(
          { error: 'Vercel Environment Variables mein SUPADATA_API_KEY add karein.' },
          { status: 500 }
        );
      }

      const ytUrl = encodeURIComponent(`https://youtu.be/${videoId}`);
      const apiRes = await fetch(
        `https://api.supadata.ai/v1/transcript?url=${ytUrl}&text=false`,
        {
          headers: { 'x-api-key': process.env.SUPADATA_API_KEY },
        }
      );

      const data = await apiRes.json();
      if (!apiRes.ok || !data?.content) {
        return NextResponse.json(
          { error: data?.message || 'Is YouTube video ka transcript available nahi hai.' },
          { status: 404 }
        );
      }

      const segments = Array.isArray(data.content)
        ? data.content.map((item: any) => ({
            offset: Math.floor((item.offset || 0) / 1000),
            text: (item.text || '').replace(/\n/g, ' ').trim(),
          }))
        : [{ offset: 0, text: String(data.content).trim() }];

      return NextResponse.json({ type: 'youtube', videoId, segments });
    }

    // Branch 2: Any Web Article / Blog / News URL (smry.ai mode)
    const articleData = await fetchWebArticle(url);
    return NextResponse.json(articleData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Content fetch failed. Please check the link and retry.' },
      { status: 500 }
    );
  }
}