import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "../pages/auth/LoginPage.jsx";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage.jsx";
import DashboardPage from "../pages/student/DashboardPage.jsx";
import LabsPage from "../pages/student/LabsPage.jsx";
import LabWorkspacePage from "../pages/student/LabWorkspacePage.jsx";
import HistoryPage from "../pages/student/HistoryPage.jsx";
import HistoryLabPage from "../pages/student/HistoryLabPage.jsx";
import GradesPage from "../pages/student/GradesPage.jsx";
import UserManagementPage from "../pages/admin/UserManagementPage.jsx";
import CourseManagementPage from "../pages/admin/CourseManagementPage.jsx";
import DepartmentSettingsPage from "../pages/admin/DepartmentSettingsPage.jsx";
import SystemSettingsPage from "../pages/admin/SystemSettingsPage.jsx";
import SystemMonitorPage from "../pages/admin/SystemMonitorPage.jsx";
import AnalyticsDashboardPage from "../pages/admin/AnalyticsDashboardPage.jsx";
import SecurityAccessPage from "../pages/admin/SecurityAccessPage.jsx";
import BackupRecoveryPage from "../pages/admin/BackupRecoveryPage.jsx";
import ReferenceSolutionsPage from "../pages/student/ReferenceSolutionsPage.jsx";
import LabsManagementPage from "../pages/instructor/LabsManagementPage.jsx";
import CreateLabPage from "../pages/instructor/CreateLabPage.jsx";
import SubmissionsPage from "../pages/instructor/SubmissionsPage.jsx";
import GradingPage from "../pages/instructor/GradingPage.jsx";
import AnalyticsPage from "../pages/instructor/AnalyticsPage.jsx";
import PlagiarismPage from "../pages/instructor/PlagiarismPage.jsx";
import InstructorCoursesPage from "../pages/instructor/InstructorCoursesPage.jsx";
import InstructorStudentsPage from "../pages/instructor/InstructorStudentsPage.jsx";
import InstructorSettingsPage from "../pages/instructor/InstructorSettingsPage.jsx";

import PeerReviewsPage from "../pages/student/PeerReviewsPage.jsx";
import AssignedReviewPage from "../pages/student/AssignedReviewPage.jsx";
import ReceivedReviewPage from "../pages/student/ReceivedReviewPage.jsx";
function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/labs" element={<LabsPage />} />
        <Route path="/labs/:labId" element={<LabWorkspacePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:labId" element={<HistoryLabPage />} />
        <Route path="/peer-review" element={<PeerReviewsPage />} />
        <Route
          path="/peer-reviews/assigned/:reviewId"
          element={<AssignedReviewPage />}
        />
        <Route
          path="/peer-reviews/received/:reviewId"
          element={<ReceivedReviewPage />}
        />
        <Route path="/grades" element={<GradesPage />} />
        <Route path="/solutions" element={<ReferenceSolutionsPage />} />
        <Route path="/admin/users" element={<UserManagementPage />} />
        <Route path="/admin/courses" element={<CourseManagementPage />} />
        <Route path="/admin/departments" element={<DepartmentSettingsPage />} />
        <Route path="/admin/settings" element={<SystemSettingsPage />} />
        <Route path="/admin/monitor" element={<SystemMonitorPage />} />
        <Route path="/admin/analytics" element={<AnalyticsDashboardPage />} />
        <Route path="/admin/security" element={<SecurityAccessPage />} />
        <Route path="/admin/backup" element={<BackupRecoveryPage />} />
        {/* Instructor routes */}
        <Route path="/instructor/labs" element={<LabsManagementPage />} />
        <Route path="/instructor/labs/create" element={<CreateLabPage />} />
        <Route path="/instructor/labs/:labId/edit" element={<CreateLabPage />} />
        <Route path="/instructor/labs/:labId/submissions" element={<SubmissionsPage />} />
        <Route path="/instructor/labs/:labId/submissions/:subId/grade" element={<GradingPage />} />
        <Route path="/instructor/analytics" element={<AnalyticsPage />} />
        <Route path="/instructor/labs/:labId/plagiarism" element={<PlagiarismPage />} />
        <Route path="/instructor/courses" element={<InstructorCoursesPage />} />
        <Route path="/instructor/students" element={<InstructorStudentsPage />} />
        <Route path="/instructor/settings" element={<InstructorSettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
