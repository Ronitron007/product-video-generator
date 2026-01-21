import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  ProgressBar,
  Thumbnail,
  Badge,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getOrCreateShop, PLAN_LIMITS } from '~/services/shop.server';
import { getJobsByShop } from '~/services/video-job.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Create shop if it doesn't exist
  const shop = await getOrCreateShop(session.shop, session.accessToken || '');

  const jobs = await getJobsByShop(shop.id);
  const recentVideos = jobs.slice(0, 6);

  return json({
    shop: {
      plan: shop.plan,
      videosUsed: shop.videosUsedThisMonth,
      videosLimit: PLAN_LIMITS[shop.plan as keyof typeof PLAN_LIMITS],
    },
    recentVideos,
  });
}

export default function Dashboard() {
  const { shop, recentVideos } = useLoaderData<typeof loader>();

  const usagePercent = shop ? (shop.videosUsed / shop.videosLimit) * 100 : 0;

  return (
    <Page title="Product Video Generator">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Videos this month
                  </Text>
                  <Text as="p" variant="bodyLg">
                    {shop?.videosUsed ?? 0} / {shop?.videosLimit ?? 1}
                  </Text>
                </BlockStack>
                <Button variant="primary" url="/app/create">
                  Create Video
                </Button>
              </InlineStack>
              <ProgressBar progress={usagePercent} size="small" />
              {shop?.plan === 'trial' && shop.videosUsed >= 1 && (
                <Button url="/app/upgrade">Upgrade to continue</Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Recent Videos
                </Text>
                <Link to="/app/videos">View all</Link>
              </InlineStack>

              {recentVideos.length === 0 ? (
                <Text as="p" tone="subdued">
                  No videos yet. Create your first video!
                </Text>
              ) : (
                <InlineStack gap="400" wrap>
                  {recentVideos.map((video: any) => (
                    <Link key={video.id} to={`/app/videos/${video.id}`}>
                      <Card>
                        <BlockStack gap="200">
                          <Thumbnail
                            source={video.videoUrl || '/placeholder.jpg'}
                            alt={video.templateId}
                            size="large"
                          />
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
                      </Card>
                    </Link>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
