import { json, LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

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

  return json({
    products: data.data.products.edges.map((edge: any) => ({
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
    })),
    hasNextPage: data.data.products.pageInfo.hasNextPage,
  });
}
