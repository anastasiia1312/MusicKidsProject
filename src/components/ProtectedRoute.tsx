import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from './common/LoadingScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  onRedirect: (path: string) => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  onRedirect,
}) => {
  const { user, role, loading, pendingGoogleUser } = useAuth();

  if (loading) {
    return <LoadingScreen message="Verificando sesión en MusicKids..." />;
  }

  if (!user && !pendingGoogleUser) {
    onRedirect('/login');
    return null;
  }

  // Si el usuario inició sesión pero aún no tiene rol guardado en Firestore
  if (!role && (pendingGoogleUser || user)) {
    onRedirect('/select-role');
    return null;
  }

  return <>{children}</>;
};
