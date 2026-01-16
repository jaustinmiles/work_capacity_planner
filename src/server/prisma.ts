/**
 * Prisma Client Singleton for Server
 *
 * Creates and manages a single PrismaClient instance for the server process.
 * This prevents multiple connections from being created during hot reloads.
 */

import { PrismaClient } from '@prisma/client'

// Global variable to store the Prisma instance (survives hot reloads in development)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Singleton PrismaClient instance.
 * In production, creates a new client.
 * In development, reuses existing client to avoid connection exhaustion.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/**
 * Gracefully disconnect Prisma on server shutdown
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}
