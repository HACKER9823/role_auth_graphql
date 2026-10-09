import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { assertNotLimited, recordFailure, clearFailures } from './rateLimit.js';
import {
  createUser,
  findByEmail,
  findById,
  getAllUsers,
  updateRole,
  deleteUserById,
  createRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from './store.js';
import { signToken, requireAuth, requireRole } from './auth.js';

const publicUser = ({ passwordHash, ...rest }) => rest;

const badInput = (msg) =>
  new GraphQLError(msg, { extensions: { code: 'BAD_USER_INPUT' } });

const authPayload = (user) => ({
  token: signToken(user),
  refreshToken: createRefreshToken(user.id),
  user: publicUser(user),
});

export const resolvers = {
  Query: {
    me: (_, __, ctx) => (ctx.user ? publicUser(ctx.user) : null),

    // Same query, different output depending on role.
    dashboard: (_, __, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === 'ADMIN') {
        const all = getAllUsers();
        return {
          role: user.role,
          message: `Welcome back, admin ${user.name}`,
          data: [`Total users: ${all.length}`, ...all.map((u) => `${u.email} (${u.role})`)],
        };
      }
      return {
        role: user.role,
        message: `Hello ${user.name}`,
        data: ['Your profile', 'Your activity'],
      };
    },

    users: (_, __, ctx) => {
      requireRole(ctx, 'ADMIN');
      return getAllUsers().map(publicUser);
    },
  },

  Mutation: {
    register: async (_, { name, email, password }) => {
      if (password.length < 8) throw badInput('Password must be at least 8 characters');
      if (findByEmail(email)) throw badInput('Email already registered');
      // Public signup always creates a USER. Admins are never self-assigned.
      const user = createUser({
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'USER',
      });
      return authPayload(user);
    },

    login: async (_, { email, password }, ctx) => {
      const key = `login:${ctx.ip}:${email.toLowerCase()}`;
      assertNotLimited(key);
      const user = findByEmail(email);
      const ok = user && (await bcrypt.compare(password, user.passwordHash));
      if (!ok) {
        recordFailure(key);
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      clearFailures(key);
      return authPayload(user);
    },

    refreshToken: (_, { refreshToken }) => {
      const user = consumeRefreshToken(refreshToken);
      if (!user) {
        throw new GraphQLError('Invalid or expired refresh token', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return authPayload(user);
    },

    logout: (_, { refreshToken }) => {
      revokeRefreshToken(refreshToken);
      return true;
    },

    setUserRole: (_, { userId, role }, ctx) => {
      const admin = requireRole(ctx, 'ADMIN');
      if (admin.id === userId) throw badInput("You can't change your own role");
      if (!findById(userId)) throw badInput('User not found');
      return publicUser(updateRole(userId, role));
    },

    deleteUser: (_, { userId }, ctx) => {
      const admin = requireRole(ctx, 'ADMIN');
      if (admin.id === userId) throw badInput("You can't delete yourself");
      if (!deleteUserById(userId)) throw badInput('User not found');
      return true;
    },
  },
};