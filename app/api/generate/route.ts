import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60; // Vercel ko 60 sec tak allow karne ke liye

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
        { error: 'Invalid YouTube URL.' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2500, // Fast response ke liye limit
      },
    });

    const prompt = `Listen to the audio of this YouTube video and quickly generate output in ${language || 'English'} using this exact format:

## Quick Summary
(2-3 crisp lines)

## Key Notes
(Clear bullet points of main concepts)

===TRANSCRIPT===
(Clean, readable spoken transcript of the video)`;

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
    const transcript = parts[1]?.trim() || 'Transcript included above.';

    return NextResponse.json({ notes, transcript });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Video process nahi ho paya. Chhota public video try karein.' },
      { status: 500 }
    );
  }
}