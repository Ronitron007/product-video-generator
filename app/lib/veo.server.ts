import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { logger } from '~/lib/logger.server';

// Parse credentials from env var (JSON string) for Vercel deployment
const credentials = process.env.GOOGLE_CREDENTIALS
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : undefined;

const client = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  googleAuthOptions: credentials ? { credentials } : undefined,
});

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials,
});

// Generate signed URL for GCS object (valid for 7 days)
async function getSignedUrl(gcsUri: string): Promise<string> {
  // Parse gs://bucket/path format
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }

  const [, bucketName, filePath] = match;
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  logger.debug('Generated signed URL', { gcsUri, expiresIn: '7 days' });
  return signedUrl;
}

export interface GenerateVideoInput {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

// The operation object returned from the SDK - we keep this in memory for polling
export type VideoOperation = Awaited<ReturnType<typeof client.models.generateVideos>>;

export interface GenerateVideoResult {
  operation: VideoOperation;
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  logger.info('generateVideo called', {
    imageCount: input.referenceImageUrls.length,
    duration: input.duration,
    aspectRatio: input.aspectRatio || '16:9',
    promptLength: input.prompt.length,
  });

  // Fetch first image and convert to base64
  const imageUrl = input.referenceImageUrls[0];
  let imageBase64: string;
  let mimeType: string;

  try {
    logger.debug('Fetching reference image', { url: imageUrl.substring(0, 100) });
    const response = await fetch(imageUrl);
    if (!response.ok) {
      logger.error('Image fetch failed', { url: imageUrl.substring(0, 100), status: response.status });
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString('base64');
    mimeType = response.headers.get('content-type') || 'image/jpeg';
    logger.debug('Image fetched', { sizeBytes: buffer.byteLength, mimeType });
  } catch (error) {
    logger.error('Image fetch error', { url: imageUrl.substring(0, 100), error: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  // Generate output GCS URI
  const outputGcsUri = `gs://${process.env.GCS_BUCKET_NAME}/videos/${Date.now()}/`;

  logger.info('Calling Veo API', {
    model: 'veo-3.1-generate-001',
    aspectRatio: input.aspectRatio || '16:9',
    outputGcsUri,
  });

  try {
    const operation = await client.models.generateVideos({
      model: 'veo-3.1-generate-001',
      prompt: input.prompt,
      image: {
        imageBytes: imageBase64,
        mimeType,
      },
      config: {
        aspectRatio: input.aspectRatio || '16:9',
        durationSeconds: input.duration,
        numberOfVideos: 1,
        personGeneration: 'allow_all',
        outputGcsUri,
      },
    });

    const operationName = (operation as any).name || 'unknown';
    logger.info('Veo API operation started', { operationName });

    // Return the full operation object to keep in memory for polling
    return { operation };
  } catch (error) {
    logger.error('Veo API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    throw error;
  }
}

export interface PollVideoResult {
  done: boolean;
  videoUrl?: string;
  error?: string;
  // Return the updated operation for the next poll cycle
  operation: VideoOperation;
}

export async function pollVideoStatus(operation: VideoOperation): Promise<PollVideoResult> {
  const operationName = (operation as any).name || 'unknown';
  logger.debug('Polling video status', { operationName });

  try {
    // Pass the operation object directly to the SDK (kept in memory)
    const result = await client.operations.getVideosOperation({ operation });

    logger.debug('Poll result', {
      done: result.done,
      hasError: !!(result as any).error,
      hasResponse: !!(result as any).response,
    });

    if (result.done) {
      const response = (result as any).response;
      if (response?.generatedVideos?.[0]?.video?.uri) {
        const gcsUri = response.generatedVideos[0].video.uri;
        // Generate signed URL for secure access
        const videoUrl = await getSignedUrl(gcsUri);
        logger.info('Video generation complete', { gcsUri });
        return { done: true, videoUrl, operation: result };
      }

      if ((result as any).error) {
        const errorMsg = (result as any).error.message || 'Unknown error';
        logger.error('Video operation error', { error: errorMsg });
        return { done: true, error: errorMsg, operation: result };
      }

      return { done: true, error: 'No video URL in response', operation: result };
    }

    // Return the updated operation object for the next poll
    return { done: false, operation: result };
  } catch (error) {
    logger.error('Poll error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
