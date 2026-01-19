import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getJobById } from '~/services/video-job.server';
import { getTemplate } from '~/config/templates';

export async function loader({ params, request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const job = await getJobById(params.id!);
  if (!job) {
    throw new Response('Not found', { status: 404 });
  }

  return json({ video: job });
}

export default function VideoDetail() {
  const { video } = useLoaderData<typeof loader>();
  const embedFetcher = useFetcher();

  const template = getTemplate(video.templateId);

  const handleEmbed = () => {
    const formData = new FormData();
    formData.append('jobId', video.id);
    embedFetcher.submit(formData, { method: 'POST', action: '/api/embed' });
  };

  const handleDownload = () => {
    if (video.videoUrl) {
      window.open(video.videoUrl, '_blank');
    }
  };

  return (
    <Page
      title={template?.name || 'Video'}
      backAction={{ content: 'My Videos', url: '/app/videos' }}
    >
      <Layout>
        {embedFetcher.data?.success && (
          <Layout.Section>
            <Banner tone="success">
              Video added to product page successfully!
            </Banner>
          </Layout.Section>
        )}

        {embedFetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical">{embedFetcher.data.error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingLg">
                    {template?.name}
                  </Text>
                  <Badge
                    tone={
                      video.status === 'done'
                        ? 'success'
                        : video.status === 'failed'
                        ? 'critical'
                        : 'info'
                    }
                  >
                    {video.status}
                  </Badge>
                </BlockStack>
              </InlineStack>

              {video.status === 'done' && video.videoUrl && (
                <>
                  <video
                    src={video.videoUrl}
                    controls
                    style={{ width: '100%', maxWidth: 600 }}
                  />
                  <InlineStack gap="300">
                    <Button onClick={handleDownload}>Download</Button>
                    <Button
                      variant="primary"
                      onClick={handleEmbed}
                      loading={embedFetcher.state === 'submitting'}
                    >
                      Add to Product Page
                    </Button>
                  </InlineStack>
                </>
              )}

              {video.status === 'processing' && (
                <Text as="p" tone="subdued">
                  Your video is being generated. This may take a few minutes.
                </Text>
              )}

              {video.status === 'queued' && (
                <Text as="p" tone="subdued">
                  Your video is in the queue and will start processing soon.
                </Text>
              )}

              {video.status === 'failed' && (
                <Banner tone="critical">
                  Video generation failed: {video.errorMessage || 'Unknown error'}
                </Banner>
              )}

              <BlockStack gap="200">
                <Text as="p" tone="subdued">
                  Created: {new Date(video.createdAt).toLocaleString()}
                </Text>
                <Text as="p" tone="subdued">
                  Images used: {video.sourceImageUrls.length}
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
