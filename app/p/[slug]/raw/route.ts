import { AppError } from '@/lib/errors';
import { readPlaintextForExport } from '@/lib/paste/service';
import { logError } from '@/lib/security/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /p/[slug]/raw — the paste body, and nothing else.
 *
 * Always `text/plain` with `nosniff`, never the paste's own MIME type: serving
 * an HTML or SVG paste as its declared type would let it execute scripts in
 * this origin. `Content-Disposition: inline` plus a sandboxed content type
 * keeps it a document to read, not a page to run.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  try {
    const { text } = await readPlaintextForExport(slug);
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'no-store, private',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    if (!appError) logError('raw.read', error);
    return new Response(`${appError?.message ?? 'Something went wrong.'}\n`, {
      status: appError?.status ?? 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store, private',
      },
    });
  }
}
