import type { NextRequest } from 'next/server';
import { handlers } from '@/auth';
import { onConfiguredOrigin } from '@/lib/auth/request';

/**
 * Thin shim: the OAuth routes, moved onto the origin `APP_ORIGIN` names.
 * See `@/lib/auth/request` for why that has to happen here, and why it has to
 * be a plain `Request` — Auth.js reads `url`, `headers` and `body` from it and
 * nothing else, but the handler signature asks for the fuller `NextRequest`.
 */
const onOrigin = (request: NextRequest) => onConfiguredOrigin(request) as NextRequest;

export const GET = (request: NextRequest) => handlers.GET(onOrigin(request));
export const POST = (request: NextRequest) => handlers.POST(onOrigin(request));
