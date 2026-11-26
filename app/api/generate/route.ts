import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function normalizeYoutubeUrl(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/watch?v=${match[2]}`;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const { url, language } = await req.json();
    const cleanUrl = normalizeYoutubeUrl(url);

    if (!cleanUrl) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL. Please enter a valid YouTube link.' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Server par GEMINI_API_KEY missing hai.' },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

    const prompt = `Analyze this YouTube video carefully and provide two clearly separated sections in ${language || 'English'}:

1. First, provide detailed, structured study notes including:
   - **Quick Summary** (3-4 lines overview)
   - **Key Takeaways & Detailed Notes** (Organized with clear headings and bullet points)
   - **Conclusion / Actionable Insights**

2. Then write exact separator: ===TRANSCRIPT===

3. After the separator, provide the full, accurate spoken transcript/summary of everything discussed in the video.`;

    const result = await model.generateContent([
      prompt,
      {
        fileData: {
          mimeType: 'video/mp4',
          fileUri: cleanUrl,
        },
      },
    ]);

    const fullResponse = result.response.text();
    const parts = fullResponse.split('===TRANSCRIPT===');
    const notes = parts[0]?.trim() || fullResponse;
    const transcript = parts[1]?.trim() || 'Transcript generated inside notes.';

    return NextResponse.json({ notes, transcript });
  } catch (error: unknown) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Video process karne mein error aaya. Doosra public video try karein.',
      },
      { status: 500 }
    );
  }
}
