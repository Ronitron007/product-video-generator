import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
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

// Auth client for REST API calls
const auth = new GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
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

    // Store operation name as our operation ID
    const operationId = (operation as any).name || JSON.stringify(operation);
    logger.info('Veo API operation started', { operationId: operationId.substring(0, 100) });

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
  logger.debug('Polling video status', { operationId: operationId.substring(0, 100) });

  try {
    // Use REST API directly to avoid SDK serialization issues
    // operationId format: projects/PROJECT/locations/LOCATION/publishers/google/models/MODEL/operations/OP_ID
    const url = `https://${process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'}-aiplatform.googleapis.com/v1/${operationId}`;

    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Poll API error', { status: response.status, error: errorText });
      throw new Error(`Poll failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    logger.debug('Poll result', {
      done: result.done,
      hasError: !!result.error,
      hasResponse: !!result.response,
    });

    if (result.done) {
      // Check for video in response (format varies between API versions)
      const videos = result.response?.generatedVideos || result.response?.videos;
      const videoUri = videos?.[0]?.video?.uri || videos?.[0]?.gcsUri;

      if (videoUri) {
        const videoUrl = await getSignedUrl(videoUri);
        logger.info('Video generation complete', { gcsUri: videoUri });
        return { done: true, videoUrl };
      }

      if (result.error) {
        const errorMsg = result.error.message || JSON.stringify(result.error);
        logger.error('Video operation error', { error: errorMsg });
        return { done: true, error: errorMsg };
      }

      return { done: true, error: 'No video URL in response' };
    }

    return { done: false };
  } catch (error) {
    logger.error('Poll error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
