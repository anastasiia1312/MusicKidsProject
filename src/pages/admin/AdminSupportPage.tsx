import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  Headphones,
  LogOut,
  Search,
  Filter,
  RefreshCw,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Send,
  Calendar,
  User,
  GraduationCap,
  Music,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getAllSupportTickets,
  getTicketMessages,
  sendSupportMessage,
  updateTicketStatus,
  markTicketAsRead,
  subscribeToAdminSupportCounts,
} from '../../services/supportService';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_CONFIG,
  getCategoryLabel,
  type SupportTicket,
  type SupportMessage,
  type SupportCategory,
  type SupportTicketStatus,
} from '../../types/support';

interface AdminSupportPageProps {
  onNavigate: (path: string) => void;
}

export const AdminSupportPage: React.FC<AdminSupportPageProps> = ({ onNavigate }) => {
  const { userProfile, user, logout } = useAuth();

  // Estados de datos
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros y búsqueda
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SupportCategory>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal de Detalle y Gestión del Ticket
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Contadores en tiempo real
  const [adminCounts, setAdminCounts] = useState({ pending: 0, unread: 0, total: 0 });

  useEffect(() => {
    const unsub = subscribeToAdminSupportCounts(setAdminCounts);
    return () => unsub();
  }, []);

  // Cargar tickets de Firestore
  const loadTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllSupportTickets();
      setTickets(data);
    } catch (err: any) {
      console.error('Error al cargar tickets de soporte para el admin:', err);
      setError('No pudimos cargar las solicitudes de soporte. Verificá los permisos de administrador.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Cargar conversación cuando se selecciona un ticket
  const handleOpenTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReplyText('');
    setActionError(null);
    setActionSuccess(null);
    setLoadingMessages(true);
    try {
      const msgs = await getTicketMessages(ticket.id);
      setMessages(msgs);
      // Marcar leído para admin
      await markTicketAsRead(ticket.id, 'admin');
      // Actualizar flag local
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, unreadForAdmin: false } : t))
      );
    } catch (err: any) {
      console.error('Error al cargar mensajes del ticket:', err);
      setActionError('No se pudieron obtener los mensajes del ticket.');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedTicket(null);
    setMessages([]);
    setReplyText('');
    setActionError(null);
    setActionSuccess(null);
  };

  // Enviar respuesta como administrador
  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    const trimmed = replyText.trim();
    if (trimmed.length < 1 || trimmed.length > 3000) {
      setActionError('La respuesta debe tener entre 1 y 3000 caracteres.');
      return;
    }

    setSendingReply(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await sendSupportMessage(selectedTicket.id, trimmed);
      setReplyText('');
      setActionSuccess('Respuesta enviada exitosamente al usuario.');

      // Recargar mensajes
      const updatedMsgs = await getTicketMessages(selectedTicket.id);
      setMessages(updatedMsgs);

      // Si el ticket estaba pendiente, pasa a en proceso
      const newStatus = selectedTicket.status === 'pending' ? 'in_progress' : selectedTicket.status;
      setSelectedTicket((prev) =>
        prev ? { ...prev, status: newStatus, messageCount: (prev.messageCount || 0) + 1 } : null
      );

      // Actualizar lista en memoria
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, status: newStatus, messageCount: (t.messageCount || 0) + 1, lastActivityAt: new Date() }
            : t
        )
      );
    } catch (err: any) {
      console.error('Error al responder ticket:', err);
      setActionError(err.message || 'Ocurrió un error al enviar la respuesta.');
    } finally {
      setSendingReply(false);
    }
  };

  // Cambiar estado del ticket (En proceso / Resuelto)
  const handleChangeStatus = async (newStatus: 'in_progress' | 'resolved') => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await updateTicketStatus(selectedTicket.id, newStatus);
      setActionSuccess(
        newStatus === 'resolved'
          ? 'La solicitud ha sido marcada como resuelta.'
          : 'El estado de la solicitud se actualizó a "En proceso".'
      );

      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t))
      );
    } catch (err: any) {
      console.error('Error al actualizar estado:', err);
      setActionError(err.message || 'No se pudo actualizar el estado de la solicitud.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  // Métricas para las tarjetas superiores
  const stats = useMemo(() => {
    const total = tickets.length;
    const pending = tickets.filter((t) => t.status === 'pending').length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const resolved = tickets.filter((t) => t.status === 'resolved').length;
    return { total, pending, inProgress, resolved };
  }, [tickets]);

  // Filtrado de tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(term);
        const matchesNumber = (t.ticketNumber || '').toLowerCase().includes(term);
        const matchesUser = (t.userName || '').toLowerCase().includes(term);
        const matchesEmail = (t.userEmail || '').toLowerCase().includes(term);
        return matchesSubject || matchesNumber || matchesUser || matchesEmail;
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, searchTerm]);

  const formatDate = (val: any) => {
    if (!val) return '';
    const dateObj = val.toDate ? val.toDate() : new Date(val);
    if (isNaN(dateObj.getTime())) return '';
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dateObj);
  };

  return (
    <div
      id="admin-support-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Fondo ambiental MusicKids */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl" />
      </div>

      {/* HEADER SUPERIOR */}
      <header
        id="admin-header"
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20"
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <div
            id="navbar-brand-admin"
            className="flex items-center gap-1 cursor-pointer group select-none"
            onClick={() => onNavigate('/admin/dashboard')}
            title="Ir al inicio de administración"
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

          <div className="hidden xs:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#00537A] text-white shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrador</span>
          </div>
        </div>

        {/* Navegación de secciones del Administrador */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/admin/dashboard')}
            className="px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold text-slate-700 hover:bg-white hover:text-[#00537A] transition-colors"
          >
            Usuarios
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/admin/support')}
            className="px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold bg-[#00537A] text-white transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Soporte</span>
            {adminCounts.pending > 0 && (
              <span className="bg-[#FFB800] text-[#7A5A00] text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                {adminCounts.pending}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 shadow-2xs transition-colors cursor-pointer ml-2"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 relative z-10 flex flex-col gap-6">
        {/* Cabecera del Módulo */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#E8F3F8] text-[#00537A]">
              <Headphones className="w-3.5 h-3.5" />
              <span>Módulo de Soporte Técnico</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
              Gestión de Solicitudes de Asistencia
            </h1>
            <p className="text-sm text-slate-500">
              Respondé tickets, modificá estados y brindá asistencia técnica directa a alumnos y profesores.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold text-[#00537A] bg-[#E8F3F8] hover:bg-[#DDF1F8] border border-[#00537A]/20 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs"
            title="Actualizar lista de tickets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* 1. TARJETAS DE RESUMEN (MÉTRICAS) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Total Solicitudes
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-900">
              {stats.total}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Registradas históricamente</p>
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 block mb-1">
              Pendientes
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-amber-700">
              {stats.pending}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Requieren atención inicial</p>
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600 block mb-1">
              En proceso
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-sky-700">
              {stats.inProgress}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">En curso de resolución</p>
          </div>

          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 block mb-1">
              Resueltas
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-700">
              {stats.resolved}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Solucionadas con éxito</p>
          </div>
        </section>

        {/* 2. BARRA DE FILTROS Y BÚSQUEDA */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Pestañas de estado */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[#00537A] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todas ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Pendientes ({stats.pending})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('in_progress')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'in_progress'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              En proceso ({stats.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Resueltas ({stats.resolved})
            </button>
          </div>

          {/* Filtro de Categoría y Buscador */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
            >
              <option value="all">Todas las categorías</option>
              {SUPPORT_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>

            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por usuario, asunto o ID..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
              />
            </div>
          </div>
        </div>

        {/* 3. LISTADO DE TICKETS */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadTickets}
              className="text-xs font-bold underline hover:no-underline ml-4"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && filteredTickets.length > 0 && (
          <div className="space-y-3">
            {filteredTickets.map((t) => {
              const statusConfig = SUPPORT_STATUS_CONFIG[t.status] || SUPPORT_STATUS_CONFIG.pending;
              const isTeacher = t.userRole === 'teacher';

              return (
                <div
                  key={t.id}
                  onClick={() => handleOpenTicket(t)}
                  className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 hover:border-[#00537A]/30 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                        {t.ticketNumber}
                      </span>

                      {/* Badge de Rol */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        isTeacher
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {isTeacher ? <GraduationCap className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {isTeacher ? 'Profesor' : 'Alumno'}
                      </span>

                      {/* Badge de Estado */}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}>
                        {statusConfig.label}
                      </span>

                      <span className="text-xs text-slate-400 font-medium">
                        • {getCategoryLabel(t.category)}
                      </span>

                      {t.unreadForAdmin && (
                        <span className="bg-[#FFB800] text-[#7A5A00] text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs animate-pulse">
                          Nuevo mensaje
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#00537A] transition-colors truncate">
                      {t.subject}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {t.userName} ({t.userEmail})
                      </span>
                      <span>Creado: {formatDate(t.createdAt)}</span>
                      <span>Última actividad: {formatDate(t.lastActivityAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 text-xs pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 font-bold group-hover:bg-[#E8F3F8] group-hover:text-[#00537A] transition-colors">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {t.messageCount || 0} mensajes
                    </span>
                    <button
                      type="button"
                      className="px-4 py-2 bg-[#00537A] text-white text-xs font-bold rounded-xl group-hover:bg-[#003d59] transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Gestionar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredTickets.length === 0 && (
          <div className="bg-white rounded-3xl p-12 text-center max-w-lg mx-auto shadow-sm border border-slate-100 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Headphones className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-slate-800">
              No hay solicitudes para mostrar
            </h4>
            <p className="text-xs text-slate-500">
              No se encontraron tickets con los criterios de búsqueda o filtros seleccionados.
            </p>
          </div>
        )}
      </main>

      {/* 4. MODAL DE GESTIÓN Y CONVERSACIÓN DEL TICKET */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Modal */}
            <div className="p-6 sm:p-7 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-extrabold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {selectedTicket.ticketNumber}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    SUPPORT_STATUS_CONFIG[selectedTicket.status]?.bgClass
                  } ${SUPPORT_STATUS_CONFIG[selectedTicket.status]?.textClass} border ${
                    SUPPORT_STATUS_CONFIG[selectedTicket.status]?.borderClass
                  }`}>
                    {SUPPORT_STATUS_CONFIG[selectedTicket.status]?.label}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    {getCategoryLabel(selectedTicket.category)}
                  </span>
                </div>

                <h2 className="text-lg sm:text-xl font-extrabold text-[#00537A] truncate">
                  {selectedTicket.subject}
                </h2>

                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Remitente: <strong className="text-slate-800">{selectedTicket.userName}</strong> ({selectedTicket.userRole === 'teacher' ? 'Profesor' : 'Alumno'})
                  </span>
                  <span>•</span>
                  <span>Email: {selectedTicket.userEmail}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido scrolleable: Descripción y Conversación */}
            <div className="p-6 sm:p-7 overflow-y-auto space-y-6 flex-1">
              {/* Acciones de cambio de estado */}
              <div className="bg-[#E8F3F8]/60 border border-[#00537A]/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#00537A]">
                  Gestionar estado del ticket:
                </span>
                <div className="flex items-center gap-2">
                  {selectedTicket.status !== 'in_progress' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleChangeStatus('in_progress')}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Marcar en proceso
                    </button>
                  )}
                  {selectedTicket.status !== 'resolved' && (
                    <button
                      type="button"
                      disabled={updatingStatus}
                      onClick={() => handleChangeStatus('resolved')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      Marcar como resuelto
                    </button>
                  )}
                </div>
              </div>

              {actionFeedbackBanner(actionError, actionSuccess)}

              {/* Descripción inicial del problema */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                <span className="font-bold text-slate-500 uppercase tracking-wider block mb-1 text-[11px]">
                  Descripción inicial del problema:
                </span>
                {selectedTicket.description}
              </div>

              {/* Hilo de mensajes */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Historial de Respuestas ({messages.length})
                </h4>

                {loadingMessages && (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    Cargando conversación...
                  </div>
                )}

                {!loadingMessages && messages.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50/50 rounded-2xl border border-slate-100">
                    Aún no hay respuestas en este ticket. Podés responderle directamente al usuario abajo.
                  </div>
                )}

                {messages.map((m) => {
                  const isAdmin = m.senderRole === 'admin';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 text-xs">
                        <span className="font-bold text-slate-700">
                          {isAdmin ? 'Soporte MusicKids (Vos)' : m.senderName}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDate(m.createdAt)}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-2xs ${
                          isAdmin
                            ? 'bg-[#00537A] text-white rounded-tr-sm'
                            : 'bg-slate-100 text-slate-800 rounded-tl-sm border border-slate-200'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer con Formulario de Respuesta */}
            <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50">
              <form onSubmit={handleSendAdminReply} className="space-y-3">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escribí una respuesta técnica clara y respetuosa para el usuario..."
                  maxLength={3000}
                  disabled={sendingReply}
                  className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A] resize-none"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {replyText.length} / 3000 caracteres
                  </span>
                  <button
                    type="submit"
                    disabled={sendingReply || replyText.trim().length === 0}
                    className="px-5 py-2.5 rounded-xl bg-[#00537A] text-white text-xs font-bold hover:bg-[#003d59] transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingReply ? 'Enviando...' : 'Responder al usuario'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function actionFeedbackBanner(error: string | null, success: string | null) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold">
        {error}
      </div>
    );
  }
  if (success) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-xs font-semibold">
        {success}
      </div>
    );
  }
  return null;
}
