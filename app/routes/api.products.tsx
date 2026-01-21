import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { logger, logRequest } from '~/lib/logger.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const reqLog = logRequest('api.products');

  try {
    const { admin, session } = await authenticate.admin(request);
    logger.info('Fetching products', { shopDomain: session.shop, route: 'api.products' });

    const response = await admin.graphql(`
      query GetProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
              featuredImage {
                url
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `, {
      variables: {
        first: 20,
        after: new URL(request.url).searchParams.get('after') || null,
      },
    });

    const data = await response.json();

    const products = data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      images: edge.node.images.edges.map((img: any) => ({
        id: img.node.id,
        url: img.node.url,
        altText: img.node.altText,
      })),
      featuredImage: edge.node.featuredImage?.url,
      cursor: edge.cursor,
    }));

    logger.info('Products fetched', { shopDomain: session.shop, productCount: products.length });
    reqLog.end('success', { productCount: products.length });

    return json({
      products,
      hasNextPage: data.data.products.pageInfo.hasNextPage,
    });
  } catch (error) {
    logger.error('Fetch products failed', { error: error instanceof Error ? error.message : String(error) });
    reqLog.end('error', { reason: 'exception' });
    throw error;
  }
}
