import type { NextRequest } from 'next/server';
import { guardMutation, readEditToken } from '@/lib/api/guards';
import { handleRouteError, jsonOk, readJson } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { deletePaste, loadForEdit, readPasteContent, updatePaste } from '@/lib/paste/service';
import { formatIssues, updatePasteSchema } from '@/lib/validation/paste';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/pastes/[slug]
 *
 * Returns metadata plus the body for pastes that need no server-side secret:
 * plaintext pastes and browser-encrypted pastes (ciphertext only — the key
 * never reaches the server). Password-protected pastes return 401 and must go
 * through /unlock; burn pastes return their metadata only and must go through
 * /reveal.
 *
 * `?edit=1` with a valid edit token returns the body for the owner's edit form.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params;

    if (request.nextUrl.searchParams.get('edit') === '1') {
      const editToken = readEditToken(request);
      return jsonOk(await loadForEdit(slug, editToken));
    }

    const countView = request.nextUrl.searchParams.get('count') === '1';
    const payload = await readPasteContent(slug, { countView });
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError('api.pastes.get', error);
  }
}

/** PATCH /api/pastes/[slug] — edit a paste. Requires the creator's edit token. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await guardMutation(request, 'mutate');
    const { slug } = await params;
    const body = await readJson(request);
    const editToken = readEditToken(request, body);

    const parsed = updatePasteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', { details: formatIssues(parsed.error) });
    }

    const meta = await updatePaste(slug, editToken, parsed.data);
    return jsonOk({ meta });
  } catch (error) {
    return handleRouteError('api.pastes.update', error);
  }
}

/** DELETE /api/pastes/[slug] — delete a paste. Requires the creator's edit token. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    await guardMutation(request, 'mutate');
    const { slug } = await params;
    await deletePaste(slug, readEditToken(request));
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError('api.pastes.delete', error);
  }
}
