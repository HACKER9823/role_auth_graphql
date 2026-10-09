import 'dotenv/config';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { getUserFromHeader } from './auth.js';
import { seedAdmin } from './store.js';

await seedAdmin();

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.INTROSPECTION === 'true' || process.env.NODE_ENV !== 'production',
});

const { url } = await startStandaloneServer(server, {
  listen: { port: Number(process.env.PORT) || 4000 },
  context: async ({ req }) => ({
    user: getUserFromHeader(req.headers.authorization),
    ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
  }),
});

console.log(`🚀 Server ready at ${url}`);