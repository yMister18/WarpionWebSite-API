import { NextRequest } from 'next/server';
import { OrderStatus, ShopCommandStatus } from '@prisma/client';
import { getPrismaClient } from '@/lib/prisma';
import { ok, fail } from '@/lib/api-response';
import { publishShopCommand } from '@/lib/shop-publisher';
import {
  isArrayOfStrings,
  isObject,
  isString,
  isValidUuid,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrismaClient();

    const body: unknown = await request.json();

    if (!isObject(body)) {
      return fail('Invalid request body', 400);
    }

    const { orderId, paymentStatus, playerUuid, commands } = body;

    if (!isString(orderId)) {
      return fail('Invalid or missing orderId', 400);
    }

    if (!isString(paymentStatus)) {
      return fail('Invalid or missing paymentStatus', 400);
    }

    if (!isValidUuid(playerUuid)) {
      return fail('Invalid or missing playerUuid', 400);
    }

    if (!isArrayOfStrings(commands) || commands.length === 0) {
      return fail('Invalid or missing commands', 400);
    }

    const normalizedStatus = paymentStatus.toUpperCase();

    if (!Object.values(OrderStatus).includes(normalizedStatus as OrderStatus)) {
      return fail('Unsupported paymentStatus', 400);
    }

    const player = await prisma.player.findUnique({
      where: { uuid: playerUuid },
    });

    if (!player) {
      return fail('Player not found', 404);
    }

    const publishedCommands: Array<{
      shopCommandId: string;
      command: string;
      published: boolean;
    }> = [];

    let order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: normalizedStatus as OrderStatus,
        paidAt: normalizedStatus === OrderStatus.PAID ? new Date() : null,
      },
    });

    if (normalizedStatus === OrderStatus.PAID) {
      const creationResult = await prisma.$transaction(async (tx) => {
        const commandIssuanceLock = await tx.order.updateMany({
          where: {
            id: order.id,
            commandsIssuedAt: null,
          },
          data: {
            commandsIssuedAt: new Date(),
          },
        });

        if (commandIssuanceLock.count === 0) {
          return {
            createdCommands: [] as Array<{ id: string; command: string; orderId: string }>,
            order: await tx.order.findUniqueOrThrow({ where: { id: order.id } }),
          };
        }

        const createdCommands = await Promise.all(
          commands.map((command) =>
            tx.shopCommand.create({
              data: {
                orderId: order.id,
                playerId: player.id,
                command,
                status: ShopCommandStatus.PUBLISHED,
                publishedAt: new Date(),
              },
              select: {
                id: true,
                command: true,
                orderId: true,
              },
            })
          )
        );

        const updatedOrder = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
        });

        return { createdCommands, order: updatedOrder };
      });

      order = creationResult.order;

      for (const shopCommand of creationResult.createdCommands) {
        try {
          await publishShopCommand({
            type: 'SHOP_COMMAND_EXECUTION',
            shopCommandId: shopCommand.id,
            orderId: shopCommand.orderId,
            playerUuid,
            command: shopCommand.command,
            createdAt: new Date().toISOString(),
          });

          publishedCommands.push({
            shopCommandId: shopCommand.id,
            command: shopCommand.command,
            published: true,
          });
        } catch (publishError) {
          console.error('Redis publish failed:', publishError);

          await prisma.shopCommand.update({
            where: { id: shopCommand.id },
            data: {
              status: ShopCommandStatus.PENDING,
              lastError: 'Failed to publish to Redis Pub/Sub',
            },
          });

          publishedCommands.push({
            shopCommandId: shopCommand.id,
            command: shopCommand.command,
            published: false,
          });
        }
      }
    }

    return ok({
      order,
      publishedCommands,
    });
  } catch (error) {
    console.error('POST /api/shop/webhook error:', error);
    return fail('Internal server error', 500);
  }
}
