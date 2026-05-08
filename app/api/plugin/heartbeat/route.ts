import { NextRequest } from 'next/server';
import { redis } from '@/lib/redis';
import { ok, fail } from '@/lib/api-response';
import { validatePluginKey } from '@/lib/plugin-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = validatePluginKey(request);
    if (authError) return authError;

    const serverId =
      request.nextUrl.searchParams.get('serverId')?.trim() || 'default-server';

    const key = `warpion:server:${serverId}:heartbeat`;
    const lastHeartbeatAt = Date.now();

    await redis.set(
      key,
      JSON.stringify({
        online: true,
        serverId,
        lastHeartbeatAt,
      }),
      'EX',
      60
    );

    return ok({
      serverId,
      online: true,
      ttl: 60,
      lastHeartbeatAt,
    });
  } catch (error) {
    console.error('GET /api/plugin/heartbeat error:', error);

    return fail(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}