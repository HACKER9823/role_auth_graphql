import 'dotenv/config';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { getUserFromHeader } from './auth.js';
import { seedAdmin } from './store.js';

await seedAdmin();

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: Number(process.env.PORT) || 4000 },
  context: async ({ req }) => ({ user: getUserFromHeader(req.headers.authorization) }),
});

console.log(`🚀 Server ready at ${url}`);
