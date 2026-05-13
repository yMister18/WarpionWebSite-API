import { NextRequest } from 'next/server';
import { ShopCommandStatus } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { validateInternalKey } from '@/lib/internal-auth';
import { isObject, isString } from '@/lib/validation';
import { logAdminAction } from '@/lib/admin-action-log';
import { requeueShopCommandById } from '@/lib/shop-command-requeue';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!validateInternalKey(request)) {
      return fail('Unauthorized', 401);
    }

    const prisma = getPrismaClient();
    const body: unknown = await request.json();

    if (!isObject(body)) {
      return fail('Invalid request body', 400);
    }
    const { shopCommandId } = body;

    if (!isString(shopCommandId)) {
      return fail('Invalid or missing shopCommandId', 400);
    }
    const shopCommand = await requeueShopCommandById(prisma, shopCommandId);

    const existing = await prisma.shopCommand.findUnique({
      where: { id: shopCommandId },
    });

    
    if (!existing) {
      return fail('ShopCommand not found', 404);
    }

    if (existing.status === ShopCommandStatus.DELIVERED) {
      return fail('Delivered commands cannot be requeued', 409);
    }

    const updated = await prisma.shopCommand.update({
      where: { id: shopCommandId },
      data: {
        status: ShopCommandStatus.PENDING,
        processingStartedAt: null,
        processingOwner: null,
        deliveredAt: null,
        lastError: 'Manually requeued by admin',
      },
    });

    await logAdminAction({
      action: 'REQUEUE_COMMAND',
      entityType: 'ShopCommand',
      entityId: shopCommandId,
      actor: 'internal-api',
      details: {
        orderId: existing.orderId,
        playerId: existing.playerId,
        status: existing.status,
    },
    });

    return ok({
      shopCommand: updated,
      
    });
  } catch (error) {
    console.error('POST /api/internal/shop/requeue-command error:', error);
    return fail('Internal server error', 500);
  }
}