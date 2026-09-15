import type { NextRequest } from 'next/server';
import { handleRouteError, jsonOk } from '@/lib/api/response';
import { AppError } from '@/lib/errors';
import { purgeExpired } from '@/lib/paste/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cleanup — hard-delete rows whose expiry has passed.
 *
 * Purely housekeeping: expiry is already enforced on every read path, so
 * correctness never depends on this running. It exists so expired rows do not
 * linger at rest. Wire it to a Vercel Cron job or a Supabase scheduled function
 * (see docs/DEPLOYMENT.md).
 *
 * Protected by CLEANUP_SECRET when that variable is set; without it the route
 * is disabled rather than left open.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CLEANUP_SECRET?.trim();
    if (!secret) {
      throw new AppError('STORAGE_UNAVAILABLE', {
        message: 'Cleanup is disabled. Set CLEANUP_SECRET to enable it.',
      });
    }
    const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (presented !== secret) throw new AppError('INVALID_EDIT_TOKEN', { message: 'Not authorised.' });

    return jsonOk({ deleted: await purgeExpired() });
  } catch (error) {
    return handleRouteError('api.cleanup', error);
  }
}
