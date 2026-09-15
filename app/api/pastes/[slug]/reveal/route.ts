import type { NextRequest } from 'next/server';
import { guardMutation } from '@/lib/api/guards';
import { handleRouteError, jsonOk } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { loadPasteRecord, readPasteContent } from '@/lib/paste/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/pastes/[slug]/reveal
 *
 * Consumes a burn-after-reading paste.
 *
 * Deliberately a POST behind an explicit user action rather than something that
 * happens while rendering the page: GET requests are issued by prefetchers,
 * link-preview bots and the creator's own post-creation redirect, any of which
 * would otherwise destroy the paste before the recipient ever saw it.
 *
 * The claim itself is a single atomic statement in the repository, so when two
 * readers press the button simultaneously exactly one receives the content and
 * the other sees "no longer available".
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await guardMutation(request, 'mutate');
    const { slug } = await params;

    const record = await loadPasteRecord(slug);
    if (!record.burnAfterRead) {
      throw new AppError('EDIT_NOT_ALLOWED', { message: 'This paste is not burn-after-reading.' });
    }
    // Password-protected burn pastes must be claimed through /unlock instead,
    // so that the password check always precedes the destruction.
    if (record.passwordHash) throw new AppError('PASSWORD_REQUIRED');

    const payload = await readPasteContent(slug, { allowBurn: true });
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError('api.pastes.reveal', error);
  }
}
