import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import { findById } from './store.js';
import { can } from './permissions.js';

const secret = () => process.env.JWT_SECRET || 'dev-secret';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// Reads "Authorization: Bearer <token>" and returns the user, or null.
export async function getUserFromHeader(header) {
  if (!header?.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = jwt.verify(header.slice(7), secret());
  } catch {
    return null; // bad or expired token
  }
  return (await findById(payload.sub)) || null;
}

export function requireAuth(ctx) {
  if (!ctx.user) {
    throw new GraphQLError('You must be logged in', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
  return ctx.user;
}

export function requireRole(ctx, ...roles) {
  const user = requireAuth(ctx);
  if (!roles.includes(user.role)) {
    throw new GraphQLError('You are not allowed to do this', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    });
  }
  return user;
}

export function requirePermission(ctx, permission) {
  const user = requireAuth(ctx);
  if (!can(user, permission)) {
    throw new GraphQLError('You are not allowed to do this', {
      extensions: { code: 'FORBIDDEN', http: { status: 403 } },
    });
  }
  return user;
}