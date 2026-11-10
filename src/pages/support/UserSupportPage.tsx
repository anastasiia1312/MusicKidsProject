import React, { useState, useEffect, useMemo } from 'react';
import {
  Headphones,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ArrowLeft,
  Send,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  Lock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';
import { StudentLayout } from '../../components/student/StudentLayout';
import {
  createSupportTicket,
  getUserSupportTickets,
  getTicketMessages,
  sendSupportMessage,
  markTicketAsRead,
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

interface UserSupportPageProps {
  onNavigate: (path: string) => void;
}

export const UserSupportPage: React.FC<UserSupportPageProps> = ({ onNavigate }) => {
  const { user, userProfile, role } = useAuth();

  // Estados de navegación interna
  const [activeTab, setActiveTab] = useState<'new' | 'list'>('list');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Estados de datos
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [errorTickets, setErrorTickets] = useState<string | null>(null);

  // Estados de conversación del ticket seleccionado
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Estados del formulario "Nueva solicitud"
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('access_issues');
  const [description, setDescription] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketFormError, setTicketFormError] = useState<string | null>(null);
  const [ticketSuccessMessage, setTicketSuccessMessage] = useState<string | null>(null);

  // Filtros de la lista de solicitudes
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Cargar tickets del usuario
  const loadTickets = async () => {
    if (!user?.uid) return;
    setLoadingTickets(true);
    setErrorTickets(null);
    try {
      const data = await getUserSupportTickets(user.uid);
      setTickets(data);
    } catch (err: any) {
      console.error('Error al cargar tickets:', err);
      setErrorTickets('No pudimos cargar tus solicitudes. Por favor reintentá.');
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [user?.uid]);

  // Cargar conversación cuando se selecciona un ticket
  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) return;

    let isMounted = true;
    const loadConversation = async () => {
      setLoadingMessages(true);
      setReplyError(null);
      try {
        const msgs = await getTicketMessages(selectedTicketId);
        if (isMounted) {
          setMessages(msgs);
        }
        // Marcar como leído para el usuario
        await markTicketAsRead(selectedTicketId, 'user');
        // Actualizar flag local
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicketId ? { ...t, unreadForUser: false } : t))
        );
      } catch (err) {
        console.error('Error al cargar mensajes del ticket:', err);
      } finally {
        if (isMounted) {
          setLoadingMessages(false);
        }
      }
    };

    loadConversation();

    return () => {
      isMounted = false;
    };
  }, [selectedTicketId]);

  // Manejo de envío de nuevo ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketFormError(null);
    setTicketSuccessMessage(null);

    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (trimmedSubject.length < 3 || trimmedSubject.length > 120) {
      setTicketFormError('El asunto debe tener entre 3 y 120 caracteres.');
      return;
    }

    if (trimmedDescription.length < 10 || trimmedDescription.length > 3000) {
      setTicketFormError('La descripción debe tener entre 10 y 3000 caracteres.');
      return;
    }

    setSubmittingTicket(true);
    try {
      const newId = await createSupportTicket({
        subject: trimmedSubject,
        category,
        description: trimmedDescription,
      });

      setTicketSuccessMessage('¡Tu solicitud fue enviada con éxito! El equipo de soporte responderá a la brevedad.');
      setSubject('');
      setDescription('');
      setCategory('access_issues');

      // Recargar tickets y abrir la conversación
      await loadTickets();
      setSelectedTicketId(newId);
      setActiveTab('list');
    } catch (err: any) {
      console.error('Error al enviar ticket:', err);
      setTicketFormError(err.message || 'Ocurrió un error al enviar tu solicitud.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Manejo de respuesta dentro del ticket
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId) return;

    const trimmed = replyContent.trim();
    if (trimmed.length < 1 || trimmed.length > 3000) {
      setReplyError('El mensaje debe tener entre 1 y 3000 caracteres.');
      return;
    }

    setSendingReply(true);
    setReplyError(null);
    try {
      await sendSupportMessage(selectedTicketId, trimmed);
      setReplyContent('');

      // Recargar mensajes del ticket
      const updatedMessages = await getTicketMessages(selectedTicketId);
      setMessages(updatedMessages);

      // Actualizar contador y fecha en la lista
      setTickets((prev) =>
        prev.map((t) =>
          t.id === selectedTicketId
            ? { ...t, messageCount: (t.messageCount || 0) + 1, lastActivityAt: new Date() }
            : t
        )
      );
    } catch (err: any) {
      console.error('Error al enviar respuesta:', err);
      setReplyError(err.message || 'No se pudo enviar el mensaje.');
    } finally {
      setSendingReply(false);
    }
  };

  // Formato de fecha legible
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

  // Filtrado de tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(term);
        const matchesNumber = (t.ticketNumber || '').toLowerCase().includes(term);
        const matchesCategory = getCategoryLabel(t.category).toLowerCase().includes(term);
        return matchesSubject || matchesNumber || matchesCategory;
      }
      return true;
    });
  }, [tickets, statusFilter, searchTerm]);

  // Contenido principal de la página
  const renderContent = () => {
    // CASO 1: VISTA DE DETALLE / CONVERSACIÓN DEL TICKET
    if (selectedTicketId && selectedTicket) {
      const isResolved = selectedTicket.status === 'resolved';
      const statusConfig = SUPPORT_STATUS_CONFIG[selectedTicket.status] || SUPPORT_STATUS_CONFIG.pending;

      return (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Barra superior de navegación */}
          <div className="flex items-center justify-between gap-4 bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100">
            <button
              type="button"
              onClick={() => {
                setSelectedTicketId(null);
                setReplyContent('');
                setReplyError(null);
              }}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#00537A] hover:text-[#003d59] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a mis solicitudes
            </button>

            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}>
                {statusConfig.label}
              </span>
              <span className="text-xs font-mono text-slate-500 font-semibold hidden sm:inline">
                {selectedTicket.ticketNumber}
              </span>
            </div>
          </div>

          {/* Encabezado del Ticket y Descripción Original */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {getCategoryLabel(selectedTicket.category)}
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#00537A] mt-1">
                  {selectedTicket.subject}
                </h2>
              </div>
              <div className="text-xs text-slate-500 sm:text-right">
                <p>Creado el {formatDate(selectedTicket.createdAt)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Última actividad: {formatDate(selectedTicket.lastActivityAt)}
                </p>
              </div>
            </div>

            {/* Caja de descripción original */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/60 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Descripción inicial del problema:
              </p>
              {selectedTicket.description}
            </div>
          </div>

          {/* Hilo de Conversación Cronológica */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#00537A]" />
                Conversación con Soporte ({messages.length})
              </h3>
              {loadingMessages && (
                <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>

            {/* Mensajes */}
            <div className="space-y-4 pt-2">
              {messages.length === 0 && !loadingMessages && (
                <div className="text-center py-8 text-slate-500 text-sm italic">
                  Tu solicitud está en cola de atención. El equipo de soporte de MusicKids responderá en este espacio.
                </div>
              )}

              {messages.map((msg) => {
                const isAdmin = msg.senderRole === 'admin';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-2 mb-1 text-xs">
                      {isAdmin ? (
                        <span className="font-bold text-[#00537A] flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#00537A]" />
                          Equipo de Soporte MusicKids
                        </span>
                      ) : (
                        <span className="font-bold text-slate-700">Vos</span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {formatDate(msg.createdAt)}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-2xs ${
                        isAdmin
                          ? 'bg-[#E8F3F8] text-slate-900 border border-[#00537A]/20 rounded-tl-sm'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tr-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Formulario de Respuesta o Aviso de Resuelto */}
            <div className="pt-6 border-t border-slate-100">
              {isResolved ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3.5 text-emerald-900 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-emerald-900">Solicitud resuelta</h4>
                    <p className="text-emerald-800 text-xs mt-1 leading-relaxed">
                      Esta solicitud ha sido marcada como resuelta y se encuentra en modo solo lectura. Si necesitás asistencia con otro asunto, podés crear una nueva solicitud en cualquier momento.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="space-y-3">
                  <label htmlFor="reply-input" className="block text-xs font-bold text-slate-700">
                    Responder a la conversación:
                  </label>
                  <textarea
                    id="reply-input"
                    rows={3}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Escribí tu mensaje o aclaración..."
                    maxLength={3000}
                    disabled={sendingReply}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all resize-none"
                  />

                  {replyError && (
                    <p className="text-xs text-red-600 font-semibold">{replyError}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {replyContent.length} / 3000 caracteres
                    </span>
                    <button
                      type="submit"
                      disabled={sendingReply || replyContent.trim().length === 0}
                      className="px-5 py-2.5 rounded-xl bg-[#00537A] text-white text-xs font-bold hover:bg-[#003d59] transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingReply ? 'Enviando...' : 'Enviar respuesta'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      );
    }

    // CASO 2: VISTA PRINCIPAL (TABS: NUEVA SOLICITUD / MIS SOLICITUDES)
    return (
      <div className="space-y-6">
        {/* Cabecera Principal */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] text-xs font-bold uppercase tracking-wider">
              <Headphones className="w-3.5 h-3.5" />
              Centro de Ayuda
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
              Soporte Técnico MusicKids
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl">
              ¿Tenés inconvenientes con tus clases, pagos o el aula virtual? Enviá una solicitud y te ayudaremos a solucionarlo.
            </p>
          </div>

          {/* Toggle de Pestañas */}
          <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/60 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'list'
                  ? 'bg-white text-[#00537A] shadow-sm'
                  : 'text-slate-600 hover:text-[#00537A]'
              }`}
            >
              Mis solicitudes ({tickets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'new'
                  ? 'bg-white text-[#00537A] shadow-sm'
                  : 'text-slate-600 hover:text-[#00537A]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Nueva solicitud
            </button>
          </div>
        </div>

        {/* FEEDBACK BANNER SI CORRESPONDE */}
        {ticketSuccessMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 text-sm flex items-center justify-between animate-in fade-in">
            <span>{ticketSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setTicketSuccessMessage(null)}
              className="text-xs font-bold underline hover:no-underline ml-4"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* PESTAÑA A: NUEVA SOLICITUD */}
        {activeTab === 'new' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-[#00537A] flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#00537A]" />
                Crear una nueva solicitud de asistencia
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Completá los detalles a continuación para que nuestro equipo técnico pueda asistirte de forma precisa.
              </p>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-5">
              {/* Campo: Asunto */}
              <div>
                <label htmlFor="ticket-subject" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Asunto <span className="text-rose-500">*</span>
                </label>
                <input
                  id="ticket-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej: Problemas con el audio en Google Meet"
                  maxLength={120}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Máximo 120 caracteres ({subject.length}/120)
                </span>
              </div>

              {/* Campo: Categoría */}
              <div>
                <label htmlFor="ticket-category" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Categoría del problema <span className="text-rose-500">*</span>
                </label>
                <select
                  id="ticket-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportCategory)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all"
                >
                  {SUPPORT_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campo: Descripción */}
              <div>
                <label htmlFor="ticket-description" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Descripción detallada del problema <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="ticket-description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Por favor describí lo que sucede, indicando qué acción estabas realizando, el dispositivo o navegador y cualquier mensaje de error visible."
                  maxLength={3000}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#00537A] focus:bg-white transition-all resize-none"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>Mínimo 10 caracteres</span>
                  <span>{description.length} / 3000 caracteres</span>
                </div>
              </div>

              {ticketFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs font-semibold">
                  {ticketFormError}
                </div>
              )}

              {/* Botón de envío */}
              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingTicket || subject.trim().length < 3 || description.trim().length < 10}
                  className="px-6 py-3 bg-[#00537A] text-white text-xs sm:text-sm font-bold rounded-2xl hover:bg-[#003d59] transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>{submittingTicket ? 'Registrando...' : 'Enviar solicitud'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* PESTAÑA B: MIS SOLICITUDES */}
        {activeTab === 'list' && (
          <div className="space-y-5">
            {/* Filtros de la lista */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              {/* Pestañas de estado */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-[#00537A] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todas
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
                  Pendientes
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
                  En proceso
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
                  Resueltas
                </button>
              </div>

              {/* Buscador rápido */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por asunto o ID..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
                />
              </div>
            </div>

            {/* Error state */}
            {errorTickets && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm flex items-center justify-between">
                <span>{errorTickets}</span>
                <button
                  type="button"
                  onClick={loadTickets}
                  className="text-xs font-bold underline hover:no-underline ml-4"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Skeleton loader */}
            {loadingTickets && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse space-y-3">
                    <div className="h-4 bg-slate-200 rounded w-1/4" />
                    <div className="h-6 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {/* Lista de Tarjetas de Tickets */}
            {!loadingTickets && filteredTickets.length > 0 && (
              <div className="space-y-3">
                {filteredTickets.map((t) => {
                  const statusConfig = SUPPORT_STATUS_CONFIG[t.status] || SUPPORT_STATUS_CONFIG.pending;

                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 hover:border-[#00537A]/30 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500">
                            {t.ticketNumber}
                          </span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusConfig.bgClass} ${statusConfig.textClass} border ${statusConfig.borderClass}`}>
                            {statusConfig.label}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">
                            • {getCategoryLabel(t.category)}
                          </span>
                          {t.unreadForUser && (
                            <span className="bg-[#FFB800] text-[#7A5A00] text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs animate-pulse">
                              Nueva respuesta
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-[#00537A] transition-colors truncate">
                          {t.subject}
                        </h3>

                        <p className="text-xs text-slate-500 line-clamp-1">
                          {t.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 text-xs text-slate-400 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right space-y-0.5">
                          <span className="block font-medium text-slate-600">
                            {formatDate(t.lastActivityAt || t.createdAt)}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center sm:justify-end gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {t.messageCount || 0} respuestas
                          </span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#00537A] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Estado vacío */}
            {!loadingTickets && filteredTickets.length === 0 && (
              <div className="bg-[#E8F3F8]/40 border border-[#00537A]/20 rounded-3xl p-8 text-center max-w-lg mx-auto space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#00537A] text-white flex items-center justify-center mx-auto">
                  <Headphones className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-[#00537A]">
                  No se encontraron solicitudes
                </h4>
                <p className="text-sm text-slate-600">
                  {searchTerm || statusFilter !== 'all'
                    ? 'No hay solicitudes que coincidan con los filtros seleccionados.'
                    : 'Aún no tenés solicitudes de soporte registradas. Si experimentás algún problema, podés crear una nueva.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="px-4 py-2 bg-[#00537A] text-white text-xs font-bold rounded-xl hover:bg-[#003d59] transition-colors inline-flex items-center gap-1.5 shadow-2xs mt-2"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Nueva solicitud
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Envoltorio según el rol del usuario (Profesor o Alumno)
  if (role === 'teacher') {
    return (
      <TeacherLayout activeSection="support" onNavigate={onNavigate}>
        {renderContent()}
      </TeacherLayout>
    );
  }

  return (
    <StudentLayout activeSection="support" onNavigate={onNavigate}>
      {renderContent()}
    </StudentLayout>
  );
};
