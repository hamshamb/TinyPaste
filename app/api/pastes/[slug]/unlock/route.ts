import type { NextRequest } from 'next/server';
import { guardMutation } from '@/lib/api/guards';
import { handleRouteError, jsonOk, readJson } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { readPasteContent } from '@/lib/paste/service';
import { formatIssues, unlockSchema } from '@/lib/validation/paste';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/pastes/[slug]/unlock
 *
 * Exchanges a password for the paste body. The password arrives in the request
 * body (never a query string, so it cannot reach an access log) and is
 * discarded after the bcrypt comparison — it is never logged or stored.
 *
 * Rate limited under the `unlock` policy, which is tighter than paste creation
 * because this is the only online-guessable secret in the product.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await guardMutation(request, 'unlock');
    const { slug } = await params;

    const parsed = unlockSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', { details: formatIssues(parsed.error) });
    }

    /**
     * A burn paste that is also password protected is consumed here, and only
     * here: the burn claim happens after the password check inside
     * readPasteContent, so a wrong guess cannot destroy the paste.
     */
    const payload = await readPasteContent(slug, {
      password: parsed.data.password,
      allowBurn: true,
      countView: true,
    });
    return jsonOk(payload);
  } catch (error) {
    return handleRouteError('api.pastes.unlock', error);
  }
}
