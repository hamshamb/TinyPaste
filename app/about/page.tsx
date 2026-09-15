import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/lib/config/site';
import { MAX_CONTENT_BYTES } from '@/lib/config/constants';
import { formatBytes } from '@/lib/utils/time';

export const metadata: Metadata = {
  title: 'About',
  description: `What ${site.name} is, and what it deliberately is not.`,
};

export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-mono text-xl font-semibold tracking-tight">About {site.name}</h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        {site.name} is a place to put text somewhere another person can read it, and nothing more. Paste code,
        a log, a config file or a note, choose how long it should live, and share the link. No account, no
        sign-up wall, no feed.
      </p>

      <Section title="What it does">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>Syntax highlighting for around thirty languages, with manual selection that always wins.</li>
          <li>Expiry from ten minutes to never, enforced on every way of reading a paste.</li>
          <li>Optional password protection, stored only as a bcrypt hash.</li>
          <li>Optional burn after reading, destroyed atomically on the first deliberate open.</li>
          <li>Optional encryption in your browser, where the server only ever receives ciphertext.</li>
          <li>Editing and deleting without an account, using a token kept in your browser.</li>
        </ul>
      </Section>

      <Section title="What it deliberately is not">
        <ul className="ml-4 list-disc space-y-1.5">
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
          When you choose &ldquo;Encrypt in browser&rdquo;, your text is encrypted with AES-GCM before the
          request is sent. The key is placed after the <code className="font-mono">#</code> in the link, which
          browsers never transmit — so we store ciphertext we cannot read. Lose that part of the URL and the
          paste is gone for good. There is no recovery, by design.
        </p>
        <p className="mt-2">
          See the <Link href="/privacy" className="text-accent underline underline-offset-2">privacy page</Link>{' '}
          for exactly what is stored.
        </p>
      </Section>

      <Section title="Reporting abuse" id="abuse">
        {site.abuseContactEmail ? (
          <p>
            Email{' '}
            <a
              href={`mailto:${site.abuseContactEmail}`}
              className="text-accent underline underline-offset-2"
            >
              {site.abuseContactEmail}
            </a>{' '}
            with the paste link and a short description. Pastes that break the law or the hosting provider&rsquo;s
            terms are removed.
          </p>
        ) : (
          <p>
            This instance has no abuse contact configured yet. Whoever operates it should set the{' '}
            <code className="font-mono">ABUSE_CONTACT_EMAIL</code> environment variable, which turns the
            footer link into a working address. A full report-and-moderation workflow is on the roadmap rather
            than implemented.
          </p>
        )}
      </Section>
    </article>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  );
}
