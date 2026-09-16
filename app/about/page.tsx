import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/lib/config/site';
import { MAX_CONTENT_BYTES } from '@/lib/config/constants';
import { formatBytes } from '@/lib/utils/time';

export const metadata: Metadata = {
  title: 'About',
  description: `What ${site.name} is, and what it deliberately is not.`,
};

/**
 * Documentation, and allowed to look like it: a single measured column, real
 * prose sizing, generous leading. The product UI is dense on purpose; this is
 * the one place that should be comfortable to read straight through.
 */
export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-[700px] px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-subtle">About</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">{site.name}</h1>
      <p className="mt-4 text-[15px] leading-[1.7] text-text-muted">
        {site.name} is a place to put text somewhere another person can read it, and nothing more. Paste code,
        a log, a config file or a note, choose how long it should live, and share the link. No account, no
        sign-up wall, no feed.
      </p>

      <Section title="What it does">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-text-subtle">
          <li>Syntax highlighting for around thirty languages, with manual selection that always wins.</li>
          <li>Expiry from ten minutes to never, enforced on every way of reading a paste.</li>
          <li>Optional password protection, stored only as a bcrypt hash.</li>
          <li>Optional burn after reading, destroyed atomically on the first deliberate open.</li>
          <li>Optional encryption in your browser, where the server only ever receives ciphertext.</li>
          <li>Editing and deleting without an account, using a token kept in your browser.</li>
        </ul>
      </Section>

      <Section title="What it deliberately is not">
        <ul className="ml-4 list-disc space-y-1.5 marker:text-text-subtle">
          <li>There is no public list of pastes, and no way to browse what other people wrote.</li>
          <li>There are no accounts, profiles, comments, likes or follows.</li>
          <li>There is no analytics script, no advertising and no third-party embed of any kind.</li>
          <li>Pasted content never executes. It is rendered as text, always.</li>
        </ul>
      </Section>

      <Section title="Limits">
        <p>
          A paste can be up to {formatBytes(MAX_CONTENT_BYTES)}, with a title of up to 120 characters. Paste
          creation and password attempts are rate limited.
        </p>
      </Section>

      <Section title="Encrypted pastes">
        <p>
          When you turn on <strong className="font-medium text-text-base">Encrypt</strong>, your text is
          encrypted with AES-GCM before the request is sent. The key is placed after the{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[13px]">#</code> in the link,
          which browsers never transmit — so we store ciphertext we cannot read. Lose that part of the URL and
          the paste is gone for good. There is no recovery, by design.
        </p>
        <p className="mt-3">
          See the{' '}
          <Link href="/privacy" className="font-medium text-accent underline underline-offset-2">
            privacy page
          </Link>{' '}
          for exactly what is stored.
        </p>
      </Section>

      <Section title="Reporting abuse" id="abuse">
        {site.abuseContactEmail ? (
          <p>
            Email{' '}
            <a
              href={`mailto:${site.abuseContactEmail}`}
              className="font-medium text-accent underline underline-offset-2"
            >
              {site.abuseContactEmail}
            </a>{' '}
            with the paste link and a short description. Pastes that break the law or the hosting
            provider&rsquo;s terms are removed.
          </p>
        ) : (
          <p>
            This instance has no abuse contact configured yet. Whoever operates it should set the{' '}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[13px]">
              ABUSE_CONTACT_EMAIL
            </code>{' '}
            environment variable, which turns the footer link into a working address. A full
            report-and-moderation workflow is on the roadmap rather than implemented.
          </p>
        )}
      </Section>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-20 border-t border-border-base pt-6">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-text-muted">{children}</div>
    </section>
  );
}
