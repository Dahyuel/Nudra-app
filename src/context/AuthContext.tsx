import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'instructor' | 'admin' | 'organization_manager';
  avatarUrl: string | null;
  grade: string | null;
  /** Instructor approval state; null for students and legacy/seeded instructors. */
  instructorStatus: 'pending' | 'approved' | 'rejected' | null;
  mustChangePassword: boolean;
  organizationContext?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
    membership: { id: string; role: string; status: string } | null;
  };
  /** Saved from the Settings page. */
  preferences?: { language: 'en' | 'ar'; notifyCommunity: boolean; notifySessions: boolean };
};

export type InstructorApplicationInput = {
  name: string;
  email: string;
  password: string;
  subjects: string;
  experienceYears: number;
  bio: string;
  portfolioUrl?: string;
};

export const isApprovedInstructor = (user: User) =>
  user.role === 'instructor' && (user.instructorStatus === null || user.instructorStatus === 'approved');

/** Where a signed-in user belongs by default. */
/** Turn an auth request error into a message that says what actually went wrong. */
const authErrorMessage = (err: any, fallback: string) => {
  // No HTTP response at all: backend down, wrong port, or CORS blocked the request.
  if (!err?.response) {
    return "Can't reach the Nudra server. Make sure the backend is running, then try again.";
  }
  return err.response.data?.message || `${fallback} (error ${err.response.status})`;
};

export const homePathFor = (user: User) => {
  if (user.organizationContext) {
    const membership = user.organizationContext.membership;
    const organizationQuery = `?org=${encodeURIComponent(user.organizationContext.slug)}`;
    if (membership?.status === 'active' && membership.role === 'organization_manager') return `/organization/manage${organizationQuery}`;
    if (membership?.status === 'active' && membership.role === 'instructor' && isApprovedInstructor(user)) return `/instructor/dashboard${organizationQuery}`;
    return `/organization${organizationQuery}`;
  }
  if (user.role === 'admin') return '/admin';
  if (user.role !== 'instructor') return '/dashboard';
  return isApprovedInstructor(user) ? '/instructor/dashboard' : '/instructor/pending';
};

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, grade?: string) => Promise<void>;
  applyToTeach: (input: InstructorApplicationInput) => Promise<void>;
  refreshUser: () => Promise<User | null>;
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

  // The server knows each account's role, so login needs no role picker.
  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { data } = await api.post('/api/auth/login', { email, password });
        setUser(data.user);
        navigate(homePathFor(data.user));
      } catch (err: any) {
        throw new Error(authErrorMessage(err, 'Login failed'));
      }
    },
    [navigate]
  );

  // Public sign-up creates students only; teachers use applyToTeach.
  const register = useCallback(
    async (name: string, email: string, password: string, grade?: string) => {
      try {
        const { data } = await api.post('/api/auth/register', { name, email, password, grade });
        setUser(data.user);
        navigate(homePathFor(data.user));
      } catch (err: any) {
        throw new Error(authErrorMessage(err, 'Registration failed'));
      }
    },
    [navigate]
  );

  const applyToTeach = useCallback(
    async (input: InstructorApplicationInput) => {
      try {
        const { data } = await api.post('/api/auth/register-instructor', input);
        setUser(data.user);
        navigate(homePathFor(data.user));
      } catch (err: any) {
        const fieldErrors = err?.response?.data?.errors as Record<string, string[]> | undefined;
        const firstFieldError = fieldErrors && Object.entries(fieldErrors).find(([, msgs]) => msgs?.length);
        throw new Error(
          firstFieldError
            ? `${firstFieldError[0]}: ${firstFieldError[1][0]}`
            : authErrorMessage(err, 'Application failed')
        );
      }
    },
    [navigate]
  );

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      setUser(data.user);
      return data.user as User;
    } catch {
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      navigate('/login');
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, applyToTeach, refreshUser, logout }}>
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
