import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from './common/LoadingScreen';
import { AccountDisabledScreen } from './common/AccountDisabledScreen';
import type { UserRole } from '../types/auth';

interface RoleRouteProps {
  allowedRole: UserRole;
  children: React.ReactNode;
  onRedirect: (path: string) => void;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({
  allowedRole,
  children,
  onRedirect,
}) => {
  const { user, role, loading, isAccountDisabled, pendingGoogleUser } = useAuth();

  if (loading) {
    return <LoadingScreen message="Comprobando permisos de usuario..." />;
  }

  // Si la cuenta del usuario está desactivada, bloquear acceso inmediato
  if (user && isAccountDisabled) {
    return <AccountDisabledScreen onNavigate={onRedirect} />;
  }

  // Si no está autenticado, redirigir a Login
  if (!user && !pendingGoogleUser) {
    onRedirect('/login');
    return null;
  }

  // Si no tiene rol asignado en Firestore, redirigir a SelectRole
  if (!role) {
    onRedirect('/select-role');
    return null;
  }

  // Si el rol no coincide con el permitido, redirigir a su dashboard correspondiente
  if (role !== allowedRole) {
    if (role === 'teacher') {
      onRedirect('/teacher/dashboard');
    } else if (role === 'student') {
      onRedirect('/student/dashboard');
    } else if (role === 'admin') {
      onRedirect('/admin/dashboard');
    } else {
      onRedirect('/login');
    }
    return null;
  }

  return <>{children}</>;
};
