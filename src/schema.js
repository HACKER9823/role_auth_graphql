export const typeDefs = `#graphql
  enum Role {
    ADMIN
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
  }

  type Mutation {
    register(name: String!, email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    setUserRole(userId: ID!, role: Role!): User!
    deleteUser(userId: ID!): Boolean!
  }
    
`;
