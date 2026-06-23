import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { socket, flushSyncQueue } from './utils/api';
import { AuthContext, getAuthFromStorage } from './utils/auth';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const SocioDashboard = lazy(() => import('./pages/SocioDashboard'));
const EmpleadoDashboard = lazy(() => import('./pages/EmpleadoDashboard'));

function RouteSkeleton() {
  return (
    <div className="flex flex-col flex-1 gap-4 animate-pulse" aria-hidden="true">
      <div className="h-10 w-2/5 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-28 w-full rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-28 w-full rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-28 w-full rounded-xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function App() {
  const [auth, setAuth] = useState(getAuthFromStorage);

  const { user, isAuthenticated } = auth;

  useEffect(() => {
    if (isAuthenticated) {
      socket.connect();
      flushSyncQueue();
    } else {
      socket.disconnect();
    }
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={{ ...auth, setAuth }}>
      <Router>
        <div className="w-full min-h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
          <div className="flex flex-col flex-1 px-5 py-8">
            <Suspense fallback={<RouteSkeleton />}>
              <Routes>
                {/* Redirects from old HTML routes */}
                <Route path="/socio.html" element={<Navigate to="/socio" replace />} />
                <Route path="/empleado.html" element={<Navigate to="/empleado" replace />} />

                <Route
                  path="/"
                  element={isAuthenticated ? <Navigate to={`/${user.role}`} replace /> : <Login />}
                />
                <Route
                  path="/register"
                  element={isAuthenticated ? <Navigate to={`/${user.role}`} replace /> : <Register />}
                />
                <Route
                  path="/socio"
                  element={isAuthenticated && (user.role === 'socio' || user.role === 'jefe') ? <SocioDashboard /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/jefe"
                  element={isAuthenticated && (user.role === 'socio' || user.role === 'jefe') ? <SocioDashboard /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/empleado"
                  element={isAuthenticated && user.role === 'empleado' ? <EmpleadoDashboard /> : <Navigate to="/" replace />}
                />
                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
