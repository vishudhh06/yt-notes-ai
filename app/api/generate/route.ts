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

// Clean & organize scraped blog markdown (removes nav, comments, tracking pixels, footer noise)
function cleanArticleMarkdown(raw: string) {
  const lines = raw.split('\n');
  const cleanedLines: string[] = [];

  const noisePatterns = [
    /^Skip to content/i,
    /^Search for:/i,
    /^Open Search/i,
    /^Published Time:/i,
    /^URL Source:/i,
    /^Markdown Content:/i,
    /^Title:/i,
    /^Loading Comments/i,
    /^Write a Comment/i,
    /^Email \(Required\)/i,
    /^Blog at WordPress\.com/i,
    /^Collapse this bar/i,
    /^Report this content/i,
    /^Have a WordPress\.com account/i,
    /^Type your email/i,
    /^Subscribe$/i,
    /^Subscribed$/i,
    /^\[\s*\]\(https?:\/\/[^\)]+\)$/,
    /pixel\.wp\.com/i,
    /g\.gif\?/i,
  ];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      cleanedLines.push('');
      continue;
    }

    if (noisePatterns.some((rx) => rx.test(trimmed))) continue;

    // Remove empty anchor links [](url) inline
    line = line.replace(/\[\s*\]\(https?:\/\/[^\)]+\)/g, '');

    // Remove tiny tracking/avatar images
    if (/!\[.*?\]\(.*?(?:w=50|pixel\.|gravatar|emoji).*?\)/i.test(line)) continue;

    if (line.trim()) {
      cleanedLines.push(line);
    }
  }

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchWebArticle(targetUrl: string) {
  let formattedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try {
    const readerRes = await fetch(`https://r.jina.ai/${formattedUrl}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
        'X-Remove-Selector':
          'nav, header, footer, aside, #comments, .comments-area, .sharedaddy, .jp-relatedposts, .widget-area, #jp-post-flair, .sd-sharing-enabled',
      },
    });

    if (readerRes.ok) {
      const rawText = await readerRes.text();
      if (rawText && rawText.length > 150) {
        const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : new URL(formattedUrl).hostname;
        const cleanBody = cleanArticleMarkdown(rawText);

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
    // Fallback below
  }

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
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
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

    if (action === 'summarize') {
      if (!transcriptText) {
        return NextResponse.json({ error: 'Content empty hai.' }, { status: 400 });
      }
      const prompt = `You are an expert study and reading assistant. Create a crystal-clear, structured summary in ${language || 'English'} from the content below.

Format clearly with:
## TL;DR (Quick Summary)
(3-4 crisp lines)

## Key Points & Takeaways
- Bullet points of main ideas

## Conclusion
(Final takeaway)

Content:
${transcriptText.slice(0, 40000)}`;

      const notes = await generateNotesWithFallback(prompt);
      return NextResponse.json({ notes });
    }

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'Koi valid YouTube ya Article URL paste karein.' }, { status: 400 });
    }

    const videoId = extractVideoId(url);

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

    const articleData = await fetchWebArticle(url);
    return NextResponse.json(articleData);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Content fetch failed. Please check the link and retry.' },
      { status: 500 }
    );
  }
}