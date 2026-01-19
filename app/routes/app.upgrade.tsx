import { json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  List,
  Badge,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getShopByDomain } from '~/services/shop.server';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 19,
    videos: 20,
    features: ['20 videos/month', 'All templates', 'Download videos', 'One-click embed'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    videos: 100,
    features: ['100 videos/month', 'All templates', 'Download videos', 'One-click embed', 'Priority processing'],
    recommended: true,
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getShopByDomain(session.shop);

  return json({
    currentPlan: shop?.plan || 'trial',
    plans: PLANS,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();
  const planId = formData.get('planId') as string;
  const plan = PLANS.find((p) => p.id === planId);

  if (!plan) {
    return json({ error: 'Invalid plan' }, { status: 400 });
  }

  // Create Shopify billing charge
  const response = await admin.graphql(`
    mutation CreateSubscription($name: String!, $price: Decimal!, $returnUrl: URL!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $price, currencyCode: USD }
              }
            }
          }
        ]
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      name: `Product Video Generator - ${plan.name}`,
      price: plan.price.toFixed(2),
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback?plan=${planId}`,
    },
  });

  const data = await response.json();

  if (data.data.appSubscriptionCreate.userErrors?.length > 0) {
    return json(
      { error: data.data.appSubscriptionCreate.userErrors[0].message },
      { status: 400 }
    );
  }

  return redirect(data.data.appSubscriptionCreate.confirmationUrl);
}

export default function Upgrade() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Page title="Upgrade Plan" backAction={{ content: 'Dashboard', url: '/app' }}>
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" align="center">
            {plans.map((plan) => (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingLg">
                      {plan.name}
                    </Text>
                    {plan.recommended && <Badge tone="success">Recommended</Badge>}
                  </InlineStack>

                  <Text as="p" variant="heading2xl">
                    ${plan.price}
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </Text>

                  <List>
                    {plan.features.map((feature) => (
                      <List.Item key={feature}>{feature}</List.Item>
                    ))}
                  </List>

                  <fetcher.Form method="POST">
                    <input type="hidden" name="planId" value={plan.id} />
                    <Button
                      variant="primary"
                      submit
                      disabled={currentPlan === plan.id}
                      loading={fetcher.state === 'submitting'}
                      fullWidth
                    >
                      {currentPlan === plan.id ? 'Current Plan' : `Upgrade to ${plan.name}`}
                    </Button>
                  </fetcher.Form>
                </BlockStack>
              </Card>
            ))}
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
