import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function extractVideoId(input: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  const match = input.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
}

// Auto-fallback across models so 503 high-demand error never breaks notes
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
      // Short pause before trying backup model
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastError || new Error('AI servers abhi busy hain, 10 second baad dobara try karein.');
}

export async function POST(req: Request) {
  try {
    const { url, action, language, transcriptText } = await req.json();

    if (action === 'summarize') {
      if (!transcriptText) {
        return NextResponse.json({ error: 'Transcript empty hai.' }, { status: 400 });
      }
      const prompt = `You are an expert study assistant. Create clean, well-structured, easy-to-read notes in ${language || 'English'} from the YouTube transcript below.

Format clearly with:
- **Quick Overview** (3-4 crisp lines)
- **Key Takeaways & Insights** (Clear bullet points)
- **Actionable Summary**

Transcript:
${transcriptText.slice(0, 35000)}`;

      const notes = await generateNotesWithFallback(prompt);
      return NextResponse.json({ notes });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL.' }, { status: 400 });
    }

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
        headers: {
          'x-api-key': process.env.SUPADATA_API_KEY,
        },
      }
    );

    const data = await apiRes.json();

    if (!apiRes.ok || !data?.content) {
      return NextResponse.json(
        { error: data?.message || 'Is video ka transcript available nahi hai.' },
        { status: 404 }
      );
    }

    const segments = Array.isArray(data.content)
      ? data.content.map((item: any) => ({
          offset: Math.floor((item.offset || 0) / 1000),
          text: (item.text || '').replace(/\n/g, ' ').trim(),
        }))
      : [{ offset: 0, text: String(data.content).trim() }];

    return NextResponse.json({ videoId, segments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Request failed. Please try again.' },
      { status: 500 }
    );
  }
}