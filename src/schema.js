export const typeDefs = `#graphql
  enum Role {
    ADMIN
    MANAGER
    DEV
    SUPPORT
    USER
  }

  type User {
    id: ID!
    name: String!
    email: String!
    role: Role!
  }

  type AuthPayload {
    token: String!
    refreshToken: String!
    user: User!
  }

  type Dashboard {
    role: Role!
    message: String!
    data: [String!]!
  }

  type Query {
    me: User
    dashboard: Dashboard!
    users: [User!]!
    systemInfo: SystemInfo!
  }

  type Mutation {
    register(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    setUserRole(userId: ID!, role: Role!): User!
    deleteUser(userId: ID!): Boolean!
    refreshToken(refreshToken: String!): AuthPayload!
    logout(refreshToken: String!): Boolean!
    unlockUser(email: String!): Boolean!
  }
    
  type SystemInfo {
    nodeVersion: String!
    uptimeSeconds: Int!
    totalUsers: Int!
  }

  `;