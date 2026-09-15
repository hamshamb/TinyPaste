/**
 * Central product metadata. Change the brand here — nothing else hardcodes it.
 */
export const site = {
  name: 'TinyPaste',
  tagline: 'Share text without the noise.',
  description:
    'A privacy-focused pastebin. Optional expiry, password protection, burn-after-reading and browser-side encryption. No account required.',
  /** Public origin, used for share links and metadata. */
  url: process.env.APP_URL?.replace(/\/+$/, '') || 'http://localhost:3000',
  /** Optional: set once the project has a public repository. */
  repositoryUrl: process.env.NEXT_PUBLIC_REPOSITORY_URL || '',
  /** Where abuse reports should go. Documented placeholder until configured. */
  abuseContactEmail: process.env.ABUSE_CONTACT_EMAIL || '',
} as const;

export type SiteConfig = typeof site;
