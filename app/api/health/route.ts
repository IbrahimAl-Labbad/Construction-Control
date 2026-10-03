/**
 * app/api/health/route.ts
 *
 * Minimal production-safe health and readiness probe endpoint.
 *
 * Distinguishes:
 * - Liveness (process alive): ?type=liveness
 * - Readiness (database connected): default or ?type=readiness
 *
 * Security:
 * - Strictly does NOT expose database credentials, connection strings,
 *   SQL statements, topology, or internal stack traces.
 *
 * Follows AGENTS.md §12 and Slice 19 §9 specifications.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const checkType = searchParams.get('type') ?? 'readiness';

  const timestamp = new Date().toISOString();

  // 1. Liveness Probe
  if (checkType === 'liveness') {
    return NextResponse.json(
      {
        status: 'ok',
        type: 'liveness',
        timestamp,
      },
      { status: 200 },
    );
  }

  // 2. Readiness Probe (Database Connectivity Verification)
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        type: 'readiness',
        checks: {
          database: 'up',
        },
        timestamp,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error('health.readiness_check_failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });

    // Never leak SQL queries, connection strings, or stack traces
    return NextResponse.json(
      {
        status: 'unhealthy',
        type: 'readiness',
        checks: {
          database: 'down',
        },
        timestamp,
      },
      { status: 503 },
    );
  }
}
