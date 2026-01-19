import { useState, useCallback, useEffect } from 'react';
import { json, LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate } from '@remix-run/react';
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Checkbox,
  ChoiceList,
  Banner,
} from '@shopify/polaris';
import { authenticate } from '~/shopify.server';
import { getAllTemplates } from '~/config/templates';

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({ templates: getAllTemplates() });
}

type Step = 'product' | 'images' | 'template';

export default function CreateVideo() {
  const { templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('product');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Load products on mount
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(data.products);
      setLoading(false);
    }
    loadProducts();
  }, []);

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product);
    setSelectedImages([]);
    setStep('images');
  };

  const handleImageToggle = (url: string) => {
    setSelectedImages((prev) =>
      prev.includes(url)
        ? prev.filter((u) => u !== url)
        : prev.length < 3
        ? [...prev, url]
        : prev
    );
  };

  const handleGenerate = async () => {
    const formData = new FormData();
    formData.append('productId', selectedProduct.id);
    formData.append('imageUrls', JSON.stringify(selectedImages));
    formData.append('templateId', selectedTemplate);

    fetcher.submit(formData, { method: 'POST', action: '/api/generate' });
  };

  // Handle success
  useEffect(() => {
    if (fetcher.data?.success) {
      navigate('/app/videos');
    }
  }, [fetcher.data, navigate]);

  return (
    <Page
      title="Create Video"
      backAction={{ content: 'Dashboard', url: '/app' }}
    >
      <Layout>
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical">
              {fetcher.data.upgradeRequired
                ? 'You have reached your video limit. Upgrade to continue.'
                : fetcher.data.error}
            </Banner>
          </Layout.Section>
        )}

        {step === 'product' && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Step 1: Select a Product
                </Text>
                <ResourceList
                  loading={loading}
                  items={products}
                  renderItem={(product) => (
                    <ResourceItem
                      id={product.id}
                      onClick={() => handleProductSelect(product)}
                      media={
                        <Thumbnail
                          source={product.featuredImage || '/placeholder.jpg'}
                          alt={product.title}
                        />
                      }
                    >
                      <Text as="p" variant="bodyMd" fontWeight="bold">
                        {product.title}
                      </Text>
                      <Text as="p" tone="subdued">
                        {product.images.length} images
                      </Text>
                    </ResourceItem>
                  )}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {step === 'images' && selectedProduct && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Step 2: Select Images (1-3)
                  </Text>
                  <Button onClick={() => setStep('product')}>Back</Button>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Selected: {selectedImages.length}/3
                </Text>
                <InlineStack gap="400" wrap>
                  {selectedProduct.images.map((image: any) => (
                    <div
                      key={image.id}
                      onClick={() => handleImageToggle(image.url)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Card>
                        <BlockStack gap="200">
                          <Thumbnail
                            source={image.url}
                            alt={image.altText || 'Product image'}
                            size="large"
                          />
                          <Checkbox
                            label=""
                            checked={selectedImages.includes(image.url)}
                            onChange={() => handleImageToggle(image.url)}
                          />
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </InlineStack>
                <Button
                  variant="primary"
                  disabled={selectedImages.length === 0}
                  onClick={() => setStep('template')}
                >
                  Next: Choose Template
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {step === 'template' && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Step 3: Choose Template
                  </Text>
                  <Button onClick={() => setStep('images')}>Back</Button>
                </InlineStack>
                <ChoiceList
                  title=""
                  choices={templates.map((t) => ({
                    label: t.name,
                    value: t.id,
                    helpText: t.description,
                  }))}
                  selected={selectedTemplate ? [selectedTemplate] : []}
                  onChange={(value) => setSelectedTemplate(value[0])}
                />
                <Button
                  variant="primary"
                  disabled={!selectedTemplate}
                  loading={fetcher.state === 'submitting'}
                  onClick={handleGenerate}
                >
                  Generate Video
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
