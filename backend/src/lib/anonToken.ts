import { createHmac } from 'crypto';

/**
 * Generate a deterministic, UUID-shaped anonymous token for a user within a
 * given community scope (a course community or the general community).
 *
 * The same user + scope pair always produces the same token, so the same
 * ghost avatar identity is shown every time that user posts anonymously in
 * that community.
 *
 * Uses HMAC with a server-side secret salt so the token cannot be reversed
 * or correlated across scopes by anyone who knows the user id.
 */
export function generateAnonToken(userId: string, scopeId: string): string {
  const secret = process.env.ANON_TOKEN_SALT || process.env.SESSION_SECRET || 'change-me';
  const input = `${userId}:${scopeId}`;
  const hash = createHmac('sha256', secret).update(input).digest('hex');
  const raw = hash.slice(0, 32);

  // Insert hyphens to match the UUID v4 format: 8-4-4-4-12
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20, 32),
  ].join('-');
}
