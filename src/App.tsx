import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { InstructorLayout } from './layouts/InstructorLayout';
import { OrganizationLayout } from './layouts/OrganizationLayout';
import { DashboardPage } from './pages/DashboardPage';
import { CatalogPage } from './pages/CatalogPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { CommunityPage } from './pages/CommunityPage';
import { AiTutorPage } from './pages/AiTutorPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { VideoPlayerPage } from './pages/VideoPlayerPage';
import { ExamSimulatorPage } from './pages/ExamSimulatorPage';
import { CourseCommunityPage } from './pages/CourseCommunityPage';
import { SanaweyaPage } from './pages/SanaweyaPage';
import { SanaweyaCoursesPage } from './pages/SanaweyaCoursesPage';
import { SanaweyaExamsPage } from './pages/SanaweyaExamsPage';
import { SanaweyaExamViewPage } from './pages/SanaweyaExamViewPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InstructorApplyPage } from './pages/InstructorApplyPage';
import { InstructorPendingPage } from './pages/InstructorPendingPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { CheckoutTestPage } from './pages/CheckoutTestPage';
import { InstructorDashboardPage } from './pages/instructor/InstructorDashboardPage';
import { InstructorCoursesPage } from './pages/instructor/InstructorCoursesPage';
import { InstructorStudentsPage } from './pages/instructor/InstructorStudentsPage';
import { InstructorEarningsPage } from './pages/instructor/InstructorEarningsPage';
import { InstructorAnalyticsPage } from './pages/instructor/InstructorAnalyticsPage';
import { UploadCoursePage } from './pages/instructor/UploadCoursePage';
import { AdminOrganizationsPage, OrganizationManagerPage, OrganizationPortalPage, TenantLandingPage } from './pages/OrganizationPages';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth, homePathFor } from './context/AuthContext';

const OrganizationLandingEditor = React.lazy(() => import('./pages/OrganizationLandingEditor'));

const FallbackRedirect: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
        <div className="w-10 h-10 rounded-full border-4 border-[#B7E4C7] border-t-[#2D6A4F] animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(user)} replace />;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
        <div className="w-10 h-10 rounded-full border-4 border-[#B7E4C7] border-t-[#2D6A4F] animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  return <>{children}</>;
};

const DashboardShell: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.organizationContext && user.role === 'student' &&
      !location.pathname.startsWith('/organization') && !location.pathname.startsWith('/course/') &&
      !['/settings', '/help'].includes(location.pathname)) {
    return <Navigate to="/organization" replace />;
  }
  if (!user) return <Outlet />;
  if (user.mustChangePassword && location.pathname !== '/settings') return <Navigate to="/settings?change-password=1" replace />;
  return user.organizationContext && user.role === 'student' ? <OrganizationLayout /> : <DashboardLayout />;
};

const StudentPortalLayout: React.FC = () => {
  const { user } = useAuth();
  return user?.organizationContext && user.role === 'student' ? <OrganizationLayout /> : <DashboardLayout />;
};

export default function App() {
  return (
    <Routes>
      {/* Landing/Hero Page */}
      <Route path="/" element={<TenantLandingPage />} />

      {/* Authentication Pages */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      {/* Password reset (the reset page works signed in or out: the link comes from email) */}
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Teachers apply here; accounts start pending until approved */}
      <Route
        path="/teach"
        element={
          <PublicOnlyRoute>
            <InstructorApplyPage />
          </PublicOnlyRoute>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/instructor/pending" element={<InstructorPendingPage />} />
        <Route path="/checkout/test/:orderId" element={<CheckoutTestPage />} />
      </Route>

      {/* Admin console (accounts created with `npm run admin`) */}
      <Route element={<ProtectedRoute requiredRole="admin" />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/organizations" element={<AdminOrganizationsPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<OrganizationLayout />}>
          <Route path="/organization" element={<OrganizationPortalPage />} />
          <Route path="/organization/manage" element={<OrganizationManagerPage />} />
          <Route path="/organization/landing-page" element={<React.Suspense fallback={<div className="p-8 text-gray-500">Loading editor…</div>}><OrganizationLandingEditor /></React.Suspense>} />
        </Route>
      </Route>

      {/* Public pages that render inside the dashboard shell when logged in, standalone otherwise */}
      <Route element={<DashboardShell />}>
        <Route path="/browse" element={<CatalogPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/course/:id" element={<CourseDetailPage />} />
        <Route path="/sanaweya/courses" element={<SanaweyaCoursesPage />} />
        <Route path="/sanaweya/exams" element={<SanaweyaExamsPage />} />
        <Route path="/sanaweya/exams/:examId" element={<SanaweyaExamViewPage />} />
      </Route>

      {/* Student App (students + instructors using student portal) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<StudentPortalLayout />}>
          <Route path="/student-portal" element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sanaweya" element={<SanaweyaPage />} />
          <Route path="/my-courses" element={<MyCoursesPage />} />
          <Route path="/ai-tutor" element={<AiTutorPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/exam-simulator" element={<ExamSimulatorPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Deep Course Experience Pages */}
          <Route path="/course/:id/lesson/:lessonId" element={<VideoPlayerPage />} />
          <Route path="/course/:id/community" element={<CourseCommunityPage />} />
        </Route>
      </Route>

      {/* Instructor Studio App within Instructor Layout */}
      <Route element={<ProtectedRoute requiredRole="instructor" />}>
        <Route path="/instructor" element={<InstructorLayout />}>
          <Route index element={<Navigate to="/instructor/dashboard" replace />} />
          <Route path="dashboard" element={<InstructorDashboardPage />} />
          <Route path="courses" element={<InstructorCoursesPage />} />
          <Route path="upload" element={<UploadCoursePage />} />
          <Route path="students" element={<InstructorStudentsPage />} />
          <Route path="earnings" element={<InstructorEarningsPage />} />
          <Route path="analytics" element={<InstructorAnalyticsPage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  );
}
