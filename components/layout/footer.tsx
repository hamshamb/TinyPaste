import Link from 'next/link';
import { site } from '@/lib/config/site';

/**
 * The abuse link points at a mailto: address when ABUSE_CONTACT_EMAIL is set,
 * and otherwise at the documented placeholder on the About page — groundwork
 * for a real report workflow without pretending one exists.
 */
function abuseHref(): string {
  return site.abuseContactEmail
    ? `mailto:${site.abuseContactEmail}?subject=${encodeURIComponent(`${site.name} abuse report`)}`
    : '/about#abuse';
}

const LINK_CLASSES = 'rounded text-text-subtle tp-transition hover:text-text-base';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border-base">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-4 text-xs text-text-subtle sm:flex-row sm:items-center sm:px-5">
        <p>
          {site.name} — {site.tagline}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <Link href="/about" className={LINK_CLASSES}>
            About
          </Link>
          <Link href="/privacy" className={LINK_CLASSES}>
            Privacy
          </Link>
          <a href={abuseHref()} className={LINK_CLASSES}>
            Report abuse
          </a>
          {site.repositoryUrl ? (
            <a href={site.repositoryUrl} rel="noopener noreferrer" target="_blank" className={LINK_CLASSES}>
              Source
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
