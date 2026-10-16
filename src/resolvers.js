import { GraphQLError } from 'graphql';
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
import { signToken, requireAuth, requirePermission } from './auth.js';
import { hashPassword, verifyPassword } from './password.js';
import { can, PERMISSIONS } from './permissions.js';
import {
  assertNotLimited,
  recordFailure,
  clearFailures,
  clearFailuresForEmail,
} from './rateLimit.js';

const publicUser = ({ passwordHash, ...rest }) => rest;

const badInput = (msg) =>
  new GraphQLError(msg, { extensions: { code: 'BAD_USER_INPUT' } });

const authPayload = async (user) => ({
  token: signToken(user),
  refreshToken: await createRefreshToken(user.id),
  user: publicUser(user),
});

export const resolvers = {
  Query: {
    me: (_, __, ctx) => (ctx.user ? publicUser(ctx.user) : null),

    // Same query, different output depending on role.
    dashboard: async (_, __, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === 'ADMIN') {
        const all = await getAllUsers();
        return {
          role: user.role,
          message: `Welcome back, admin ${user.name}`,
          data: [`Total users: ${all.length}`, ...all.map((u) => `${u.email} (${u.role})`)],
        };
      }
      if (user.role !== 'USER') {
        return {
          role: user.role,
          message: `Hello ${user.role.toLowerCase()} ${user.name}`,
          data: ['Your permissions:', ...PERMISSIONS[user.role]],
        };
      }
      return {
        role: user.role,
        message: `Hello ${user.name}`,
        data: ['Your profile', 'Your activity'],
      };
    },

    users: async (_, __, ctx) => {
      requirePermission(ctx, 'users:read');;
      return (await getAllUsers()).map(publicUser);
    },
    systemInfo: async (_, __, ctx) => {
      requirePermission(ctx, 'system:read');
      return {
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        totalUsers: (await getAllUsers()).length,
      };
    },
  },

  Mutation: {
    register: async (_, { name, email, password }) => {
      if (password.length < 8) throw badInput('Password must be at least 8 characters');
      if (name.length > 100 || email.length > 255) throw badInput('Name or email is too long');
      if (await findByEmail(email)) throw badInput('Email already registered');
      try {
        // Public signup always creates a USER. Admins are never self-assigned.
        const user = await createUser({
          name,
          email,
          passwordHash: await hashPassword(password),
          role: 'USER',
        });
        return authPayload(user);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') throw badInput('Email already registered');
        throw e;
      }
    },

    login: async (_, { email, password }, ctx) => {
      const key = `login:${ctx.ip}:${email.toLowerCase()}`;
      assertNotLimited(key);
      const user = await findByEmail(email);
      const ok = user && (await verifyPassword(password, user.passwordHash));
      if (!ok) {
        recordFailure(key);
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      clearFailures(key);
      return authPayload(user);
    },

    refreshToken: async (_, { refreshToken }) => {
      const user = await consumeRefreshToken(refreshToken);
      if (!user) {
        throw new GraphQLError('Invalid or expired refresh token', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return authPayload(user);
    },

    logout: async (_, { refreshToken }) => {
      await revokeRefreshToken(refreshToken);
      return true;
    },

    setUserRole: async (_, { userId, role }, ctx) => {
      const actor = requirePermission(ctx, 'users:setRole');
      if (actor.id === userId) throw badInput("You can't change your own role");
      const target = await findById(userId);
      if (!target) throw badInput('User not found');
      // Only roles with admin:assign may grant or remove ADMIN.
      if ((role === 'ADMIN' || target.role === 'ADMIN') && !can(actor, 'admin:assign')) {
        throw new GraphQLError('Only an admin can grant or remove the ADMIN role', {
          extensions: { code: 'FORBIDDEN', http: { status: 403 } },
        });
      }
      return publicUser(await updateRole(userId, role));
    },

    deleteUser: async (_, { userId }, ctx) => {
      const admin = requirePermission(ctx, 'users:delete');
      if (admin.id === userId) throw badInput("You can't delete yourself");
      if (!(await deleteUserById(userId))) throw badInput('User not found');
      return true;
    },
    unlockUser: async (_, { email }, ctx) => {
      requirePermission(ctx, 'users:unlock');
      clearFailuresForEmail(email);
      return true;
    },
  },
};