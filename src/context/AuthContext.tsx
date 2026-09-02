import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  fetchUserProfile,
  registerWithEmailService,
  loginWithEmailService,
  loginWithGoogleService,
  completeGoogleUserRole,
  logoutService,
} from '../services/authService';
import type { UserProfile, UserRole } from '../types/auth';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  pendingGoogleUser: User | null;
  registerWithEmail: (
    name: string,
    email: string,
    pass: string,
    role: UserRole
  ) => Promise<UserProfile>;
  loginWithEmail: (email: string, pass: string) => Promise<UserProfile | null>;
  loginWithGoogle: () => Promise<{ isNewUser: boolean; profile: UserProfile | null }>;
  selectRoleForGoogleUser: (role: UserRole) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<User | null>(null);

  // Escuchar cambios de autenticación en Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const profile = await fetchUserProfile(currentUser.uid);
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role);
            setPendingGoogleUser(null);
          } else {
            // Usuario autenticado (por ejemplo, con Google) pero sin documento en Firestore aún
            setUserProfile(null);
            setRole(null);
            setPendingGoogleUser(currentUser);
          }
        } catch (error) {
          console.error('Error al sincronizar el perfil con Firestore:', error);
          setUserProfile(null);
          setRole(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setRole(null);
        setPendingGoogleUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserProfile = async (): Promise<UserProfile | null> => {
    if (!auth.currentUser) {
      setUserProfile(null);
      setRole(null);
      return null;
    }
    try {
      const profile = await fetchUserProfile(auth.currentUser.uid);
      if (profile) {
        setUserProfile(profile);
        setRole(profile.role);
        setPendingGoogleUser(null);
      }
      return profile;
    } catch (error) {
      console.error('Error al refrescar perfil:', error);
      return null;
    }
  };

  const registerWithEmail = async (
    name: string,
    email: string,
    pass: string,
    userRole: UserRole
  ): Promise<UserProfile> => {
    setLoading(true);
    try {
      const { user: newUser, profile } = await registerWithEmailService(
        name,
        email,
        pass,
        userRole
      );
      setUser(newUser);
      setUserProfile(profile);
      setRole(profile.role);
      setPendingGoogleUser(null);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (
    email: string,
    pass: string
  ): Promise<UserProfile | null> => {
    setLoading(true);
    try {
      const { user: loggedUser, profile } = await loginWithEmailService(email, pass);
      setUser(loggedUser);
      if (profile) {
        setUserProfile(profile);
        setRole(profile.role);
        setPendingGoogleUser(null);
      } else {
        setUserProfile(null);
        setRole(null);
        setPendingGoogleUser(loggedUser);
      }
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<{
    isNewUser: boolean;
    profile: UserProfile | null;
  }> => {
    setLoading(true);
    try {
      const result = await loginWithGoogleService();
      setUser(result.user);
      if (result.profile) {
        setUserProfile(result.profile);
        setRole(result.profile.role);
        setPendingGoogleUser(null);
      } else {
        // Es un usuario nuevo, necesita seleccionar rol
        setUserProfile(null);
        setRole(null);
        setPendingGoogleUser(result.user);
      }
      return { isNewUser: result.isNewUser, profile: result.profile };
    } finally {
      setLoading(false);
    }
  };

  const selectRoleForGoogleUser = async (userRole: UserRole): Promise<UserProfile> => {
    const targetUser = pendingGoogleUser || user || auth.currentUser;
    if (!targetUser) {
      throw new Error('No hay ninguna sesión activa de usuario para asignar rol.');
    }

    setLoading(true);
    try {
      const profile = await completeGoogleUserRole(targetUser, userRole);
      setUser(targetUser);
      setUserProfile(profile);
      setRole(profile.role);
      setPendingGoogleUser(null);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      await logoutService();
      setUser(null);
      setUserProfile(null);
      setRole(null);
      setPendingGoogleUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        role,
        loading,
        pendingGoogleUser,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        selectRoleForGoogleUser,
        logout,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};
