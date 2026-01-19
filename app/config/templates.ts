export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  duration: number;
  thumbnail: string;
}

export const TEMPLATES: Record<string, VideoTemplate> = {
  'zoom-pan': {
    id: 'zoom-pan',
    name: 'Cinematic Zoom',
    description: 'Slow cinematic zoom with subtle movement',
    prompt: 'Slow cinematic zoom on the product, subtle camera movement, professional product photography lighting, clean background',
    duration: 4,
    thumbnail: '/templates/zoom-pan.jpg',
  },
  'lifestyle': {
    id: 'lifestyle',
    name: 'Lifestyle Scene',
    description: 'Product in a lifestyle context',
    prompt: 'Product shown in elegant lifestyle setting, natural lighting, gentle ambient movement, aspirational context',
    duration: 6,
    thumbnail: '/templates/lifestyle.jpg',
  },
  '360-spin': {
    id: '360-spin',
    name: '360° Spin',
    description: 'Product rotating 360 degrees',
    prompt: 'Product smoothly rotating 360 degrees on clean background, professional studio lighting, seamless loop',
    duration: 5,
    thumbnail: '/templates/360-spin.jpg',
  },
};

export function getTemplate(id: string): VideoTemplate | undefined {
  return TEMPLATES[id];
}

export function getAllTemplates(): VideoTemplate[] {
  return Object.values(TEMPLATES);
}
