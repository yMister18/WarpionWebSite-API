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
    const q = searchParams.get('q')?.trim() ?? '';

    const where: Prisma.ShopCommandWhereInput = {
      status: 'FAILED',
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { command: { contains: q, mode: 'insensitive' } },
              { lastError: { contains: q, mode: 'insensitive' } },
              { orderId: { contains: q, mode: 'insensitive' } },
              {
                player: {
                  is: {
                    username: { contains: q, mode: 'insensitive' },
                  },
                },
              },
              {
                player: {
                  is: {
                    uuid: { contains: q, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const commands = await prisma.shopCommand.findMany({
      where,
      select: {
        id: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5000,
    });

    return ok({
      count: commands.length,
      ids: commands.map((command) => command.id),
    });
  } catch (error) {
    console.error('GET /api/internal/shop/failed-commands/ids error:', error);
    return fail('Internal server error', 500);
  }
}