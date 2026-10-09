import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { InstructorLayout } from './layouts/InstructorLayout';
import { OrganizationLayout } from './layouts/OrganizationLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth, homePathFor } from './context/AuthContext';

const lazyNamed = (loader: () => Promise<unknown>, name: string) => React.lazy(async () => ({
  default: (await loader() as Record<string, React.ComponentType<any>>)[name],
}));

const DashboardPage = lazyNamed(() => import('./pages/DashboardPage'), 'DashboardPage');
const CatalogPage = lazyNamed(() => import('./pages/CatalogPage'), 'CatalogPage');
const AcademicHomePage = lazyNamed(() => import('./pages/AcademicPage'), 'AcademicHomePage');
const AcademicCatalogPage = lazyNamed(() => import('./pages/AcademicPage'), 'AcademicCatalogPage');
const OrganizationsDirectoryPage = lazyNamed(() => import('./pages/OrganizationsDirectoryPage'), 'OrganizationsDirectoryPage');
const OfflineBookingsPage = lazyNamed(() => import('./pages/OfflineBookingsPage'), 'OfflineBookingsPage');
const LearningPathPage = lazyNamed(() => import('./pages/LearningPathPage'), 'LearningPathPage');
const MyCoursesPage = lazyNamed(() => import('./pages/MyCoursesPage'), 'MyCoursesPage');
const CommunityPage = lazyNamed(() => import('./pages/CommunityPage'), 'CommunityPage');
const AiTutorPage = lazyNamed(() => import('./pages/AiTutorPage'), 'AiTutorPage');
const ProgressPage = lazyNamed(() => import('./pages/ProgressPage'), 'ProgressPage');
const SettingsPage = lazyNamed(() => import('./pages/SettingsPage'), 'SettingsPage');
const HelpPage = lazyNamed(() => import('./pages/HelpPage'), 'HelpPage');
const CourseDetailPage = lazyNamed(() => import('./pages/CourseDetailPage'), 'CourseDetailPage');
const VideoPlayerPage = lazyNamed(() => import('./pages/VideoPlayerPage'), 'VideoPlayerPage');
const ExamSimulatorPage = lazyNamed(() => import('./pages/ExamSimulatorPage'), 'ExamSimulatorPage');
const CourseCommunityPage = lazyNamed(() => import('./pages/CourseCommunityPage'), 'CourseCommunityPage');
const SanaweyaPage = lazyNamed(() => import('./pages/SanaweyaPage'), 'SanaweyaPage');
const SanaweyaCoursesPage = lazyNamed(() => import('./pages/SanaweyaCoursesPage'), 'SanaweyaCoursesPage');
const SanaweyaExamsPage = lazyNamed(() => import('./pages/SanaweyaExamsPage'), 'SanaweyaExamsPage');
const SanaweyaExamViewPage = lazyNamed(() => import('./pages/SanaweyaExamViewPage'), 'SanaweyaExamViewPage');
const LoginPage = lazyNamed(() => import('./pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./pages/RegisterPage'), 'RegisterPage');
const InstructorApplyPage = lazyNamed(() => import('./pages/InstructorApplyPage'), 'InstructorApplyPage');
const InstructorPendingPage = lazyNamed(() => import('./pages/InstructorPendingPage'), 'InstructorPendingPage');
const AdminDashboardPage = lazyNamed(() => import('./pages/admin/AdminDashboardPage'), 'AdminDashboardPage');
const ForgotPasswordPage = lazyNamed(() => import('./pages/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('./pages/ResetPasswordPage'), 'ResetPasswordPage');
const CheckoutTestPage = lazyNamed(() => import('./pages/CheckoutTestPage'), 'CheckoutTestPage');
const InstructorDashboardPage = lazyNamed(() => import('./pages/instructor/InstructorDashboardPage'), 'InstructorDashboardPage');
const InstructorCoursesPage = lazyNamed(() => import('./pages/instructor/InstructorCoursesPage'), 'InstructorCoursesPage');
const InstructorStudentsPage = lazyNamed(() => import('./pages/instructor/InstructorStudentsPage'), 'InstructorStudentsPage');
const InstructorEarningsPage = lazyNamed(() => import('./pages/instructor/InstructorEarningsPage'), 'InstructorEarningsPage');
const InstructorAnalyticsPage = lazyNamed(() => import('./pages/instructor/InstructorAnalyticsPage'), 'InstructorAnalyticsPage');
const UploadCoursePage = lazyNamed(() => import('./pages/instructor/UploadCoursePage'), 'UploadCoursePage');
const AdminOrganizationsPage = lazyNamed(() => import('./pages/OrganizationPages'), 'AdminOrganizationsPage');
const OrganizationManagerPage = lazyNamed(() => import('./pages/OrganizationPages'), 'OrganizationManagerPage');
const OrganizationPortalPage = lazyNamed(() => import('./pages/OrganizationPages'), 'OrganizationPortalPage');
const TenantLandingPage = lazyNamed(() => import('./pages/OrganizationPages'), 'TenantLandingPage');
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
    <React.Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#F8FAF9] text-sm font-medium text-gray-500">Loading Nudra…</div>}>
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
        <Route path="/academic" element={<AcademicHomePage />} />
        <Route path="/academic/:track" element={<AcademicCatalogPage />} />
        <Route path="/academic/:track/:itemId" element={<AcademicCatalogPage />} />
        <Route path="/organizations" element={<OrganizationsDirectoryPage />} />
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
          <Route element={<ProtectedRoute requiredRole="student" />}>
            <Route path="/bookings" element={<OfflineBookingsPage />} />
            <Route path="/learning-path" element={<LearningPathPage />} />
          </Route>
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
    </React.Suspense>
  );
}
