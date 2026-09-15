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

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border-base">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-text-subtle sm:flex-row sm:items-center sm:px-6">
        <p className="font-mono">
          {site.name} — {site.tagline}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto">
          <Link href="/about" className="transition-colors hover:text-text-base">
            About
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-text-base">
            Privacy
          </Link>
          <a href={abuseHref()} className="transition-colors hover:text-text-base">
            Report abuse
          </a>
          {site.repositoryUrl ? (
            <a
              href={site.repositoryUrl}
              rel="noopener noreferrer"
              target="_blank"
              className="transition-colors hover:text-text-base"
            >
              Source
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
