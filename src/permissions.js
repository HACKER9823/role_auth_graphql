export const PERMISSIONS = {
  ADMIN: ['users:read', 'users:setRole', 'users:delete', 'users:unlock', 'system:read', 'admin:assign'],
  MANAGER: ['users:read', 'users:setRole', 'users:unlock', 'system:read'],
  DEV: ['users:read', 'system:read'],
  SUPPORT: ['users:read', 'users:unlock'],
  USER: [],
};

export const can = (user, permission) =>
  PERMISSIONS[user.role]?.includes(permission) ?? false;