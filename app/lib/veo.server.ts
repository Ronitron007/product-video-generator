import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '~/lib/logger.server';

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
  logger.info('generateVideo called', {
    imageCount: input.referenceImageUrls.length,
    duration: input.duration,
    aspectRatio: input.aspectRatio || '16:9',
    promptLength: input.prompt.length,
  });

  // Fetch images and convert to base64
  const imageBuffers: string[] = [];
  for (let i = 0; i < input.referenceImageUrls.length; i++) {
    const url = input.referenceImageUrls[i];
    try {
      logger.debug('Fetching image', { index: i, url: url.substring(0, 100) });
      const response = await fetch(url);
      if (!response.ok) {
        logger.error('Image fetch failed', { index: i, url: url.substring(0, 100), status: response.status, statusText: response.statusText });
        throw new Error(`Failed to fetch image ${i}: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      imageBuffers.push(Buffer.from(buffer).toString('base64'));
      logger.debug('Image fetched', { index: i, sizeBytes: buffer.byteLength });
    } catch (error) {
      logger.error('Image fetch error', { index: i, url: url.substring(0, 100), error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  // Build reference images array
  const referenceImages = imageBuffers.map((base64, i) => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64,
    },
  }));

  logger.info('Calling Veo API', { model: 'veo-3.1', imageCount: referenceImages.length });

  try {
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

    const operationId = (result as any).operationId || result.response.text();
    logger.info('Veo API response received', { operationId, hasOperationId: !!(result as any).operationId });

    return { operationId };
  } catch (error) {
    logger.error('Veo API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    throw error;
  }
}

export async function pollVideoStatus(operationId: string): Promise<{
  done: boolean;
  videoUrl?: string;
  error?: string;
}> {
  logger.debug('Polling video status', { operationId });

  const model = genAI.getGenerativeModel({ model: 'veo-3.1' });

  try {
    const result = await (model as any).getOperation(operationId);

    logger.debug('Poll result', { operationId, done: result.done, hasError: !!result.error, hasVideoUrl: !!result.response?.videoUrl });

    if (result.done) {
      return {
        done: true,
        videoUrl: result.response?.videoUrl,
      };
    }

    if (result.error) {
      logger.error('Video operation error', { operationId, error: result.error.message });
      return {
        done: true,
        error: result.error.message,
      };
    }

    return { done: false };
  } catch (error) {
    logger.error('Poll error', {
      operationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
