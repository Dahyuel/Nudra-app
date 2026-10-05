import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const host = window.location.hostname.toLowerCase();
  const orgSlug = new URLSearchParams(window.location.search).get('org');
  if (orgSlug && /^[a-z0-9-]+$/.test(orgSlug)) config.headers.set('X-Organization-Slug', orgSlug);
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== 'nudra.org' && host !== 'www.nudra.org') {
    config.headers.set('X-Organization-Host', host);
  }
  return config;
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
