import { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Loader2 } from 'lucide-react';
import App from '@/App';
import PrivateRoute from './PrivateRoute';
import ErrorBoundary from '@/components/common/ErrorBoundary';

// Reload once on chunk load failure (stale CloudFront deployment)
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      if (!sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
      }
      return new Promise(() => {});
    }),
  );
}

// ---------- Lazy Imports ----------

// Public
const Home = lazyWithRetry(() => import('@/pages/Home'));
const Login = lazyWithRetry(() => import('@/pages/Login'));
const Signup = lazyWithRetry(() => import('@/pages/Signup'));
const CodeEditor = lazyWithRetry(() => import('@/pages/CodeEditor'));
const NotFound = lazyWithRetry(() => import('@/pages/NotFound'));
const PendingVerification = lazyWithRetry(() => import('@/pages/PendingVerification'));
const CollegeUnderVerification = lazyWithRetry(() => import('@/pages/CollegeUnderVerification'));
const AuthCallback = lazyWithRetry(() => import('@/pages/AuthCallback'));
const SelectRole = lazyWithRetry(() => import('@/pages/SelectRole'));
const VerifyEmail = lazyWithRetry(() => import('@/pages/VerifyEmail'));
const ForgotPassword = lazyWithRetry(() => import('@/pages/ForgotPassword'));
const ForceChangePassword = lazyWithRetry(() => import('@/pages/ForceChangePassword'));

// Onboarding
const CollegeStep = lazyWithRetry(() => import('@/pages/onboarding/CollegeStep'));
const BatchStep = lazyWithRetry(() => import('@/pages/onboarding/BatchStep'));
const ProgramStep = lazyWithRetry(() => import('@/pages/onboarding/ProgramStep'));
const FacilitatorOnboarding = lazyWithRetry(
  () => import('@/pages/onboarding/FacilitatorOnboarding'),
);
const ConfirmStep = lazyWithRetry(() => import('@/pages/onboarding/ConfirmStep'));
const SuccessStep = lazyWithRetry(() => import('@/pages/onboarding/SuccessStep'));

// Student Dashboard
const StudentDashboardLayout = lazyWithRetry(
  () => import('@/layouts/StudentDashboardLayout'),
);
const StudentDashboardHome = lazyWithRetry(
  () => import('@/pages/dashboard/student/StudentDashboardHome'),
);
const MyCourses = lazyWithRetry(() => import('@/pages/dashboard/student/MyCourses'));
const LessonView = lazyWithRetry(() => import('@/pages/dashboard/student/Lesson'));
const AssignmentView = lazyWithRetry(
  () => import('@/pages/dashboard/student/AssignmentView'),
);
const CapstoneView = lazyWithRetry(
  () => import('@/pages/dashboard/student/CapstoneView'),
);
const CourseIntro = lazyWithRetry(() => import('@/pages/dashboard/student/CourseIntro'));
const CollegeAssignmentView = lazyWithRetry(
  () => import('@/pages/dashboard/student/CollegeAssignmentView'),
);
const EditorProfile = lazyWithRetry(() => import('@/pages/playground/EditorProfile'));
const Assignments = lazyWithRetry(() => import('@/pages/dashboard/student/Assignments'));
const Assistant = lazyWithRetry(() => import('@/pages/dashboard/student/Assistant'));
const Leaderboard = lazyWithRetry(() => import('@/pages/dashboard/student/Leaderboard'));
const StudentProfile = lazyWithRetry(
  () => import('@/pages/dashboard/student/StudentProfile'),
);
const StudentSettings = lazyWithRetry(
  () => import('@/pages/dashboard/student/StudentSettings'),
);
const ResumeBuilder = lazyWithRetry(
  () => import('@/pages/dashboard/student/ResumeBuilder'),
);
const StudentAnalytics = lazyWithRetry(
  () => import('@/pages/dashboard/student/StudentAnalytics'),
);
const CourseViewLayout = lazyWithRetry(() => import('@/layouts/CourseLayout'));

// Facilitator Dashboard
const FacilitatorDashboardLayout = lazyWithRetry(
  () => import('@/layouts/FacilitatorDashboardLayout'),
);
const FacilitatorHome = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorHome'),
);
const FacilitatorStudents = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorUsers'),
);
const FacilitatorEvaluations = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorEvaluations'),
);
const ResultsPage = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/ResultsPage'),
);
const FacilitatorAnalytics = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorAnalytics'),
);
const FacilitatorStudentGrowth = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorStudentGrowth'),
);
const FacilitatorReports = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorReports'),
);
const FacilitatorSettings = lazyWithRetry(
  () => import('@/pages/dashboard/facilitator/FacilitatorSettings'),
);

// Admin Dashboard
const AdminDashboardLayout = lazyWithRetry(
  () => import('@/layouts/AdminDashboardLayout'),
);
const AdminHome = lazyWithRetry(() => import('@/pages/dashboard/admin/AdminHome'));
const AdminColleges = lazyWithRetry(
  () => import('@/pages/dashboard/admin/AdminColleges'),
);
const AdminCourses = lazyWithRetry(() => import('@/pages/dashboard/admin/AdminCourses'));
const LearningFlow = lazyWithRetry(() => import('@/pages/dashboard/admin/LearningFlow'));
const LockControl = lazyWithRetry(() => import('@/pages/dashboard/admin/LockControl'));
const Students = lazyWithRetry(() => import('@/pages/dashboard/admin/Users'));
const Analytics = lazyWithRetry(() => import('@/pages/dashboard/admin/Analytics'));
const AdminSettings = lazyWithRetry(
  () => import('@/pages/dashboard/admin/AdminSettings'),
);
const AssignmentManagement = lazyWithRetry(
  () => import('@/pages/dashboard/admin/AssignmentManagement'),
);
const CreateAssignment = lazyWithRetry(
  () => import('@/pages/dashboard/admin/CreateAssignment'),
);
const AssignmentSuccess = lazyWithRetry(
  () => import('@/pages/dashboard/admin/AssignmentSuccess'),
);
const Evaluations = lazyWithRetry(
  () => import('@/pages/dashboard/admin/Evaluations'),
);
const AdminProfile = lazyWithRetry(
  () => import('@/pages/dashboard/admin/AdminProfile'),
);

// Curriculum Developer Dashboard
const CurriculumDeveloperDashboardLayout = lazyWithRetry(
  () => import('@/layouts/CurriculumDeveloperDashboardLayout'),
);

// AI Curriculum Builder (shared)
const AiCurriculumList = lazyWithRetry(
  () => import('@/pages/dashboard/shared/AiCurriculumList'),
);
const AiCurriculumBuilder = lazyWithRetry(
  () => import('@/pages/dashboard/shared/AiCurriculumBuilder'),
);
const AiCurriculumEditor = lazyWithRetry(
  () => import('@/pages/dashboard/shared/AiCurriculumEditor'),
);
const AiCurriculumReview = lazyWithRetry(
  () => import('@/pages/dashboard/shared/AiCurriculumReview'),
);
const AiCurriculumPreview = lazyWithRetry(
  () => import('@/pages/dashboard/shared/AiCurriculumPreview'),
);

// ---------- Router ----------

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'login', element: <Login /> },
      { path: 'signup', element: <Signup /> },
      { path: 'auth/callback', element: <AuthCallback /> },
      { path: 'auth/select-role', element: <SelectRole /> },
      { path: 'code-editor', element: <CodeEditor /> },
      { path: 'pending-verification', element: <PendingVerification /> },
      { path: 'college-under-verification', element: <CollegeUnderVerification /> },
      { path: 'verify-email', element: <VerifyEmail /> },
      { path: 'forgot-password', element: <ForgotPassword /> },

      {
        element: <PrivateRoute />,
        children: [
          { path: 'force-change-password', element: <ForceChangePassword /> },
          {
            path: 'onboarding',
            children: [
              { path: 'college', element: <CollegeStep /> },
              { path: 'batch', element: <BatchStep /> },
              { path: 'program', element: <ProgramStep /> },
              { path: 'facilitator', element: <FacilitatorOnboarding /> },
              { path: 'confirm', element: <ConfirmStep /> },
              { path: 'success', element: <SuccessStep /> },
            ],
          },
        ],
      },

      {
        element: <PrivateRoute allowedRoles={['student']} />,
        children: [
          {
            path: 'dashboard/student',
            element: <StudentDashboardLayout />,
            children: [
              { index: true, element: <StudentDashboardHome /> },
              { path: 'editor-profile', element: <EditorProfile /> },
              { path: 'assignments', element: <Assignments /> },
              { path: 'assignments/:id', element: <CollegeAssignmentView /> },
              { path: 'ai-assistant', element: <Assistant /> },
              { path: 'leaderboard', element: <Leaderboard /> },
              { path: 'profile', element: <StudentProfile /> },
              { path: 'settings', element: <StudentSettings /> },
              { path: 'analytics', element: <StudentAnalytics /> },
              { path: 'resume-builder', element: <ResumeBuilder /> },
              { path: 'courses', element: <MyCourses /> },
              {
                path: 'courses/:slug',
                element: <CourseViewLayout />,
                children: [
                  { index: true, element: <CourseIntro /> },
                  {
                    path: 'lesson/:subtopicSlug',
                    element: <LessonView />,
                  },
                  {
                    path: 'exercise/:exerciseId',
                    element: <LessonView />,
                  },
                  {
                    path: 'assignment/:assignmentId',
                    element: <AssignmentView />,
                  },
                  {
                    path: 'quiz/:quizId',
                    element: <LessonView />,
                  },
                  {
                    path: 'capstone/:projectId',
                    element: <CapstoneView />,
                  },
                ],
              },
            ],
          },
        ],
      },

      {
        element: <PrivateRoute allowedRoles={['facilitator']} />,
        children: [
          {
            path: 'dashboard/facilitator',
            element: <FacilitatorDashboardLayout />,
            children: [
              { index: true, element: <FacilitatorHome /> },
              { path: 'students', element: <FacilitatorStudents /> },
              { path: 'assignments', element: <AssignmentManagement /> },
              { path: 'create-assignment', element: <CreateAssignment /> },
              { path: 'assignment-success', element: <AssignmentSuccess /> },
              { path: 'evaluations', element: <FacilitatorEvaluations /> },
              { path: 'results/:id', element: <ResultsPage /> },

              { path: 'analytics', element: <FacilitatorAnalytics /> },
              { path: 'student-growth', element: <FacilitatorStudentGrowth /> },
              { path: 'reports', element: <FacilitatorReports /> },
              { path: 'settings', element: <FacilitatorSettings /> },
              { path: 'ai-curriculum', element: <AiCurriculumList /> },
              { path: 'ai-curriculum/new', element: <AiCurriculumBuilder /> },
              { path: 'ai-curriculum/:id/edit', element: <AiCurriculumEditor /> },
              { path: 'ai-curriculum/:id/preview', element: <AiCurriculumPreview /> },
              { path: 'ai-curriculum/:id/review', element: <AiCurriculumReview /> },
            ],
          },
        ],
      },

      {
        element: <PrivateRoute allowedRoles={['admin']} />,
        children: [
          {
            path: 'dashboard/admin',
            element: <AdminDashboardLayout />,
            children: [
              { index: true, element: <AdminHome /> },
              { path: 'colleges', element: <AdminColleges /> },
              { path: 'courses', element: <AdminCourses /> },
              { path: 'learning-flow', element: <LearningFlow /> },
              { path: 'lock-control', element: <LockControl /> },
              { path: 'users', element: <Students /> },
              { path: 'analytics', element: <Analytics /> },
              { path: 'settings', element: <AdminSettings /> },
              {
                path: 'assignment-management',
                element: <AssignmentManagement />,
              },
              {
                path: 'create-assignment',
                element: <CreateAssignment />,
              },
              {
                path: 'assignment-success',
                element: <AssignmentSuccess />,
              },
              { path: 'evaluations', element: <Evaluations /> },
              { path: 'results/:id', element: <ResultsPage /> },
              { path: 'profile', element: <AdminProfile /> },
              { path: 'ai-curriculum', element: <AiCurriculumList /> },
              { path: 'ai-curriculum/new', element: <AiCurriculumBuilder /> },
              { path: 'ai-curriculum/:id/edit', element: <AiCurriculumEditor /> },
              { path: 'ai-curriculum/:id/preview', element: <AiCurriculumPreview /> },
              { path: 'ai-curriculum/:id/review', element: <AiCurriculumReview /> },
            ],
          },
        ],
      },

      {
        element: <PrivateRoute allowedRoles={['curriculum_developer']} />,
        children: [
          {
            path: 'dashboard/curriculum-developer',
            element: <CurriculumDeveloperDashboardLayout />,
            children: [
              { index: true, element: <AiCurriculumList /> },
              { path: 'ai-curriculum', element: <AiCurriculumList /> },
              { path: 'ai-curriculum/new', element: <AiCurriculumBuilder /> },
              { path: 'ai-curriculum/:id/edit', element: <AiCurriculumEditor /> },
              { path: 'ai-curriculum/:id/preview', element: <AiCurriculumPreview /> },
              { path: 'ai-curriculum/:id/review', element: <AiCurriculumReview /> },
              { path: 'profile', element: <AdminProfile /> },
            ],
          },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);

const PageLoader = () => (
  <div className='flex h-screen items-center justify-center'>
    <Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
  </div>
);

// ---------- App Routes ----------

const AppRoutes = () => {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default AppRoutes;
