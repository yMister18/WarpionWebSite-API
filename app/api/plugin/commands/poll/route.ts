import { NextRequest } from 'next/server';
import { ShopCommandStatus } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { validatePluginKey } from '@/lib/plugin-auth';
import { isValidUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrismaClient();

    const authError = validatePluginKey(request);
    if (authError) return authError;

    const playerUuid = request.nextUrl.searchParams.get('playerUuid');

    if (!isValidUuid(playerUuid)) {
      return fail('Invalid or missing playerUuid', 400);
    }

    const player = await prisma.player.findUnique({
      where: { uuid: playerUuid },
    });

    if (!player) {
      return fail('Player not found', 404);
    }

    const candidates = await prisma.shopCommand.findMany({
      where: {
        playerId: player.id,
        status: {
          in: [ShopCommandStatus.PENDING, ShopCommandStatus.PUBLISHED],
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50,
    });

    const claimedCommands = [];

    for (const command of candidates) {
      const claimResult = await prisma.shopCommand.updateMany({
        where: {
          id: command.id,
          status: {
            in: [ShopCommandStatus.PENDING, ShopCommandStatus.PUBLISHED],
          },
        },
        data: {
          status: ShopCommandStatus.PROCESSING,
          attempts: {
            increment: 1,
          },
          publishedAt: command.publishedAt ?? new Date(),
        },
      });

      if (claimResult.count > 0) {
        claimedCommands.push({
          shopCommandId: command.id,
          orderId: command.orderId,
          command: command.command,
          status: ShopCommandStatus.PROCESSING,
          attempts: command.attempts + 1,
          createdAt: command.createdAt,
        });
      }
    }

    return ok({
      playerUuid,
      commands: claimedCommands,
    });
  } catch (error) {
    console.error('GET /api/plugin/commands/poll error:', error);
    return fail('Internal server error', 500);
  }
}