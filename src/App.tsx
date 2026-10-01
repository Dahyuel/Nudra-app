import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { InstructorLayout } from './layouts/InstructorLayout';
import { LandingPage } from './pages/LandingPage';
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
import { InstructorDashboardPage } from './pages/instructor/InstructorDashboardPage';
import { InstructorCoursesPage } from './pages/instructor/InstructorCoursesPage';
import { InstructorStudentsPage } from './pages/instructor/InstructorStudentsPage';
import { InstructorEarningsPage } from './pages/instructor/InstructorEarningsPage';
import { InstructorAnalyticsPage } from './pages/instructor/InstructorAnalyticsPage';
import { UploadCoursePage } from './pages/instructor/UploadCoursePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth, homePathFor } from './context/AuthContext';

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
  return user ? <DashboardLayout /> : <Outlet />;
};

export default function App() {
  return (
    <Routes>
      {/* Landing/Hero Page */}
      <Route path="/" element={<LandingPage />} />

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
      </Route>

      {/* Admin console (accounts created with `npm run admin`) */}
      <Route element={<ProtectedRoute requiredRole="admin" />}>
        <Route path="/admin" element={<AdminDashboardPage />} />
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
        <Route element={<DashboardLayout />}>
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