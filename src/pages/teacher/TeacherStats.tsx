import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  PieChart as PieChartIcon,
  BarChart3,
  RefreshCw,
  Info,
  CalendarDays,
  Percent,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TeacherLayout } from '../../components/teacher/TeacherLayout';
import {
  fetchTeacherStatsData,
  calculateTeacherStats,
  type StatsPeriodKey,
  type TeacherStatsResult,
  type TeacherStatsRawData,
  type MonthlyChartDataPoint,
} from '../../services/teacherStatsService';

interface TeacherStatsProps {
  onNavigate: (path: string) => void;
}

export const TeacherStats: React.FC<TeacherStatsProps> = ({ onNavigate }) => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<TeacherStatsRawData>({
    lessons: [],
    monthlyBookings: [],
    recurringSlots: [],
    students: [],
  });

  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodKey>('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState<'income' | 'classes'>('income');

  // Carga inicial de datos desde Firestore
  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeacherStatsData(user.uid);
      setRawData(data);
    } catch (err: any) {
      console.error('Error al cargar datos estadísticos:', err);
      setError('No pudimos cargar la información de estadísticas. Por favor reintentá.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.uid]);

  // Cálculo de estadísticas en memoria según el período seleccionado
  const stats: TeacherStatsResult = useMemo(() => {
    return calculateTeacherStats(
      rawData,
      selectedPeriod,
      customStartDate,
      customEndDate
    );
  }, [rawData, selectedPeriod, customStartDate, customEndDate]);

  // Formato de moneda ARS
  const formatCurrency = (val: number) => {
    return `$ ${val.toLocaleString('es-AR')} ARS`;
  };

  // Renderizador de delta porcentual
  const renderDeltaBadge = (delta: number | null, inverse = false) => {
    if (delta === null) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          <Minus className="w-3 h-3" /> Sin referencia previa
        </span>
      );
    }

    const isPositive = delta > 0;
    const isZero = delta === 0;

    if (isZero) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
          <Minus className="w-3 h-3" /> 0% vs período anterior
        </span>
      );
    }

    const isGood = inverse ? !isPositive : isPositive;
    const colorClass = isGood
      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
      : 'text-amber-700 bg-amber-50 border border-amber-200/60';

    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {isPositive ? `+${delta}%` : `${delta}%`} vs período anterior
      </span>
    );
  };

  return (
    <TeacherLayout activeSection="stats" onNavigate={onNavigate}>
      <div className="space-y-6 pb-12 max-w-[1400px] mx-auto w-full">
        {/* ENCABEZADO Y SELECTOR DE PERÍODO */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F8] text-[#00537A] text-xs font-bold uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5" />
              Métricas & Desempeño
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
              Estadísticas del Profesor
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl">
              Monitoreá tus alumnos activos, clases completadas, ingresos mensuales confirmados y la ocupación de tus horarios.
            </p>
          </div>

          {/* Filtros de Período */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="bg-slate-100/90 p-1.5 rounded-2xl flex flex-wrap gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('this_month');
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'this_month'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('last_month');
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'last_month'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Mes anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('last_3_months');
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'last_3_months'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Últimos 3 meses
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('last_6_months');
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'last_6_months'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Últimos 6 meses
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('this_year');
                  setShowCustomPicker(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'this_year'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Este año
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPeriod('custom');
                  setShowCustomPicker(!showCustomPicker);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedPeriod === 'custom'
                    ? 'bg-white text-[#00537A] shadow-sm'
                    : 'text-slate-600 hover:text-[#00537A]'
                }`}
              >
                Personalizado
              </button>
            </div>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              title="Actualizar estadísticas"
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-[#00537A] hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00537A]' : ''}`} />
            </button>
          </div>
        </div>

        {/* SELECTOR PERSONALIZADO (POP-OVER / BARRA INLINE) */}
        {showCustomPicker && selectedPeriod === 'custom' && (
          <div className="bg-[#E8F3F8]/50 border border-[#00537A]/20 rounded-2xl p-4 flex flex-wrap items-center gap-4 text-sm animate-in fade-in duration-200">
            <span className="font-bold text-[#00537A] flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" /> Rango de fechas:
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start" className="text-xs font-semibold text-slate-600">
                Desde:
              </label>
              <input
                id="custom-start"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end" className="text-xs font-semibold text-slate-600">
                Hasta:
              </label>
              <input
                id="custom-end"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00537A]"
              />
            </div>
            <span className="text-xs text-slate-500 italic">
              (Zona horaria oficial: America/Argentina/Buenos_Aires)
            </span>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadData}
              className="text-xs font-bold underline hover:no-underline ml-4"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* SKELETON LOADER */}
        {loading && !rawData.lessons.length && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-pulse space-y-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-200" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
                <div className="h-8 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        )}

        {/* 1. TARJETAS DE INDICADORES PRINCIPALES (KPIs) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* KPI 1: Alumnos Activos */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Alumnos Activos
                </span>
                <div className="w-11 h-11 rounded-2xl bg-[#E8F3F8] text-[#00537A] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {stats.summary.activeStudentsCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Alumnos con abonos o clases en {stats.periodLabel.toLowerCase()}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              {renderDeltaBadge(stats.summary.activeStudentsDeltaPercent)}
            </div>
          </div>

          {/* KPI 2: Clases Realizadas */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clases Realizadas
                </span>
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {stats.summary.completedLessonsCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Completadas efectivamente en el período
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              {renderDeltaBadge(stats.summary.completedLessonsDeltaPercent)}
            </div>
          </div>

          {/* KPI 3: Clases Programadas */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clases Programadas
                </span>
                <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {stats.summary.scheduledLessonsCount}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Agendadas activas en el período
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              {renderDeltaBadge(stats.summary.scheduledLessonsDeltaPercent)}
            </div>
          </div>

          {/* KPI 4: Pagos Recibidos */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pagos Recibidos
                </span>
                <div className="w-11 h-11 rounded-2xl bg-[#FFF6D6] text-[#A67800] flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#00537A] tracking-tight">
                {formatCurrency(stats.summary.confirmedIncomeARS)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Total de abonos confirmados en el período
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100">
              {renderDeltaBadge(stats.summary.confirmedIncomeDeltaPercent)}
            </div>
          </div>
        </div>

        {/* 2. GRÁFICOS ESTADÍSTICOS NATIVOS SVG */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* GRÁFICO 1 & 2: Evolución Mensual (Ingresos / Actividad de clases) */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#00537A]" />
                  Evolución Mensual
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparativa cronológica de ingresos y volumen de clases
                </p>
              </div>

              {/* Toggle de modo del gráfico */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveChartTab('income')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                    activeChartTab === 'income'
                      ? 'bg-white text-[#00537A] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ingresos ($ ARS)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('classes')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                    activeChartTab === 'classes'
                      ? 'bg-white text-[#00537A] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Actividad de Clases
                </button>
              </div>
            </div>

            {/* Canvas SVG del Gráfico de Barras */}
            <div className="w-full h-64 sm:h-72 relative">
              <MonthlyBarChart
                data={stats.monthlyTrend}
                mode={activeChartTab}
              />
            </div>

            {/* Leyenda y Notas */}
            <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500 gap-3">
              {activeChartTab === 'income' ? (
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[#00537A] inline-block" />
                    Abonos Confirmados (ARS)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                    Clases Realizadas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-sky-500 inline-block" />
                    Clases Programadas
                  </span>
                </div>
              )}
              <span className="italic">Valores consolidados por mes calendario</span>
            </div>
          </div>

          {/* GRÁFICO 3: Distribución de Clases (Donut Chart) */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-[#00537A]" />
                  Distribución de Clases
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {stats.classDistribution.total} total
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Estado de las clases registradas en {stats.periodLabel.toLowerCase()}
              </p>

              {/* Gráfico SVG de Dona */}
              <div className="flex justify-center my-4">
                <ClassDistributionDonut distribution={stats.classDistribution} />
              </div>
            </div>

            {/* Leyenda detallada con porcentajes y totales */}
            <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  Programadas
                </span>
                <span className="font-bold text-slate-900">
                  {stats.classDistribution.scheduled} ({stats.classDistribution.scheduledPercent}%)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Realizadas
                </span>
                <span className="font-bold text-slate-900">
                  {stats.classDistribution.completed} ({stats.classDistribution.completedPercent}%)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  Canceladas
                </span>
                <span className="font-bold text-slate-900">
                  {stats.classDistribution.cancelled} ({stats.classDistribution.cancelledPercent}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. INDICADORES DE DESEMPEÑO (PERFORMANCE CARDS) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-[#00537A] flex items-center gap-2">
                <Percent className="w-5 h-5 text-[#00537A]" />
                Indicadores de Desempeño
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Métricas avanzadas de productividad, ocupación y relación con tus alumnos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Indicador 1: Promedio de clases por alumno */}
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Promedio por Alumno
                </span>
                <div className="text-2xl font-extrabold text-slate-900">
                  {stats.performance.avgLessonsPerStudent} <span className="text-sm font-semibold text-slate-500">clases / alumno</span>
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  Frecuencia promedio de clases en el período seleccionado.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/50 flex items-center justify-between text-xs">
                <span className="text-slate-500">Total clases activas:</span>
                <span className="font-bold text-[#00537A]">
                  {stats.summary.completedLessonsCount + stats.summary.scheduledLessonsCount}
                </span>
              </div>
            </div>

            {/* Indicador 2: Tasa de Ocupación */}
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Ocupación de Agenda
                </span>
                <div className="text-2xl font-extrabold text-slate-900">
                  {stats.performance.occupancyRatePercent !== null ? (
                    `${stats.performance.occupancyRatePercent}%`
                  ) : (
                    <span className="text-base text-slate-500 font-semibold">Sin cupos</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  {stats.performance.occupancyRatePercent !== null
                    ? `${stats.performance.totalOccupiedSlots} de ${stats.performance.totalAvailableSlots} cupos disponibles ocupados.`
                    : 'Configurá tus horarios recurrentes en Clases para medir tu ocupación.'}
                </p>
              </div>

              {/* Mini barra de progreso */}
              {stats.performance.occupancyRatePercent !== null && (
                <div className="mt-4 pt-3 border-t border-slate-200/50">
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#00537A] h-2 rounded-full transition-all duration-500"
                      style={{ width: `${stats.performance.occupancyRatePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Indicador 3: Tasa de Asistencia (Regla estricta: datos reales o no disponibles) */}
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Tasa de Asistencia
                </span>
                <div className="text-lg font-bold text-slate-700">
                  Datos no disponibles
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  La plataforma requiere registro explícito de presentismo para calcular este indicador sin inferencias arbitrarias.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/50 flex items-center gap-1.5 text-xs text-slate-500">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Solo datos verificados</span>
              </div>
            </div>

            {/* Indicador 4: Comparación Período Previo */}
            <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/60 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Evolución Global
                </span>
                <div className="text-2xl font-extrabold text-slate-900">
                  {renderDeltaBadge(stats.performance.previousPeriodComparison.incomeChangePercent)}
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  Crecimiento porcentual de ingresos respecto al período equivalente anterior.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/50 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Alumnos:</span>
                  <span className="font-bold text-slate-800">
                    {stats.performance.previousPeriodComparison.studentsChangePercent !== null
                      ? `${stats.performance.previousPeriodComparison.studentsChangePercent > 0 ? '+' : ''}${stats.performance.previousPeriodComparison.studentsChangePercent}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Clases:</span>
                  <span className="font-bold text-slate-800">
                    {stats.performance.previousPeriodComparison.lessonsChangePercent !== null
                      ? `${stats.performance.previousPeriodComparison.lessonsChangePercent > 0 ? '+' : ''}${stats.performance.previousPeriodComparison.lessonsChangePercent}%`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. ESTADO VACÍO / ORIENTACIÓN AL PROFESOR */}
        {!stats.hasData && !loading && (
          <div className="bg-[#E8F3F8]/40 border border-[#00537A]/20 rounded-3xl p-8 text-center max-w-xl mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#00537A] text-white flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-[#00537A]">
              ¡Empezá a registrar tu actividad docente!
            </h4>
            <p className="text-sm text-slate-600">
              Todavía no registrás clases o abonos en MusicKids. Podés programar clases individuales o activar tus horarios recurrentes para que los alumnos reserven abonos mensuales.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/teacher/lessons/new')}
                className="px-4 py-2 bg-[#00537A] text-white text-xs font-bold rounded-xl hover:bg-[#003d59] transition-colors flex items-center gap-1.5"
              >
                Nueva clase manual <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/teacher/availability')}
                className="px-4 py-2 bg-white border border-[#00537A]/30 text-[#00537A] text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Configurar horarios recurrentes
              </button>
            </div>
          </div>
        )}
      </div>
    </TeacherLayout>
  );
};

// ==========================================
// SUBCOMPONENTES SVG DE VISUALIZACIÓN NATIVA
// ==========================================

interface MonthlyBarChartProps {
  data: MonthlyChartDataPoint[];
  mode: 'income' | 'classes';
}

const MonthlyBarChart: React.FC<MonthlyBarChartProps> = ({ data, mode }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
        Sin datos disponibles para el período
      </div>
    );
  }

  // Dimensiones del canvas SVG
  const width = 600;
  const height = 240;
  const paddingBottom = 35;
  const paddingTop = 25;
  const paddingLeft = 15;
  const paddingRight = 15;

  const chartHeight = height - paddingBottom - paddingTop;
  const chartWidth = width - paddingLeft - paddingRight;

  // Valor máximo para escalar
  const maxValue = useMemo(() => {
    if (mode === 'income') {
      const max = Math.max(...data.map((d) => d.incomeARS), 1000);
      return Math.ceil(max * 1.15); // margen superior
    } else {
      const max = Math.max(...data.map((d) => d.totalClasses), 4);
      return Math.ceil(max * 1.2);
    }
  }, [data, mode]);

  const groupWidth = chartWidth / data.length;
  const barWidth = mode === 'income' ? Math.min(48, groupWidth * 0.5) : Math.min(22, groupWidth * 0.35);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full overflow-visible"
      preserveAspectRatio="none"
    >
      {/* Líneas de guía horizontales */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
        const y = height - paddingBottom - ratio * chartHeight;
        return (
          <line
            key={idx}
            x1={paddingLeft}
            y1={y}
            x2={width - paddingRight}
            y2={y}
            stroke="#F1F5F9"
            strokeWidth="1"
            strokeDasharray={ratio > 0 ? '4 4' : undefined}
          />
        );
      })}

      {/* Renderizado de Barras */}
      {data.map((d, index) => {
        const groupCenterX = paddingLeft + index * groupWidth + groupWidth / 2;

        if (mode === 'income') {
          const barHeight = (d.incomeARS / maxValue) * chartHeight;
          const x = groupCenterX - barWidth / 2;
          const y = height - paddingBottom - barHeight;

          return (
            <g key={d.monthKey} className="transition-all duration-300">
              {/* Barra de Ingreso */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx="6"
                className="fill-[#00537A] hover:fill-[#FFB800] transition-colors cursor-pointer"
              >
                <title>{`${d.monthLabel}: $ ${d.incomeARS.toLocaleString('es-AR')} ARS`}</title>
              </rect>

              {/* Etiqueta de valor sobre la barra */}
              {d.incomeARS > 0 && (
                <text
                  x={groupCenterX}
                  y={y - 8}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-slate-700"
                >
                  ${(d.incomeARS / 1000).toFixed(0)}k
                </text>
              )}

              {/* Etiqueta del mes (X) */}
              <text
                x={groupCenterX}
                y={height - 10}
                textAnchor="middle"
                className="text-[11px] font-semibold fill-slate-500"
              >
                {d.monthLabel}
              </text>
            </g>
          );
        } else {
          // Modo Actividad de Clases (2 barras agrupadas: realizadas vs programadas)
          const completedH = (d.completedClasses / maxValue) * chartHeight;
          const scheduledH = (d.scheduledClasses / maxValue) * chartHeight;

          const x1 = groupCenterX - barWidth - 2;
          const y1 = height - paddingBottom - completedH;

          const x2 = groupCenterX + 2;
          const y2 = height - paddingBottom - scheduledH;

          return (
            <g key={d.monthKey} className="transition-all duration-300">
              {/* Barra Realizadas (Emerald) */}
              <rect
                x={x1}
                y={y1}
                width={barWidth}
                height={Math.max(completedH, 2)}
                rx="4"
                className="fill-emerald-500 hover:fill-emerald-600 transition-colors cursor-pointer"
              >
                <title>{`${d.monthLabel} - Realizadas: ${d.completedClasses}`}</title>
              </rect>

              {/* Barra Programadas (Sky) */}
              <rect
                x={x2}
                y={y2}
                width={barWidth}
                height={Math.max(scheduledH, 2)}
                rx="4"
                className="fill-sky-500 hover:fill-sky-600 transition-colors cursor-pointer"
              >
                <title>{`${d.monthLabel} - Programadas: ${d.scheduledClasses}`}</title>
              </rect>

              {/* Etiqueta del mes (X) */}
              <text
                x={groupCenterX}
                y={height - 10}
                textAnchor="middle"
                className="text-[11px] font-semibold fill-slate-500"
              >
                {d.monthLabel}
              </text>
            </g>
          );
        }
      })}
    </svg>
  );
};

interface ClassDistributionDonutProps {
  distribution: {
    scheduled: number;
    completed: number;
    cancelled: number;
    total: number;
    scheduledPercent: number;
    completedPercent: number;
    cancelledPercent: number;
  };
}

const ClassDistributionDonut: React.FC<ClassDistributionDonutProps> = ({ distribution }) => {
  const { total, scheduled, completed, cancelled } = distribution;

  if (total === 0) {
    return (
      <div className="w-36 h-36 rounded-full border-4 border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-2">
        <span className="text-xs font-semibold text-slate-400">Sin clases en el período</span>
      </div>
    );
  }

  // Radio y circunferencia para trazo de SVG donut
  const size = 150;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const scheduledDash = (scheduled / total) * circumference;
  const completedDash = (completed / total) * circumference;
  const cancelledDash = (cancelled / total) * circumference;

  const scheduledOffset = 0;
  const completedOffset = -scheduledDash;
  const cancelledOffset = -(scheduledDash + completedDash);

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] transform"
      >
        {/* Fondo gris sutil */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="#F1F5F9"
          strokeWidth={strokeWidth}
        />

        {/* Segmento Programadas (Sky) */}
        {scheduled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#0284C7"
            strokeWidth={strokeWidth}
            strokeDasharray={`${scheduledDash} ${circumference - scheduledDash}`}
            strokeDashoffset={scheduledOffset}
            strokeLinecap="round"
          />
        )}

        {/* Segmento Realizadas (Emerald) */}
        {completed > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#10B981"
            strokeWidth={strokeWidth}
            strokeDasharray={`${completedDash} ${circumference - completedDash}`}
            strokeDashoffset={completedOffset}
            strokeLinecap="round"
          />
        )}

        {/* Segmento Canceladas (Red) */}
        {cancelled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#F87171"
            strokeWidth={strokeWidth}
            strokeDasharray={`${cancelledDash} ${circumference - cancelledDash}`}
            strokeDashoffset={cancelledOffset}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Centro del Donut */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">
          {total}
        </span>
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
          Clases
        </span>
      </div>
    </div>
  );
};
