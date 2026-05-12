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

    const orders = await prisma.order.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        player: {
          select: {
            id: true,
            uuid: true,
            username: true,
          },
        },
        shopCommands: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      take: 200,
    });

    return ok({
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('GET /api/internal/shop/orders error:', error);
    return fail('Internal server error', 500);
  }
}