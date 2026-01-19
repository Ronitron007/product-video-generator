import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  EmptyState,
  IndexTable,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';
import { getTemplate } from '~/config/templates';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  if (!shop) {
    return json({ videos: [] });
  }

  const jobs = await getJobsByShop(shop.id);
  return json({ videos: jobs });
}

export default function Videos() {
  const { videos } = useLoaderData<typeof loader>();

  const statusBadge = (status: string) => {
    const tones: Record<string, 'success' | 'critical' | 'info' | 'warning'> = {
      done: 'success',
      failed: 'critical',
      processing: 'info',
      queued: 'warning',
    };
    return <Badge tone={tones[status] || 'info'}>{status}</Badge>;
  };

  return (
    <Page
      title="My Videos"
      backAction={{ content: 'Dashboard', url: '/app' }}
      primaryAction={{ content: 'Create Video', url: '/app/create' }}
    >
      <Layout>
        <Layout.Section>
          {videos.length === 0 ? (
            <Card>
              <EmptyState
                heading="No videos yet"
                action={{ content: 'Create Video', url: '/app/create' }}
                image="/empty-state.svg"
              >
                <p>Generate your first product video to get started.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <IndexTable
                itemCount={videos.length}
                headings={[
                  { title: 'Template' },
                  { title: 'Status' },
                  { title: 'Created' },
                  { title: 'Actions' },
                ]}
                selectable={false}
              >
                {videos.map((video: any, index: number) => {
                  const template = getTemplate(video.templateId);
                  return (
                    <IndexTable.Row key={video.id} id={video.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="bold">
                          {template?.name || video.templateId}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{statusBadge(video.status)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {new Date(video.createdAt).toLocaleDateString()}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Link to={`/app/videos/${video.id}`}>View</Link>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
