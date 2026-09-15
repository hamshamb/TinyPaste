import type { Metadata } from 'next';
import { site } from '@/lib/config/site';

export const metadata: Metadata = {
  title: 'Privacy',
  description: `What ${site.name} stores, and what it does not.`,
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-mono text-xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        Plain English, and only claims the code actually backs up.
      </p>

      <Section title="What is stored for every paste">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>The content you submitted — plaintext, or ciphertext for browser-encrypted pastes.</li>
          <li>The optional title, the language you selected, and the size of the content.</li>
          <li>Creation and last-update timestamps, and the expiry time if you set one.</li>
          <li>A bcrypt hash of the password, when you set one. Never the password itself.</li>
          <li>A SHA-256 hash of the edit token. The token itself only exists in your browser.</li>
          <li>A view counter: one integer, with no timestamps and nothing about who viewed.</li>
        </ul>
      </Section>

      <Section title="IP addresses">
        <p>
          The application does not write your IP address to the database and does not log it. It is used
          transiently, in memory, as a bucket key for rate limiting paste creation and password attempts, and
          is discarded when that window ends.
        </p>
        <p className="mt-2">
          What it cannot promise is the layer underneath: any web host, CDN or reverse proxy in front of this
          app may keep its own access logs containing IP addresses and requested paths. That is outside this
          application&rsquo;s control, so treat the URL itself as visible to whoever runs the infrastructure.
        </p>
      </Section>

      <Section title="What your browser stores">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            A local history of pastes you created: slug, title, language, timestamps, and the edit token that
            lets you modify or delete them. For encrypted pastes it also holds the encryption key, so
            &ldquo;Recent&rdquo; can rebuild a working link.
          </li>
          <li>Your theme preference.</li>
          <li>
            Nothing is synchronised anywhere. Clearing site data erases all of it, including edit tokens, and
            it cannot be recovered.
          </li>
        </ul>
      </Section>

      <Section title="Encrypted pastes">
        <p>
          Choosing &ldquo;Encrypt in browser&rdquo; encrypts the text with AES-GCM using a random 256-bit key
          generated on your device. Only the ciphertext, the initialisation vector and a format version are
          sent to the server.
        </p>
        <p className="mt-2">
          The key is placed in the URL fragment — the part after <code className="font-mono">#</code>. Browsers
          do not send fragments in requests, so the key never reaches {site.name}, is never written to a log,
          and is not stored by us. It is also never put in a query string or sent to any third party. If the
          fragment is lost, the paste cannot be decrypted by anyone, including us.
        </p>
      </Section>

      <Section title="Expiry and deletion">
        <p>
          Once a paste&rsquo;s expiry time passes, every read path refuses it: the paste page, the raw route, the
          download route and the API. A cleanup job then removes expired rows from the database, so the data
          does not linger at rest.
        </p>
        <p className="mt-2">
          Deleting a paste removes the row outright. A burn-after-reading paste has its stored content wiped
          the moment it is delivered. Ordinary database backups, if the operator keeps any, may still contain
          data for as long as those backups are retained.
        </p>
      </Section>

      <Section title="Tracking">
        <p>
          There is no analytics service, no advertising, no tracking pixel, no third-party font and no
          external script of any kind. The content security policy blocks connections to other origins
          outright.
        </p>
      </Section>

      <Section title="What this cannot promise">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            Anyone with the link can read a paste. Links are unguessable, but they are not access-controlled.
          </li>
          <li>
            For pastes that are not browser-encrypted, the server and its operator can read the content.
          </li>
          <li>Anyone who reads a paste can copy it before it expires or burns.</li>
          <li>Hosting infrastructure outside this application may keep its own logs.</li>
        </ul>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  );
}
