import { AppError } from '@/lib/errors';
import { readPlaintextForExport } from '@/lib/paste/service';
import { logError } from '@/lib/security/logger';
import { buildDownloadFilename, contentDispositionAttachment } from '@/lib/utils/filename';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /p/[slug]/download — the paste as a file attachment.
 *
 * The filename is derived from the title, but only after sanitisation strips
 * path separators, traversal sequences, control characters and quotes — a raw
 * title here would allow both path traversal and header injection.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  try {
    const { meta, text } = await readPlaintextForExport(slug);
    const filename = buildDownloadFilename(meta.title, meta.language, meta.slug);

    return new Response(text, {
      status: 200,
      headers: {
        // application/octet-stream, so a downloaded HTML paste cannot be opened
        // as a live document in this origin.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': contentDispositionAttachment(filename),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store, private',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    if (!appError) logError('download.read', error);
    return new Response(`${appError?.message ?? 'Something went wrong.'}\n`, {
      status: appError?.status ?? 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, private' },
    });
  }
}
