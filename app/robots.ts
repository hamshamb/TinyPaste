import type { MetadataRoute } from 'next';
import { site } from '@/lib/config/site';

/**
 * Paste pages are disallowed outright. Privacy wins over discoverability: a
 * crawler must never index paste content, even for a public paste.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/p/', '/api/', '/recent'] }],
    host: site.url,
  };
}
