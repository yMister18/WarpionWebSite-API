import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
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
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get('pageSize') ?? '25'))
    );
    const rawSortDirection = searchParams.get('sortDirection') ?? 'desc';
    const sortDirection: Prisma.SortOrder =
      rawSortDirection === 'asc' ? 'asc' : 'desc';

    const where: Prisma.AdminActionLogWhereInput = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    };

    const [logs, totalCount] = await Promise.all([
      prisma.adminActionLog.findMany({
        where,
        orderBy: {
          createdAt: sortDirection,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminActionLog.count({ where }),
    ]);

    return ok({
      count: logs.length,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      logs,
    });
  } catch (error) {
    console.error('GET /api/internal/admin/action-logs error:', error);
    return fail('Internal server error', 500);
  }
}