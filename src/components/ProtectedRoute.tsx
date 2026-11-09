import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from './common/LoadingScreen';
import { AccountDisabledScreen } from './common/AccountDisabledScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  onRedirect: (path: string) => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  onRedirect,
}) => {
  const { user, role, loading, isAccountDisabled, pendingGoogleUser } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (user && isAccountDisabled) return;

    if (!user && !pendingGoogleUser) {
      onRedirect('/login');
      return;
    }

    // Si el usuario inició sesión pero aún no tiene rol guardado en Firestore
    if (!role && (pendingGoogleUser || user)) {
      onRedirect('/select-role');
    }
  }, [loading, user, isAccountDisabled, pendingGoogleUser, role, onRedirect]);

  if (loading) {
    return <LoadingScreen message="Verificando sesión en MusicKids..." />;
  }

  // Si la cuenta del usuario está desactivada, bloquear acceso inmediato a rutas protegidas
  if (user && isAccountDisabled) {
    return <AccountDisabledScreen onNavigate={onRedirect} />;
  }

  if (!user && !pendingGoogleUser) {
    return null;
  }

  // Si el usuario inició sesión pero aún no tiene rol guardado en Firestore
  if (!role && (pendingGoogleUser || user)) {
    return null;
  }

  return <>{children}</>;
};
