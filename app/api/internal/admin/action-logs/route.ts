import { NextRequest } from 'next/server';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { validateInternalKey } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (!validateInternalKey(request)) {
      return fail('Unauthorized', 401);
    }

    const prisma = getPrismaClient();
    const { searchParams } = new URL(request.url);

    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const take = Math.min(Number(searchParams.get('take') ?? '100'), 200);

    const logs = await prisma.adminActionLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take,
    });

    return ok({
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('GET /api/internal/admin/action-logs error:', error);
    return fail('Internal server error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!validateInternalKey(request)) {
      return fail('Unauthorized', 401);
    }

    const body = await request.json();
    const action = body?.action;
    const entityType = body?.entityType;
    const entityId = body?.entityId ?? null;
    const actor = body?.actor;
    const details = body?.details ?? null;

    if (!action || typeof action !== 'string') {
      return fail('Invalid or missing action', 400);
    }

    if (!entityType || typeof entityType !== 'string') {
      return fail('Invalid or missing entityType', 400);
    }

    if (!actor || typeof actor !== 'string') {
      return fail('Invalid or missing actor', 400);
    }

    const prisma = getPrismaClient();

    const log = await prisma.adminActionLog.create({
      data: {
        action,
        entityType,
        entityId,
        actor,
        details,
      },
    });

    return ok({ log });
  } catch (error) {
    console.error('POST /api/internal/admin/action-logs error:', error);
    return fail('Internal server error', 500);
  }
}