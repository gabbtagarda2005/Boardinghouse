import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AdminLayout from './components/layout/AdminLayout';
import { Spinner } from './components/ui';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

const TenantAppPage = lazy(() => import('./pages/auth/TenantAppPage'));
// Public boarding-house pages (no sign-in): rooms, availability, inquiry.
const InquirePage = lazy(() => import('./pages/public/InquirePage'));
const PublicRoomPage = lazy(() => import('./pages/public/PublicRoomPage'));
const RoomInquiryPage = lazy(() => import('./pages/public/RoomInquiryPage'));

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const RoomsPage = lazy(() => import('./pages/rooms/RoomsPage'));
const RoomDetailPage = lazy(() => import('./pages/rooms/RoomDetailPage'));
const TenantsPage = lazy(() => import('./pages/tenants/TenantsPage'));
const TenantDetailPage = lazy(() => import('./pages/tenants/TenantDetailPage'));
const BillsPage = lazy(() => import('./pages/bills/BillsPage'));
const BillDetailPage = lazy(() => import('./pages/bills/BillDetailPage'));
const PaymentsPage = lazy(() => import('./pages/payments/PaymentsPage'));
const ElectricityPage = lazy(() => import('./pages/electricity/ElectricityPage'));
const AnnouncementsPage = lazy(() => import('./pages/announcements/AnnouncementsPage'));
const InquiriesPage = lazy(() => import('./pages/inquiries/InquiriesPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const ActivityHistoryPage = lazy(() => import('./pages/activity/ActivityHistoryPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RequireOwner({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Loading…" className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner className="min-h-dvh" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/tenant-app" element={<TenantAppPage />} />
        <Route path="/inquire" element={<InquirePage />} />
        <Route path="/inquire/rooms/:roomId" element={<PublicRoomPage />} />
        <Route path="/inquire/rooms/:roomId/inquire" element={<RoomInquiryPage />} />
        <Route
          element={
            <RequireOwner>
              <NotificationProvider>
                <AdminLayout />
              </NotificationProvider>
            </RequireOwner>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="rooms/:id" element={<RoomDetailPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:id" element={<TenantDetailPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="bills/:id" element={<BillDetailPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="electricity" element={<ElectricityPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="inquiries" element={<InquiriesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="activity" element={<ActivityHistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<Navigate to="/" replace />} />
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="activity-history" element={<Navigate to="/activity" replace />} />
          <Route path="billing/*" element={<Navigate to="/bills" replace />} />
          <Route path="audit-log" element={<Navigate to="/activity" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
