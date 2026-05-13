import { NextRequest } from 'next/server';
import { Prisma, ShopCommandStatus } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { validateInternalKey } from '@/lib/internal-auth';
import { logAdminAction } from '@/lib/admin-action-log';
import { getAdminRequestContext } from '@/lib/admin-request-context';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!validateInternalKey(request)) {
      return fail('Unauthorized', 401);
    }

    const body = await request.json();
    const shopCommandIds = body?.shopCommandIds;

    if (
      !Array.isArray(shopCommandIds) ||
      shopCommandIds.length === 0 ||
      shopCommandIds.some((id) => typeof id !== 'string')
    ) {
      return fail('Invalid or missing shopCommandIds', 400);
    }

    const prisma = getPrismaClient();
    const adminContext = getAdminRequestContext(request);

    const uniqueIds = Array.from(new Set(shopCommandIds));

    const shopCommands = await prisma.shopCommand.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            deliveryStatus: true,
          },
        },
      },
    });

    const foundIds = new Set(shopCommands.map((command) => command.id));
    const results: Array<{
      shopCommandId: string;
      success: boolean;
      message?: string;
      shopCommand?: unknown;
    }> = [];

    for (const requestedId of uniqueIds) {
      if (!foundIds.has(requestedId)) {
        results.push({
          shopCommandId: requestedId,
          success: false,
          message: 'ShopCommand not found',
        });
      }
    }

    for (const command of shopCommands) {
      try {
        const updated = await prisma.shopCommand.update({
          where: { id: command.id },
          data: {
            status: ShopCommandStatus.PENDING,
            attempts: 0,
            processingStartedAt: null,
            processingOwner: null,
            deliveredAt: null,
            publishedAt: null,
            lastError: 'Manually requeued by admin (bulk)',
          },
          include: {
            player: {
              select: {
                id: true,
                uuid: true,
                username: true,
              },
            },
            order: {
              select: {
                id: true,
                status: true,
                deliveryStatus: true,
              },
            },
          },
        });

        await logAdminAction({
          action: 'REQUEUE_COMMAND_BULK_ITEM',
          entityType: 'SHOP_COMMAND',
          entityId: updated.id,
          actor: adminContext.actor,
          details: {
            orderId: updated.orderId,
            playerId: updated.playerId,
            status: updated.status,
            ip: adminContext.ip,
            userAgent: adminContext.userAgent,
          },
        });

        results.push({
          shopCommandId: updated.id,
          success: true,
          shopCommand: updated,
        });
      } catch (error) {
        results.push({
          shopCommandId: command.id,
          success: false,
          message:
            error instanceof Error ? error.message : 'Unknown requeue error',
        });
      }
    }

    const successCount = results.filter((result) => result.success).length;
    const failedCount = results.length - successCount;

    await logAdminAction({
      action: 'REQUEUE_COMMAND_BULK',
      entityType: 'SHOP_COMMAND_BATCH',
      actor: adminContext.actor,
      details: {
        requestedCount: uniqueIds.length,
        successCount,
        failedCount,
        ids: uniqueIds,
        ip: adminContext.ip,
        userAgent: adminContext.userAgent,
      },
    });

    return ok({
      requestedCount: uniqueIds.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error('POST /api/internal/shop/requeue-commands-bulk error:', error);
    return fail('Internal server error', 500);
  }
}