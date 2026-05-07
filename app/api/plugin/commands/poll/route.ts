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

    const commands = await prisma.shopCommand.findMany({
      where: {
        playerId: player.id,
        status: ShopCommandStatus.PENDING,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50,
    });

    if (commands.length > 0) {
      await prisma.$transaction(
        commands.map((command) =>
          prisma.shopCommand.update({
            where: { id: command.id },
            data: {
              attempts: {
                increment: 1,
              },
            },
          })
        )
      );
    }

    return ok({
      playerUuid,
      commands: commands.map((command) => ({
        shopCommandId: command.id,
        orderId: command.orderId,
        command: command.command,
        status: command.status,
        attempts: command.attempts + 1,
        createdAt: command.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET /api/plugin/commands/poll error:', error);
    return fail('Internal server error', 500);
  }
}
