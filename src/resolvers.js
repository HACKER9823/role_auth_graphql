import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { createUser, findByEmail, users } from './store.js';
import { signToken, requireAuth } from './auth.js';

const publicUser = ({ passwordHash, ...rest }) => rest;

const badInput = (msg) =>
  new GraphQLError(msg, { extensions: { code: 'BAD_USER_INPUT' } });

export const resolvers = {
  Query: {
    me: (_, __, ctx) => (ctx.user ? publicUser(ctx.user) : null),

    // Same query, different output depending on role.
    dashboard: (_, __, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === 'ADMIN') {
        return {
          role: user.role,
          message: `Welcome back, admin ${user.name}`,
          data: [`Total users: ${users.length}`, ...users.map((u) => `${u.email} (${u.role})`)],
        };
      }
      return {
        role: user.role,
        message: `Hello ${user.name}`,
        data: ['Your profile', 'Your activity'],
      };
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
      return { token: signToken(user), user: publicUser(user) };
    },

    login: async (_, { email, password }) => {
      const user = findByEmail(email);
      const ok = user && (await bcrypt.compare(password, user.passwordHash));
      if (!ok) {
        throw new GraphQLError('Invalid email or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return { token: signToken(user), user: publicUser(user) };
    },
  },
};
