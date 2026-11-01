// frontend/src/App.js
import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';

// CSS das bandeiras aqui
import 'flag-icons/css/flag-icons.min.css';
import { UserProvider, useUser } from './contexts/UserContext';
import { NotificationProvider, useNotification } from './contexts/NotificationContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { MaterialViewerProvider, useMaterialViewer } from './contexts/MaterialViewerContext';
import { getChatSessions, updateUserPreferences } from './api';
import SessionManager from './components/shared/SessionManager';
import SideBar from './components/shared/SideBar';
import MaterialViewerHost from './components/academic/MaterialViewerHost';
import DNALoadingAnimation from './components/shared/DNALoadingAnimation';
import './global.css';
import { useTranslation } from 'react-i18next';
import ScrollToTop from './components/shared/ScrollToTop';
import VerificationBanner from './components/shared/VerificationBanner';
import ErrorBoundary from './components/shared/ErrorBoundary';
import CookieConsent from './components/common/CookieConsent';
import OfflineBanner from './components/common/OfflineBanner';

// Core routes (loaded eagerly for fast initial load)
import LandingPage from './components/landing/LandingPage';
import Login from './components/user/Login';
import Register from './components/user/Register';
import ForgotPassword from './components/user/ForgotPassword';
import ResetPassword from './components/user/ResetPassword';

// Lazy loaded routes (loaded on-demand)
const ConsultationManager = lazy(() => import('./components/consultation/ConsultationManager'));
const Chat = lazy(() => import('./components/copilot/Chat'));
const AcademicManager = lazy(() => import('./components/academic/AcademicManager'));
const PharmacyManager = lazy(() => import('./components/pharmacy/PharmacyManager'));
const Profile = lazy(() => import('./components/user/Profile'));
const DracmaPurchase = lazy(() => import('./components/billing/DracmaPurchase'));
const PricingPage = lazy(() => import('./components/billing/PricingPage'));
const VerificationStatus = lazy(() => import('./components/user/VerificationStatus'));
const WaitlistPage = lazy(() => import('./components/user/WaitlistPage'));
const OnboardingPage = lazy(() => import('./components/user/OnboardingPage'));

// Public pages (no auth)
const PublicPrescription = lazy(() => import('./components/pharmacy/PublicPrescription'));

// Legal pages (rarely visited)
const PrivacyPolicy = lazy(() => import('./components/legal/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./components/legal/TermsOfUse'));
const DPO = lazy(() => import('./components/legal/DPO'));
const Subprocessors = lazy(() => import('./components/legal/Subprocessors'));
const PatientNotice = lazy(() => import('./components/legal/PatientNotice'));
const Contact = lazy(() => import('./components/contact/Contact'));
const Careers = lazy(() => import('./components/careers/Careers'));
const BenchmarkPage = lazy(() => import('./components/benchmark/BenchmarkPage'));
const TestDNALoading = lazy(() => import('./components/shared/TestDNALoading'));
const QythonTour = lazy(() => import('./components/shared/QythonTour'));
import { consultationTourSteps, handleConsultationStepChange, copilotTourSteps, academicTourSteps, profileTourSteps, handleProfileStepChange } from './components/shared/tourConfigs';

// Admin routes (only for admins)
const AdminRoute = lazy(() => import('./components/admin/AdminRoute'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const AdminSettings = lazy(() => import('./components/admin/AdminSettings'));
const UserManager = lazy(() => import('./components/admin/UserManager'));
const AdminConsultations = lazy(() => import('./components/admin/AdminConsultations'));
const AdminFinance = lazy(() => import('./components/admin/AdminFinance'));
const ProfileUpdateManager = lazy(() => import('./components/admin/ProfileUpdateManager'));
const PharmacyAdmin = lazy(() => import('./components/admin/PharmacyAdmin'));
const AnalyticsDashboard = lazy(() => import('./components/admin/AnalyticsDashboard'));

// Loading fallback component
const PageLoader = () => <DNALoadingAnimation />;

const ProtectedRoute = ({ isLoggedIn, initialCheckComplete, children }) => {
  const { user } = useUser();
  const location = useLocation();

  if (!initialCheckComplete) {
    return <DNALoadingAnimation />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // LÓGICA DE WAITLIST: Usuários na waitlist só podem ver /waitlist
  if (user?.status === 'waitlist') {
    if (location.pathname === '/waitlist') {
      return children;
    }
    return <Navigate to="/waitlist" replace />;
  }

  // ONBOARDING GATE: um usuário ativo que ainda NÃO concluiu o onboarding é roteado
  // pra lá uma vez (é pulável). Pega qualquer caminho de ativação (convite no cadastro,
  // ativação na waitlist OU convite pelo admin, que entra já 'active'). Só dispara com
  // `false` EXPLÍCITO do backend — payloads antigos sem o campo (undefined) não disparam,
  // evitando loop de redirect. As próprias páginas do fluxo passam direto.
  const onboardingPaths = ['/onboarding', '/pricing'];
  if (
    user?.status === 'active' &&
    user?.onboarding_completed === false &&
    !onboardingPaths.includes(location.pathname)
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  // Usuário ativo (já onboarded) não fica preso na /waitlist
  if (user?.status === 'active' && location.pathname === '/waitlist') {
    return <Navigate to="/copilot" replace />;
  }

  return children;
};

const AppLayoutAndRoutes = () => {
  const { t } = useTranslation();
  const { user, setUser, isLoading: isUserLoading } = useUser();
  const { setTheme } = useTheme();
  const { addNotification } = useNotification();
  const { loadUserLanguage, currentLanguage } = useLanguage();
  // Só o overlay do visualizador persistente (Produtor de Materiais) libera a barra lateral
  // por cima; ver classe `viewer-active` abaixo e a nota no global.css. `expandedId` = há um
  // material em tela cheia (dock com uma expandida por vez).
  const { expandedId } = useMaterialViewer();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  const fetchChatSessions = useCallback(async () => {
    if (isLoggedIn) {
      try {
        const sessions = await getChatSessions();
        setChatSessions(sessions.map(s => ({ ...s, isNew: false })));
      } catch (error) {
        console.error("Failed to fetch chat sessions:", error);
      }
    }
  }, [isLoggedIn]);

  const handleSessionAnimationEnd = (sessionId) => {
    setChatSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === sessionId ? { ...session, isNew: false } : session
      )
    );
  };

  const handleNewChatCreated = (newId, title) => {
    setChatSessions(prevSessions => [{ id: newId, title: title, isNew: true }, ...prevSessions]);
    setActiveChatId(newId);
  };

  const handleTitleUpdate = (sessionId, newTitle) => {
    setChatSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === sessionId ? { ...session, title: newTitle, isNew: false } : session
      )
    );
  };

  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('authToken');
    setUser(null);
    setIsLoggedIn(false);
    setChatSessions([]);
    setActiveChatId(null);
    addNotification(t('logoutSuccess'), 'success');
    navigate('/login');
  }, [setUser, addNotification, t, navigate]);

  useEffect(() => {
    fetchChatSessions();
  }, [fetchChatSessions]);

  const location = useLocation();
  const workspaceRoutes = ['/consultation-manager', '/copilot', '/academic', '/profile', '/pharmacy'];
  const isWorkspaceRoute = workspaceRoutes.some(route => location.pathname.startsWith(route));
  // Overlay do material só bloqueia a barra lateral quando está EXPANDIDO e no /academic
  // (fora dali tudo é pílula, sem overlay). Aí elevamos a barra por cima (classe viewer-active).
  const materialOverlayOpen = expandedId != null && location.pathname.startsWith('/academic');

  const handleInitialCheckComplete = useCallback(() => {
    setInitialCheckComplete(true);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const sidebarOpenWidth = 220;
  const sidebarClosedWidth = 80;

  useEffect(() => {
    if (!isUserLoading && user) {
      if (user.theme_preference) {
        setTheme(user.theme_preference);
      }
      if (user.language_preference) {
        loadUserLanguage(user.language_preference);
      }
    }
  }, [user, isUserLoading, setTheme, loadUserLanguage]);

  useEffect(() => {
    if (user && currentLanguage) {
      const langCode = currentLanguage.split('-')[0];
      if (user.language_preference !== langCode) {
        updateUserPreferences({ language_preference: langCode })
          .catch(err => console.error("Failed to sync language to backend:", err));
      }
    }
  }, [currentLanguage, user]);

  return (
    <>
      <OfflineBanner />
      <ScrollToTop />
      <SessionManager setIsLoggedIn={setIsLoggedIn} onInitialCheckComplete={handleInitialCheckComplete} />
      <VerificationBanner />
      {/* Contextual Tours - only mount tour for current route (performance optimization) */}
      {isLoggedIn && location.pathname === '/consultation-manager' && (
        <QythonTour
          tourId="consultation"
          route="/consultation-manager"
          steps={consultationTourSteps}
          onStepChange={handleConsultationStepChange}
          skipScrollSteps={['editor']}
        />
      )}
      {isLoggedIn && location.pathname === '/copilot' && (
        <QythonTour
          tourId="copilot"
          route="/copilot"
          steps={copilotTourSteps}
        />
      )}
      {isLoggedIn && location.pathname === '/academic' && (
        <QythonTour
          tourId="academic"
          route="/academic"
          steps={academicTourSteps}
        />
      )}
      {isLoggedIn && location.pathname === '/profile' && (
        <QythonTour
          tourId="profile"
          route="/profile"
          steps={profileTourSteps}
          onStepChange={handleProfileStepChange}
        />
      )}
      <div className="app-container dark-theme">
        {isLoggedIn && isWorkspaceRoute && (
          <div
            className={`sidebar-app-container ${isSidebarOpen ? 'open' : 'closed'} ${materialOverlayOpen ? 'viewer-active' : ''}`}
            onMouseEnter={() => setIsSidebarOpen(true)}
            onMouseLeave={() => setIsSidebarOpen(false)}
          >
            <SideBar onLogout={handleLogout} isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
          </div>
        )}
        <div className="main-content-area">
          <div style={{ minHeight: location.pathname === '/' ? '300vh' : 'auto' }}>
            <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Core routes (eagerly loaded) */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
                <Route path="/register" element={<Register setIsLoggedIn={setIsLoggedIn} />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Legal routes (lazy) */}
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-use" element={<TermsOfUse />} />
                <Route path="/encarregado" element={<DPO />} />
                <Route path="/subprocessors" element={<Subprocessors />} />
                <Route path="/paciente" element={<PatientNotice />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/careers" element={<Careers />} />
                <Route path="/benchmark" element={<BenchmarkPage />} />
                <Route path="/receita/:token" element={<PublicPrescription />} />

                {/* Admin Routes (lazy) */}
                <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><UserManager /></AdminRoute>} />
                <Route path="/admin/consultations" element={<AdminRoute><AdminConsultations /></AdminRoute>} />
                <Route path="/admin/finance" element={<AdminRoute><AdminFinance /></AdminRoute>} />
                <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
                <Route path="/admin/profile-updates" element={<AdminRoute><ProfileUpdateManager /></AdminRoute>} />
                <Route path="/admin/pharmacies" element={<AdminRoute><PharmacyAdmin /></AdminRoute>} />
                <Route path="/admin/analytics" element={<AdminRoute><AnalyticsDashboard /></AdminRoute>} />
                <Route path="/test-dna" element={<TestDNALoading />} />

                {/* Waitlist Route (accessible only for waitlist users) */}
                <Route
                  path="/waitlist"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <WaitlistPage />
                    </ProtectedRoute>
                  }
                />

                {/* Onboarding Route */}
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <OnboardingPage />
                    </ProtectedRoute>
                  }
                />

                {/* Protected workspace routes (lazy) */}
                <Route
                  path="/consultation-manager"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <VerificationStatus>
                        <ConsultationManager isSidebarOpen={isSidebarOpen} />
                      </VerificationStatus>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/copilot"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <VerificationStatus>
                        <Chat
                          isSidebarOpen={isSidebarOpen}
                          sidebarWidth={isSidebarOpen ? sidebarOpenWidth : sidebarClosedWidth}
                          sessions={chatSessions}
                          activeChatId={activeChatId}
                          onSelectChat={setActiveChatId}
                          onNewChat={() => setActiveChatId(null)}
                          onNewChatCreated={handleNewChatCreated}
                          onTitleUpdate={handleTitleUpdate}
                          onSessionAnimationEnd={handleSessionAnimationEnd}
                          refreshSessions={fetchChatSessions}
                        />
                      </VerificationStatus>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/academic"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <VerificationStatus>
                        <AcademicManager isSidebarOpen={isSidebarOpen} />
                      </VerificationStatus>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pharmacy"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <VerificationStatus>
                        <PharmacyManager isSidebarOpen={isSidebarOpen} />
                      </VerificationStatus>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pricing"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <PricingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/dracma-purchase"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <DracmaPurchase />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute isLoggedIn={isLoggedIn} initialCheckComplete={initialCheckComplete}>
                      <Profile isSidebarOpen={isSidebarOpen} sidebarWidth={isSidebarOpen ? sidebarOpenWidth : sidebarClosedWidth} />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
            </ErrorBoundary>
            <div id="result-portal"></div>
          </div>
        </div>
      </div>
      {/* Visualizador de material persistente: vive FORA do <Routes>, então o quiz/material
          sobrevive à navegação entre seções (recolhe pra pílula e restaura ao voltar). */}
      {isLoggedIn && <MaterialViewerHost />}
      <CookieConsent />
    </>
  );
};

const AppWithProviders = () => (
  <LanguageProvider>
    <UserProvider>
      <ThemeProvider>
        <NotificationProvider>
          <MaterialViewerProvider>
            <AppLayoutAndRoutes />
          </MaterialViewerProvider>
        </NotificationProvider>
      </ThemeProvider>
    </UserProvider>
  </LanguageProvider>
);

function App() {
  return (
    <AppWithProviders />
  );
}

export default App;
