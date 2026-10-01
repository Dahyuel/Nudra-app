import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor';
  avatarUrl: string | null;
  grade: string | null;
};

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, role: 'student' | 'instructor') => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    role: 'student' | 'instructor',
    grade?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Only a 401 means "not logged in". Rate limits, network errors and 5xx are
    // transient, so retry with backoff instead of logging the user out.
    const restoreSession = async () => {
      const delays = [1000, 2000, 4000];
      for (let attempt = 0; ; attempt++) {
        try {
          const { data } = await api.get('/api/auth/me');
          if (active) setUser(data.user);
          break;
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || attempt >= delays.length) {
            if (active) setUser(null);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
          if (!active) return;
        }
      }
      if (active) setIsLoading(false);
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, role: 'student' | 'instructor') => {
      try {
        const { data } = await api.post('/api/auth/login', { email, password, role });
        setUser(data.user);
        navigate(data.user.role === 'instructor' ? '/instructor/dashboard' : '/dashboard');
      } catch (err: any) {
        throw new Error(err?.response?.data?.message || 'Login failed');
      }
    },
    [navigate]
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      role: 'student' | 'instructor',
      grade?: string
    ) => {
      try {
        const { data } = await api.post('/api/auth/register', {
          name,
          email,
          password,
          role,
          grade,
        });
        setUser(data.user);
        navigate(data.user.role === 'instructor' ? '/instructor/dashboard' : '/dashboard');
      } catch (err: any) {
        throw new Error(err?.response?.data?.message || 'Registration failed');
      }
    },
    [navigate]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      navigate('/login');
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
