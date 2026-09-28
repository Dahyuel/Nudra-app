import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const path = window.location.pathname;

    const url = error?.config?.url ?? '';
    const isAuthCheck = url.includes('/api/auth/me');

    if (status === 401 && !isAuthCheck && path !== '/login' && path !== '/register') {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
