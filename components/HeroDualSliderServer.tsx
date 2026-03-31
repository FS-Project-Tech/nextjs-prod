import { cache } from 'react';
import HeroDualSlider, { SliderImage } from '@/components/HeroDualSlider';
import { getWpBaseUrl } from '@/lib/wp-utils';
 
interface ACFImageField {
  url?: string;
  alt?: string;
  alt_text?: string;
  source_url?: string;
}
 
interface ACFRepeaterItem {
  image?: ACFImageField | string | number;
  link?: string | { url?: string };
}
 
interface ACFOptionsResponse {
  acf?: {
    left_side_banner?: ACFRepeaterItem[];
    right_side_banner?: ACFRepeaterItem[];
    [key: string]: any;
  };
}
 
// Batch fetch images by ID
async function fetchImagesByIds(ids: number[]): Promise<Map<number, { url: string; alt: string }>> {
  const baseUrl = getWpBaseUrl();
  const results = new Map();
 
  try {
    const promises = ids.map(async (id) => {
      const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${id}`, {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const data = await res.json();
        return [id, {
          url: data.source_url || data.guid?.rendered || '',
          alt: data.alt_text || data.title?.rendered || '',
        }];
      }
      return null;
    });
 
    const settled = await Promise.allSettled(promises);
    settled.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        const [id, data] = result.value;
        results.set(id, data);
      }
    });
  } catch (error) {
    console.error('[HeroSlider] Batch image fetch failed:', error);
  }
 
  return results;
}
 
// Extract image data from ACF field
function extractImageData(image: any): { url: string; alt: string } | null {
  if (!image) return null;
 
  if (typeof image === 'string') {
    return { url: image, alt: '' };
  }
 
  if (typeof image === 'object') {
    const url = image.url || image.source_url || image.guid?.rendered || '';
    const alt = image.alt || image.alt_text || image.title?.rendered || '';
    return url ? { url, alt } : null;
  }
 
  return null;
}
 
async function transformACFItems(items: ACFRepeaterItem[]): Promise<SliderImage[]> {
  if (!Array.isArray(items) || !items.length) return [];
 
  // Separate image IDs from direct images
  const imageIds: number[] = [];
  const directImages: SliderImage[] = [];
 
  items.forEach((item) => {
    if (typeof item.image === 'number') {
      imageIds.push(item.image);
    } else {
      const imageData = extractImageData(item.image);
      if (imageData) {
        directImages.push({
          src: imageData.url,
          alt: imageData.alt,
          link: typeof item.link === 'string' ? item.link : item.link?.url,
        });
      }
    }
  });
 
  // Batch fetch all image IDs
  const imageMap = imageIds.length ? await fetchImagesByIds(imageIds) : new Map();
 
  // Combine all images in original order
  const results: SliderImage[] = [];
  items.forEach((item) => {
    if (typeof item.image === 'number') {
      const imageData = imageMap.get(item.image);
      if (imageData) {
        results.push({
          src: imageData.url,
          alt: imageData.alt,
          link: typeof item.link === 'string' ? item.link : item.link?.url,
        });
      }
    } else {
      const imageData = extractImageData(item.image);
      if (imageData) {
        results.push({
          src: imageData.url,
          alt: imageData.alt,
          link: typeof item.link === 'string' ? item.link : item.link?.url,
        });
      }
    }
  });
 
  return results.filter((img) => img.src?.trim());
}
 
async function fetchACFHeroData(): Promise<{ left: SliderImage[]; right: SliderImage[] }> {
  const baseUrl = getWpBaseUrl();
 
  if (!baseUrl) return { left: [], right: [] };
 
  try {
    const res = await fetch(`${baseUrl}/wp-json/acf/v3/options/options`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });
 
    if (!res.ok) throw new Error(`ACF API returned ${res.status}`);
 
    const data: ACFOptionsResponse = await res.json();
    const acf = data?.acf || {};
 
    const leftBanner = acf.left_side_banner || [];
    const rightBanner = acf.right_side_banner || [];
 
    const [left, right] = await Promise.all([
      transformACFItems(leftBanner),
      transformACFItems(rightBanner),
    ]);
 
    return { left, right };
  } catch (error) {
    console.error('[HeroSlider] ACF fetch failed:', error);
    return { left: [], right: [] };
  }
}
 
const getCachedACFData = cache(fetchACFHeroData);
 
export default async function HeroDualSliderServer() {
  const { left, right } = await getCachedACFData();
  return <HeroDualSlider leftImages={left} rightImages={right} />;
}
 