import type { NextRequest } from 'next/server';
import { guardMutation } from '@/lib/api/guards';
import { handleRouteError, jsonOk, readJson } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { createPaste } from '@/lib/paste/service';
import { createPasteSchema, formatIssues } from '@/lib/validation/paste';

// bcrypt and node:crypto need the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/pastes — create a paste. */
export async function POST(request: NextRequest) {
  try {
    await guardMutation(request, 'create');

    const parsed = createPasteSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', { details: formatIssues(parsed.error) });
    }

    const result = await createPaste(parsed.data);
    // The raw edit token is returned exactly once. Only its hash is stored.
    return jsonOk(
      { slug: result.slug, url: result.url, editToken: result.editToken, meta: result.meta },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError('api.pastes.create', error);
  }
}
