import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  GraduationCap,
  Music,
  LogOut,
  Search,
  Eye,
  RotateCw,
  AlertCircle,
  Filter,
  X,
  Calendar,
  Mail,
  Shield,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { UserProfile, UserStatus } from '../../types/auth';
import {
  fetchAllUsers,
  updateUserStatus,
  calculateUserStats,
  formatRegistrationDate,
  type AdminUserStats,
} from '../../services/adminService';
import { UserDetailModal } from '../../components/admin/UserDetailModal';
import { StatusConfirmationModal } from '../../components/admin/StatusConfirmationModal';

interface AdminDashboardProps {
  onNavigate: (path: string) => void;
}

type RoleFilter = 'all' | 'teacher' | 'student';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { userProfile, user, logout } = useAuth();

  // Estados de datos
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de filtrado y búsqueda
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Estado del modal de detalle de usuario (solo lectura)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // Estado del modal de activación / desactivación
  const [targetUserForStatus, setTargetUserForStatus] = useState<UserProfile | null>(null);
  const [statusActionType, setStatusActionType] = useState<'activate' | 'deactivate'>('deactivate');
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Notificación de éxito o error tras una acción
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Cargar usuarios desde Firestore
  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('Error al cargar la lista de usuarios:', err);
      setError(
        'No se pudo obtener la lista de usuarios desde la base de datos. Verifique los permisos de Firestore.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Calcular estadísticas para las tarjetas superiores
  const stats: AdminUserStats = useMemo(() => {
    return calculateUserStats(users);
  }, [users]);

  // Filtrado conjunto por texto (nombre/email) y rol seleccionado
  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return users.filter((u) => {
      // 1. Filtro por rol
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }

      // 2. Filtro por término de búsqueda (insensible a mayúsculas/minúsculas)
      if (term) {
        const matchesName = (u.name || '').toLowerCase().includes(term);
        const matchesEmail = (u.email || '').toLowerCase().includes(term);
        return matchesName || matchesEmail;
      }

      return true;
    });
  }, [users, searchTerm, roleFilter]);

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  const handleOpenDetail = (targetUser: UserProfile) => {
    setSelectedUser(targetUser);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedUser(null);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  // Abrir modal de confirmación de activación / desactivación
  const handleOpenStatusModal = (
    targetUser: UserProfile,
    action: 'activate' | 'deactivate'
  ) => {
    // Protección contra auto-desactivación en el frontend
    if (targetUser.uid === user?.uid) {
      setStatusFeedback({
        type: 'error',
        message: 'No puedes modificar el estado de tu propia cuenta de administrador.',
      });
      return;
    }

    setTargetUserForStatus(targetUser);
    setStatusActionType(action);
    setIsStatusModalOpen(true);
  };

  const handleCloseStatusModal = () => {
    if (isUpdatingStatus) return;
    setIsStatusModalOpen(false);
    setTargetUserForStatus(null);
  };

  // Confirmar cambio de estado en Firestore
  const handleConfirmStatusChange = async () => {
    if (!targetUserForStatus || !user) return;

    setIsUpdatingStatus(true);
    setStatusFeedback(null);

    const newStatus: UserStatus = statusActionType === 'activate' ? 'active' : 'disabled';

    try {
      await updateUserStatus(user.uid, targetUserForStatus.uid, newStatus);

      // Actualizar inmediatamente la tabla en el frontend
      setUsers((prev) =>
        prev.map((u) => (u.uid === targetUserForStatus.uid ? { ...u, status: newStatus } : u))
      );

      setStatusFeedback({
        type: 'success',
        message:
          statusActionType === 'activate'
            ? `La cuenta de ${targetUserForStatus.name} ha sido reactivada exitosamente.`
            : `La cuenta de ${targetUserForStatus.name} ha sido desactivada temporalmente.`,
      });

      setIsStatusModalOpen(false);
      setTargetUserForStatus(null);
    } catch (err: any) {
      console.error('Error al actualizar estado:', err);
      setStatusFeedback({
        type: 'error',
        message:
          err.message ||
          'Ocurrió un error al actualizar el estado del usuario en la base de datos.',
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div
      id="admin-dashboard-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos decorativos de fondo acordes a MusicKids */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl" />
      </div>

      {/* HEADER SUPERIOR DEL ADMINISTRADOR */}
      <header
        id="admin-dashboard-header"
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20"
      >
        {/* Bloque Izquierdo: Logotipo MusicKids + Badge Admin */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div
            id="navbar-brand-admin"
            className="flex items-center gap-1 cursor-pointer group select-none"
            onClick={() => onNavigate('/admin/dashboard')}
            title="Panel de Administración"
          >
            <span
              className="font-abril text-[26px] sm:text-[30px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Music
            </span>
            <img
              src="/images/logo-clef.png"
              alt="Clave de Sol MusicKids"
              className="h-8 sm:h-10 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <span
              className="font-abril text-[26px] sm:text-[30px] text-[#00537A] tracking-normal leading-none"
              style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
            >
              Kids
            </span>
          </div>

          {/* Badge de Rol Administrador */}
          <div className="hidden xs:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#00537A] text-white shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrador</span>
          </div>
        </div>

        {/* Bloque Derecho: Info del Admin + Botón Cerrar Sesión */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-xs sm:text-sm font-bold text-slate-800">
              {userProfile?.name || 'Administrador'}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              {user?.email}
            </span>
          </div>

          <button
            type="button"
            id="btn-admin-logout"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 relative z-10 flex flex-col gap-6">
        {/* Cabecera del Panel */}
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 shadow-xs border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <Users className="w-3.5 h-3.5 text-amber-600" />
              <span>Gestión de Usuarios y Acceso</span>
            </div>
            <h1
              id="admin-dashboard-title"
              className="font-parkinsans text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00537A] tracking-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Panel de Administración
            </h1>
            <p
              className="font-siemreap text-slate-500 text-sm sm:text-base"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Consulta, filtra y gestiona el estado de activación de profesores y alumnos en MusicKids.
            </p>
          </div>

          {/* Botón de Actualizar / Refrescar */}
          <button
            type="button"
            id="btn-refresh-users"
            onClick={loadUsers}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold text-[#00537A] bg-[#E8F3F8] hover:bg-[#DDF1F8] border border-[#00537A]/20 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs"
            title="Recargar datos de Firestore"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* 1. RESUMEN DE USUARIOS (3 TARJETAS CON ESTADÍSTICAS) */}
        <section
          id="admin-stats-section"
          aria-label="Resumen de usuarios"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
        >
          {/* Tarjeta 1: Total de usuarios registrados */}
          <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-parkinsans">
                Total Usuarios
              </p>
              <h3
                id="stat-total-users"
                className="text-3xl sm:text-4xl font-extrabold text-[#00537A] font-parkinsans"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                {isLoading ? (
                  <span className="inline-block w-12 h-9 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  stats.total
                )}
              </h3>
              <p className="text-xs text-slate-400 font-siemreap">
                Registrados en la plataforma
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center shrink-0">
              <Users className="w-7 h-7 stroke-[2]" />
            </div>
          </div>

          {/* Tarjeta 2: Total de profesores */}
          <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-parkinsans">
                Total Profesores
              </p>
              <h3
                id="stat-total-teachers"
                className="text-3xl sm:text-4xl font-extrabold text-indigo-700 font-parkinsans"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                {isLoading ? (
                  <span className="inline-block w-12 h-9 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  stats.teachers
                )}
              </h3>
              <p className="text-xs text-slate-400 font-siemreap">
                Docentes de música
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <GraduationCap className="w-7 h-7 stroke-[2]" />
            </div>
          </div>

          {/* Tarjeta 3: Total de alumnos */}
          <div className="bg-white rounded-[24px] p-5 sm:p-6 shadow-xs border border-slate-100 flex items-center justify-between hover:shadow-sm transition-shadow">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-parkinsans">
                Total Alumnos
              </p>
              <h3
                id="stat-total-students"
                className="text-3xl sm:text-4xl font-extrabold text-emerald-700 font-parkinsans"
                style={{ fontFamily: "'Parkinsans', sans-serif" }}
              >
                {isLoading ? (
                  <span className="inline-block w-12 h-9 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  stats.students
                )}
              </h3>
              <p className="text-xs text-slate-400 font-siemreap">
                Estudiantes inscritos
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Music className="w-7 h-7 stroke-[2]" />
            </div>
          </div>
        </section>

        {/* NOTIFICACIÓN TRAS ACCIÓN (FEEDBACK BANNER) */}
        {statusFeedback && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2.5 font-siemreap text-xs sm:text-sm">
              {statusFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{statusFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer text-slate-500"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* CONTENEDOR DE TABLA DE USUARIOS CON BÚSQUEDA Y FILTROS */}
        <section
          id="admin-users-table-section"
          className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-8 shadow-xs border border-slate-100 flex flex-col gap-6"
        >
          {/* BARRA DE HERRAMIENTAS: BÚSQUEDA Y FILTROS */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            {/* Campo de Búsqueda (Nombre o Correo) */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                id="input-admin-search-users"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o correo electrónico..."
                className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A]/20 focus:border-[#00537A] transition-all font-siemreap"
              />
              {searchTerm && (
                <button
                  type="button"
                  id="btn-clear-search"
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Grupo de Filtros por Rol */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 font-parkinsans mr-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                Rol:
              </span>

              {/* Botón Filtro Todos */}
              <button
                type="button"
                id="filter-role-all"
                onClick={() => setRoleFilter('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-[#00537A] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({users.length})
              </button>

              {/* Botón Filtro Profesores */}
              <button
                type="button"
                id="filter-role-teachers"
                onClick={() => setRoleFilter('teacher')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  roleFilter === 'teacher'
                    ? 'bg-indigo-700 text-white shadow-xs'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Profesores ({stats.teachers})
              </button>

              {/* Botón Filtro Alumnos */}
              <button
                type="button"
                id="filter-role-students"
                onClick={() => setRoleFilter('student')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  roleFilter === 'student'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                Alumnos ({stats.students})
              </button>
            </div>
          </div>

          {/* MENSAJE DE ERROR SI FALLA FIRESTORE */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm text-rose-800 font-siemreap">
                <p className="font-bold">Error de consulta</p>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={loadUsers}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold underline text-rose-900 hover:text-rose-950 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" /> Reintentar ahora
                </button>
              </div>
            </div>
          )}

          {/* TABLA DE USUARIOS */}
          <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/70">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-parkinsans">
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold">
                    Usuario
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold">
                    Email
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold">
                    Rol
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold">
                    Fecha de Registro
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold">
                    Estado
                  </th>
                  <th scope="col" className="py-3.5 px-4 sm:px-6 font-bold text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-siemreap text-slate-700">
                {/* ESTADO DE CARGA */}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`loading-row-${index}`} className="animate-pulse">
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-200" />
                          <div className="space-y-1.5">
                            <div className="w-28 h-4 bg-slate-200 rounded" />
                            <div className="w-16 h-3 bg-slate-100 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <div className="w-36 h-4 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <div className="w-20 h-6 bg-slate-200 rounded-full" />
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <div className="w-24 h-4 bg-slate-200 rounded" />
                      </td>
                      <td className="py-4 px-4 sm:px-6">
                        <div className="w-16 h-6 bg-slate-200 rounded-full" />
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="w-28 h-8 bg-slate-200 rounded-full ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredUsers.length > 0 ? (
                  /* FILAS DE USUARIOS */
                  filteredUsers.map((item) => {
                    const status = item.status || 'active';
                    const isActive = status === 'active';
                    const isSelfAdmin = item.uid === user?.uid;

                    return (
                      <tr
                        key={item.uid}
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        {/* Nombre completo y avatar */}
                        <td className="py-4 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            {item.photoURL ? (
                              <img
                                src={item.photoURL}
                                alt={item.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-[#00537A] text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                                {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {item.name}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[140px] sm:max-w-[200px]">
                                {item.uid}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-4 px-4 sm:px-6 text-slate-600">
                          <span className="flex items-center gap-1.5 truncate max-w-[220px]">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.email}</span>
                          </span>
                        </td>

                        {/* Rol */}
                        <td className="py-4 px-4 sm:px-6">
                          {item.role === 'teacher' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                              <GraduationCap className="w-3.5 h-3.5" />
                              Profesor
                            </span>
                          )}
                          {item.role === 'student' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                              <Music className="w-3.5 h-3.5" />
                              Alumno
                            </span>
                          )}
                          {item.role === 'admin' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#00537A] text-white shadow-2xs">
                              <Shield className="w-3.5 h-3.5" />
                              Admin
                            </span>
                          )}
                        </td>

                        {/* Fecha de Registro */}
                        <td className="py-4 px-4 sm:px-6 text-slate-600 whitespace-nowrap">
                          <span className="flex items-center gap-1.5 text-xs font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {formatRegistrationDate(item.createdAt)}
                          </span>
                        </td>

                        {/* Estado: Activo / Desactivado (compatibilidad por defecto activo) */}
                        <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Desactivado
                            </span>
                          )}
                        </td>

                        {/* Acciones: Ver Perfil + Activar / Desactivar */}
                        <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 justify-end">
                            {/* Ver Perfil (Solo Lectura) */}
                            <button
                              type="button"
                              id={`btn-view-profile-${item.uid}`}
                              onClick={() => handleOpenDetail(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[#00537A] bg-[#E8F3F8] hover:bg-[#DDF1F8] border border-[#00537A]/20 transition-all cursor-pointer shadow-2xs"
                              title="Ver información del perfil"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#00537A]" />
                              <span>Ver perfil</span>
                            </button>

                            {/* Acción de Cambio de Estado */}
                            {isSelfAdmin ? (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-400 border border-slate-200 select-none"
                                title="No puedes desactivar tu propia cuenta"
                              >
                                (Tu cuenta)
                              </span>
                            ) : isActive ? (
                              <button
                                type="button"
                                id={`btn-deactivate-user-${item.uid}`}
                                onClick={() => handleOpenStatusModal(item, 'deactivate')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-2xs"
                                title="Desactivar acceso a este usuario"
                              >
                                <Lock className="w-3.5 h-3.5 text-rose-600" />
                                <span>Desactivar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                id={`btn-activate-user-${item.uid}`}
                                onClick={() => handleOpenStatusModal(item, 'activate')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer shadow-2xs"
                                title="Reactivar acceso a este usuario"
                              >
                                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Activar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  /* ESTADO VACÍO (SIN RESULTADOS) */
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center">
                      <div className="max-w-sm mx-auto flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                          <Search className="w-7 h-7" />
                        </div>
                        <p className="font-bold text-slate-700 text-base font-parkinsans">
                          No se encontraron usuarios
                        </p>
                        <p className="text-xs text-slate-500 font-siemreap">
                          {searchTerm || roleFilter !== 'all'
                            ? 'No hay registros que coincidan con los filtros aplicados o término de búsqueda.'
                            : 'Actualmente no hay usuarios registrados en la base de datos.'}
                        </p>
                        {(searchTerm || roleFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm('');
                              setRoleFilter('all');
                            }}
                            className="mt-2 px-4 py-2 rounded-full text-xs font-bold text-[#00537A] bg-white border border-[#00537A]/20 hover:bg-[#F0F4F8] transition-colors cursor-pointer shadow-2xs"
                          >
                            Restablecer búsqueda y filtros
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PIE DE TABLA: RESUMEN DE ELEMENTOS MOSTRADOS */}
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-siemreap gap-2 pt-2">
            <span>
              Mostrando{' '}
              <strong className="text-slate-700 font-bold">
                {filteredUsers.length}
              </strong>{' '}
              de <strong className="text-slate-700 font-bold">{users.length}</strong>{' '}
              usuarios registrados
            </span>

            {/* Aviso de gestión de acceso */}
            <span className="text-slate-400 italic text-[11px]">
              La desactivación suspende el acceso sin eliminar datos ni historiales.
            </span>
          </div>
        </section>
      </main>

      {/* Espaciado inferior de balance */}
      <footer className="w-full py-6 shrink-0" />

      {/* MODAL DE DETALLE DE USUARIO (SOLO LECTURA) */}
      <UserDetailModal
        user={selectedUser}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetail}
      />

      {/* MODAL DE CONFIRMACIÓN DE ACTIVACIÓN / DESACTIVACIÓN */}
      <StatusConfirmationModal
        isOpen={isStatusModalOpen}
        onClose={handleCloseStatusModal}
        onConfirm={handleConfirmStatusChange}
        targetUser={targetUserForStatus}
        actionType={statusActionType}
        isLoading={isUpdatingStatus}
      />
    </div>
  );
};
