import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export interface GenerateVideoInput {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface GenerateVideoResult {
  operationId: string;
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  // Fetch images and convert to base64
  const imageBuffers = await Promise.all(
    input.referenceImageUrls.map(async (url) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    })
  );

  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  // Build reference images array
  const referenceImages = imageBuffers.map((base64, i) => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64,
    },
  }));

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          ...referenceImages,
          { text: input.prompt },
        ],
      },
    ],
    generationConfig: {
      // @ts-ignore - Veo specific config
      videoDuration: input.duration,
      aspectRatio: input.aspectRatio || '16:9',
    },
  });

  // Return operation ID for polling
  // Note: Actual API may differ - adjust based on Veo 3.1 docs
  return {
    operationId: (result as any).operationId || result.response.text(),
  };
}

export async function pollVideoStatus(operationId: string): Promise<{
  done: boolean;
  videoUrl?: string;
  error?: string;
}> {
  // Poll the operation status
  // Note: Implement based on actual Veo 3.1 API
  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  // Placeholder - actual implementation depends on Veo API
  const result = await (model as any).getOperation(operationId);

  if (result.done) {
    return {
      done: true,
      videoUrl: result.response?.videoUrl,
    };
  }

  if (result.error) {
    return {
      done: true,
      error: result.error.message,
    };
  }

  return { done: false };
}
