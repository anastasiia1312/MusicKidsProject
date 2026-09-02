import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Register } from './pages/Register';
import { Login } from './pages/Login';
import { SelectRole } from './pages/SelectRole';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { CreateLesson } from './pages/teacher/CreateLesson';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { LessonPage } from './pages/LessonPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleRoute } from './components/RoleRoute';
import { LoadingScreen } from './components/common/LoadingScreen';

function AppContent() {
  const { user, userProfile, role, loading, pendingGoogleUser } = useAuth();
  
  // Normalizar ruta inicial
  const getInitialPath = (): string => {
    const pathname = window.location.pathname;
    if (
      pathname === '/register' ||
      pathname === '/login' ||
      pathname === '/select-role' ||
      pathname === '/teacher/dashboard' ||
      pathname === '/teacher/lessons/new' ||
      pathname === '/student/dashboard' ||
      pathname.startsWith('/lesson/')
    ) {
      return pathname;
    }
    return '/login';
  };

  const [currentPath, setCurrentPath] = useState<string>(getInitialPath);

  // Navegación segura con sincronización de historial
  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
    }
    setCurrentPath(to);
  }, []);

  // Escuchar botón Atrás / Adelante del navegador
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(getInitialPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Manejo de redirecciones automáticas basadas en el estado de autenticación y rol
  useEffect(() => {
    if (loading) return;

    // Caso 1: Usuario autenticado sin rol guardado en Firestore (e.g. login nuevo con Google)
    if ((user || pendingGoogleUser) && !role && !userProfile) {
      if (currentPath !== '/select-role') {
        navigate('/select-role');
      }
      return;
    }

    // Caso 2: Usuario con rol verificado que entra a login, register, select-role o raíz
    if (user && role) {
      if (
        currentPath === '/login' ||
        currentPath === '/register' ||
        currentPath === '/select-role' ||
        currentPath === '/'
      ) {
        if (role === 'teacher') {
          navigate('/teacher/dashboard');
        } else if (role === 'student') {
          navigate('/student/dashboard');
        }
      }
      return;
    }

    // Caso 3: Usuario no autenticado intentando entrar a rutas protegidas
    if (!user && !pendingGoogleUser) {
      if (
        currentPath === '/teacher/dashboard' ||
        currentPath === '/teacher/lessons/new' ||
        currentPath === '/student/dashboard' ||
        currentPath.startsWith('/lesson/') ||
        currentPath === '/select-role' ||
        currentPath === '/'
      ) {
        navigate('/login');
      }
    }
  }, [user, userProfile, role, loading, pendingGoogleUser, currentPath, navigate]);

  if (loading) {
    return <LoadingScreen message="Iniciando MusicKids..." />;
  }

  // Renderizar rutas dinámicas de clase: /lesson/:lessonId
  if (currentPath.startsWith('/lesson/')) {
    const lessonId = currentPath.replace('/lesson/', '').split('/')[0];
    return (
      <ProtectedRoute onRedirect={navigate}>
        <LessonPage lessonId={lessonId} onNavigate={navigate} />
      </ProtectedRoute>
    );
  }

  // Renderizar la vista correspondiente a la ruta actual
  switch (currentPath) {
    case '/register':
      return <Register onNavigate={navigate} />;

    case '/select-role':
      return <SelectRole onNavigate={navigate} />;

    case '/teacher/dashboard':
      return (
        <RoleRoute allowedRole="teacher" onRedirect={navigate}>
          <TeacherDashboard onNavigate={navigate} />
        </RoleRoute>
      );

    case '/teacher/lessons/new':
      return (
        <RoleRoute allowedRole="teacher" onRedirect={navigate}>
          <CreateLesson onNavigate={navigate} />
        </RoleRoute>
      );

    case '/student/dashboard':
      return (
        <RoleRoute allowedRole="student" onRedirect={navigate}>
          <StudentDashboard onNavigate={navigate} />
        </RoleRoute>
      );

    case '/login':
    default:
      return <Login onNavigate={navigate} />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
