import { PrismaClient, ShopCommandStatus } from '@prisma/client';

export async function requeueShopCommandById(
  prisma: PrismaClient,
  shopCommandId: string
) {
  return prisma.shopCommand.update({
    where: { id: shopCommandId },
    data: {
      status: ShopCommandStatus.PENDING,
      attempts: 0,
      processingStartedAt: null,
      processingOwner: null,
      deliveredAt: null,
      publishedAt: null,
      lastError: 'Manually requeued by admin',
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
}