import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Music,
  User,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
  DollarSign,
  Compass,
  Search,
  X,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getActiveTeachers,
  getInstrumentLabel,
  type PublicTeacherCard,
} from '../../services/teacherCatalogService';

interface TeacherCatalogProps {
  onNavigate: (path: string) => void;
}

export const TeacherCatalog: React.FC<TeacherCatalogProps> = ({ onNavigate }) => {
  const { userProfile } = useAuth();

  const [teachers, setTeachers] = useState<PublicTeacherCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros del Subbloque 4.2 con persistencia en sesión para conservar estado al volver del perfil
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try {
      return sessionStorage.getItem('musickids_catalog_search') || '';
    } catch {
      return '';
    }
  });

  const [selectedInstrument, setSelectedInstrument] = useState<string>(() => {
    try {
      return sessionStorage.getItem('musickids_catalog_instrument') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (searchQuery) {
        sessionStorage.setItem('musickids_catalog_search', searchQuery);
      } else {
        sessionStorage.removeItem('musickids_catalog_search');
      }
    } catch {
      // ignore
    }
  }, [searchQuery]);

  useEffect(() => {
    try {
      if (selectedInstrument) {
        sessionStorage.setItem('musickids_catalog_instrument', selectedInstrument);
      } else {
        sessionStorage.removeItem('musickids_catalog_instrument');
      }
    } catch {
      // ignore
    }
  }, [selectedInstrument]);

  const loadTeachers = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeTeachers = await getActiveTeachers();
      setTeachers(activeTeachers);
    } catch (err: any) {
      console.error('Error al cargar catálogo de profesores:', err);
      setError('No pudimos cargar la lista de profesores en este momento. Por favor, reintenta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  // Función auxiliar para normalizar texto (ignorar mayúsculas y acentos / diacríticos)
  const normalizeText = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };

  // Instrumentos disponibles generados dinámicamente a partir de los profesores activos
  const availableInstruments = useMemo(() => {
    const instrumentSet = new Set<string>();
    teachers.forEach((t) => {
      if (Array.isArray(t.instruments)) {
        t.instruments.forEach((inst) => {
          if (inst && typeof inst === 'string' && inst.trim().length > 0) {
            instrumentSet.add(inst.trim());
          }
        });
      }
    });
    return Array.from(instrumentSet).sort((a, b) =>
      getInstrumentLabel(a).localeCompare(getInstrumentLabel(b), 'es', { sensitivity: 'base' })
    );
  }, [teachers]);

  // Lista de profesores filtrados por nombre e instrumento (AND)
  const filteredTeachers = useMemo(() => {
    const cleanQuery = normalizeText(searchQuery.trim());
    return teachers.filter((teacher) => {
      const matchesSearch =
        cleanQuery === '' || normalizeText(teacher.name).includes(cleanQuery);
      const matchesInstrument =
        selectedInstrument === '' ||
        (Array.isArray(teacher.instruments) && teacher.instruments.includes(selectedInstrument));
      return matchesSearch && matchesInstrument;
    });
  }, [teachers, searchQuery, selectedInstrument]);

  const hasActiveFilters = searchQuery.trim().length > 0 || selectedInstrument !== '';

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedInstrument('');
    try {
      sessionStorage.removeItem('musickids_catalog_search');
      sessionStorage.removeItem('musickids_catalog_instrument');
    } catch {
      // ignore
    }
  };

  return (
    <div
      id="teacher-catalog-container"
      className="min-h-screen bg-[#F0F4F8] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#FFB800]/30 selection:text-[#00537A]"
    >
      {/* Elementos ambientales decorativos de fondo (Identidad MusicKids) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#D7E6F1]/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 sm:w-96 sm:h-96 bg-[#FFE29A]/30 rounded-full blur-3xl pointer-events-none" />
        <svg
          className="absolute bottom-0 left-0 w-80 h-80 sm:w-96 sm:h-96 opacity-75 pointer-events-none"
          viewBox="0 0 400 400"
          fill="none"
        >
          <path
            d="M -50 350 C 50 380, 100 300, 120 280 C 160 240, 80 180, 110 140 C 130 110, 180 130, 210 90"
            stroke="#FAB816"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* HEADER SUPERIOR */}
      <header
        id="teacher-catalog-header"
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between relative z-20"
      >
        {/* Brand & Botón volver */}
        <div className="flex items-center gap-3 sm:gap-6">
          <div
            id="navbar-brand"
            className="flex items-center gap-1 cursor-pointer group select-none"
            onClick={() => onNavigate('/student/dashboard')}
            title="Ir al Panel del Alumno"
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

          <button
            type="button"
            id="btn-back-to-dashboard"
            onClick={() => onNavigate('/student/dashboard')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 hover:text-[#00537A] text-xs sm:text-sm font-semibold border border-slate-200/90 shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span className="hidden xs:inline">Volver al Panel</span>
            <span className="xs:hidden">Volver</span>
          </button>
        </div>

        {/* Perfil del alumno en cápsula */}
        <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-full px-3.5 py-1.5 shadow-2xs select-none">
          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-semibold text-slate-800 max-w-[120px] sm:max-w-[180px] truncate">
            {userProfile?.name || 'Alumno'}
          </span>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        {/* Cabecera del Catálogo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] text-xs font-bold mb-2">
              <Compass className="w-3.5 h-3.5 text-[#00537A]" />
              <span>Explorar Clases Particulares</span>
            </div>
            <h1
              id="catalog-title"
              className="font-parkinsans text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00537A] tracking-tight"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              Profesores disponibles
            </h1>
            <p
              className="font-siemreap text-slate-600 text-sm sm:text-base mt-1 max-w-2xl"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Conocé a los profesores de música disponibles en MusicKids.
            </p>
          </div>

          {/* Contador y botón de refrescar */}
          <div className="flex items-center gap-3 self-start sm:self-center">
            {!loading && !error && teachers.length > 0 && (
              <span
                id="catalog-total-counter-badge"
                className="bg-white px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 border border-slate-200 shadow-2xs"
              >
                {hasActiveFilters
                  ? `${filteredTeachers.length} de ${teachers.length} ${teachers.length === 1 ? 'profesor' : 'profesores'}`
                  : `${teachers.length} ${teachers.length === 1 ? 'profesor disponible' : 'profesores disponibles'}`}
              </span>
            )}
            <button
              id="btn-refresh-catalog"
              type="button"
              onClick={loadTeachers}
              disabled={loading}
              className="bg-white hover:bg-slate-50 active:scale-95 text-slate-700 hover:text-[#00537A] font-semibold text-xs sm:text-sm px-4 py-2 rounded-full border border-slate-200/90 shadow-2xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-60"
              title="Actualizar listado"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00537A]' : 'text-slate-400'}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA Y FILTROS (Subbloque 4.2) */}
        {!loading && !error && teachers.length > 0 && (
          <div
            id="teacher-search-filter-bar"
            className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-100 shadow-xs mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5"
          >
            {/* 1. Búsqueda por nombre */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
              <input
                id="input-search-teacher-name"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar profesor por nombre..."
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-800 placeholder-slate-400 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/15 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  id="btn-clear-search-query"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda por nombre"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 2. Filtro por instrumento dinámico + Botón Limpiar filtros */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative min-w-[210px]">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
                <select
                  id="select-instrument-filter"
                  value={selectedInstrument}
                  onChange={(e) => setSelectedInstrument(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-800 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#00537A] focus:ring-2 focus:ring-[#00537A]/15 transition-all cursor-pointer appearance-none"
                  aria-label="Filtrar por instrumento"
                >
                  <option value="">Todos los instrumentos</option>
                  {availableInstruments.map((instrument) => (
                    <option key={instrument} value={instrument}>
                      {getInstrumentLabel(instrument)}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>

              {/* Botón para limpiar filtros */}
              {hasActiveFilters && (
                <button
                  id="btn-clear-all-filters"
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Restablecer búsqueda y filtros"
                >
                  <X className="w-4 h-4" />
                  <span>Limpiar filtros</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ESTADOS: CARGA / ERROR / VACÍO TOTAL / SIN RESULTADOS DE FILTRO / GRILLA */}
        {loading ? (
          <div
            id="catalog-loading-state"
            className="bg-white rounded-[28px] p-12 sm:p-16 border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-3 shadow-xs"
          >
            <Loader2 className="w-10 h-10 animate-spin text-[#00537A]" />
            <h3 className="font-parkinsans text-base sm:text-lg font-bold text-slate-800">
              Cargando profesores disponibles...
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Consultando la red de profesores de MusicKids
            </p>
          </div>
        ) : error ? (
          <div
            id="catalog-error-state"
            className="bg-rose-50 border border-rose-200 rounded-[28px] p-8 sm:p-10 text-center flex flex-col items-center gap-4 max-w-xl mx-auto shadow-xs"
          >
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-rose-900">
                Ocurrió un inconveniente
              </h3>
              <p className="text-sm text-rose-700 mt-1">{error}</p>
            </div>
            <button
              type="button"
              id="btn-retry-catalog"
              onClick={loadTeachers}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-full shadow-2xs transition cursor-pointer"
            >
              Reintentar carga
            </button>
          </div>
        ) : teachers.length === 0 ? (
          <div
            id="catalog-empty-state"
            className="bg-white rounded-[28px] p-10 sm:p-16 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs max-w-2xl mx-auto"
          >
            <div className="w-20 h-20 rounded-3xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center mb-5">
              <Music className="w-10 h-10" />
            </div>
            <h3
              className="font-parkinsans text-xl sm:text-2xl font-bold text-slate-800 mb-2"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              No hay profesores disponibles en este momento
            </h3>
            <p
              className="font-siemreap text-sm sm:text-base text-slate-500 max-w-md mb-6"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Los profesores activos aparecerán aquí ni bien estén registrados en la plataforma. Vuelve a consultar pronto.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('/student/dashboard')}
              className="bg-[#00537A] hover:bg-[#004262] text-white font-semibold text-sm px-6 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer"
            >
              Volver a mi panel
            </button>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div
            id="catalog-no-results-state"
            className="bg-white rounded-[28px] p-10 sm:p-14 border border-slate-100 text-center flex flex-col items-center justify-center shadow-xs max-w-xl mx-auto"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#FFF5DB] text-[#FFB800] flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-[#00537A]" />
            </div>
            <h3
              className="font-parkinsans text-lg sm:text-xl font-bold text-slate-800 mb-2"
              style={{ fontFamily: "'Parkinsans', sans-serif" }}
            >
              No encontramos profesores con esos criterios.
            </h3>
            <p
              className="font-siemreap text-xs sm:text-sm text-slate-500 max-w-md mb-6"
              style={{ fontFamily: "'Siemreap', sans-serif" }}
            >
              Probá con otro término de búsqueda o seleccioná &ldquo;Todos los instrumentos&rdquo; para ver otras opciones disponibles.
            </p>
            <button
              id="btn-empty-clear-filters"
              type="button"
              onClick={handleClearFilters}
              className="bg-[#00537A] hover:bg-[#004262] text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-full shadow-2xs transition-all cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Limpiar filtros</span>
            </button>
          </div>
        ) : (
          <div>
            {/* Barra informativa de resultados activos */}
            {hasActiveFilters && (
              <div className="mb-4 flex items-center justify-between text-xs sm:text-sm text-slate-500 px-1">
                <span>
                  Resultados encontrados:{' '}
                  <strong className="text-slate-800 font-bold">
                    {filteredTeachers.length} {filteredTeachers.length === 1 ? 'profesor' : 'profesores'}
                  </strong>
                </span>
                <button
                  type="button"
                  id="link-reset-filters"
                  onClick={handleClearFilters}
                  className="text-[#00537A] hover:text-[#003852] font-semibold hover:underline cursor-pointer text-xs"
                >
                  Restablecer filtros
                </button>
              </div>
            )}

            <div
              id="teachers-grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredTeachers.map((teacher) => (
                <div
                  key={teacher.uid}
                  id={`teacher-card-${teacher.uid}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onNavigate(`/teacher/${teacher.uid}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onNavigate(`/teacher/${teacher.uid}`);
                    }
                  }}
                  aria-label={`Ver perfil público del profesor ${teacher.name}`}
                  className="bg-white rounded-[28px] p-6 shadow-xs border border-slate-100 hover:shadow-lg hover:border-[#00537A]/30 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#00537A]/40 transition-all duration-200 flex flex-col justify-between group cursor-pointer select-none"
                >
                  {/* Parte superior: Avatar + Nombre */}
                  <div>
                    <div className="flex items-center gap-4 mb-4">
                      {/* Fotografía o Avatar */}
                      {teacher.photoURL ? (
                        <img
                          src={teacher.photoURL}
                          alt={`Fotografía de ${teacher.name}`}
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-[#DDF1F8] shrink-0 group-hover:border-[#00537A]/40 transition-colors"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-[#DDF1F8] text-[#00537A] flex items-center justify-center shrink-0 group-hover:bg-[#c9e7f4] transition-colors">
                          <Music className="w-7 h-7 stroke-[2]" />
                        </div>
                      )}

                      {/* Nombre y distintivo */}
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FAB816] uppercase tracking-wider mb-0.5">
                          <Sparkles className="w-3 h-3 text-[#FAB816]" />
                          <span>Profesor MusicKids</span>
                        </div>
                        <h3
                          className="font-parkinsans text-lg sm:text-xl font-bold text-slate-900 truncate group-hover:text-[#00537A] transition-colors"
                          style={{ fontFamily: "'Parkinsans', sans-serif" }}
                          title={teacher.name}
                        >
                          {teacher.name}
                        </h3>
                      </div>
                    </div>

                    {/* Instrumentos que enseña */}
                    <div className="mb-4">
                      <span className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                        Instrumentos
                      </span>
                      {teacher.instruments && teacher.instruments.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {teacher.instruments.map((inst) => (
                            <span
                              key={inst}
                              className="inline-flex items-center gap-1 bg-[#E8F3F8] text-[#00537A] text-xs font-medium px-2.5 py-1 rounded-full"
                            >
                              <Tag className="w-3 h-3 text-[#00537A]" />
                              {getInstrumentLabel(inst)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="inline-block bg-slate-100 text-slate-500 text-xs px-2.5 py-1 rounded-full">
                          Instrumentos no especificados
                        </span>
                      )}
                    </div>

                    {/* Biografía o Presentación */}
                    <div className="mb-6">
                      <span className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
                        Presentación
                      </span>
                      {teacher.bio ? (
                        <p
                          className="text-slate-600 text-xs sm:text-sm line-clamp-3 leading-relaxed"
                          title={teacher.bio}
                        >
                          {teacher.bio}
                        </p>
                      ) : (
                        <p className="text-slate-400 text-xs sm:text-sm italic">
                          Sin descripción disponible.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Parte inferior: Precio por clase individual y Ver Perfil */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#FFF5DB] text-[#FFB800] flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4 text-[#00537A] stroke-[2.5]" />
                      </div>
                      <div>
                        {teacher.singleLessonPrice !== undefined ? (
                          <>
                            <div className="flex items-baseline gap-1">
                              <span className="text-base sm:text-lg font-bold text-slate-900">
                                ${teacher.singleLessonPrice.toLocaleString('es-ES')}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                / clase
                              </span>
                            </div>
                            <span className="block text-[10px] text-slate-400">
                              Clase individual
                            </span>
                          </>
                        ) : (
                          <div>
                            <span className="text-xs sm:text-sm font-semibold text-slate-700">
                              Precio a consultar
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              Tarifa no configurada
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botón visual de enlace al perfil */}
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#00537A] group-hover:text-[#003852] transition-colors">
                      <span>Ver perfil</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full py-6 text-center text-xs text-slate-400 select-none">
        MusicKids — Catálogo oficial de profesores particulares
      </footer>
    </div>
  );
};
