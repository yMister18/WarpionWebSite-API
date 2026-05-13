import { NextRequest } from 'next/server';

export type AdminRequestContext = {
  actor: string;
  ip: string;
  userAgent: string;
};

function getFirstForwardedIp(value: string | null) {
  if (!value) return null;

  const first = value.split(',')[0]?.trim();
  return first || null;
}

export function getAdminRequestContext(request: NextRequest): AdminRequestContext {
  return {
    actor: request.headers.get('x-admin-actor') ?? 'unknown-admin',
    ip:
      request.headers.get('x-admin-ip') ??
      getFirstForwardedIp(request.headers.get('x-forwarded-for')) ??
      request.headers.get('x-real-ip') ??
      'unknown',
    userAgent: request.headers.get('x-admin-user-agent') ?? 'unknown',
  };
}