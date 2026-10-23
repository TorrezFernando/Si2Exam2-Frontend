// Environments for development and production
// In development, point to the local FastAPI server
export const environment = {
  production: false,
  quickLogin: {
    admin: { email: 'admin@fashionstore.com', password: 'Admin@1234' },
    superadmin: { email: 'superadmin@fashionstore.com', password: 'SuperAdmin@1234' }
  },
  apiUrl: 'http://localhost:8000/api/v1'
};
