export const environment = {
  production: true,
  quickLogin: undefined as { admin: { email: string; password: string }; superadmin: { email: string; password: string } } | undefined,
  apiUrl: '/api/v1'
};
