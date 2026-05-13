import { NextRequest } from 'next/server';
import { Prisma, ShopCommandStatus } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { validateInternalKey } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

const PROCESSING_TIMEOUT_MINUTES = Number(
  process.env.SHOP_COMMAND_PROCESSING_TIMEOUT_MINUTES ?? '15'
);

export async function GET(request: NextRequest) {
  try {
    if (!validateInternalKey(request)) {
      return fail('Unauthorized', 401);
    }

    const prisma = getPrismaClient();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MINUTES * 60 * 1000);

    const where: Prisma.ShopCommandWhereInput = {
      status: ShopCommandStatus.PROCESSING,
      processingStartedAt: {
        lt: cutoff,
      },
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { command: { contains: q, mode: 'insensitive' } },
              { processingOwner: { contains: q, mode: 'insensitive' } },
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
        processingStartedAt: 'asc',
      },
      take: 5000,
    });

    return ok({
      count: commands.length,
      ids: commands.map((command) => command.id),
    });
  } catch (error) {
    console.error('GET /api/internal/shop/stuck-commands/ids error:', error);
    return fail('Internal server error', 500);
  }
}