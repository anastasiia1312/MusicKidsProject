import React from 'react';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div
      id="landing-page-root"
      className="min-h-screen bg-[#F0F4F8] text-slate-900 flex flex-col justify-between selection:bg-[#FAB816]/30 selection:text-[#00537A]"
    >
      {/* Barra de Navegación Superior */}
      <header
        id="landing-header"
        className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-8 pb-4 flex items-center justify-between shrink-0"
      >
        {/* Logotipo MusicKids: Abril Fatface 32px #00537A + Clave de sol amarilla */}
        <div
          id="landing-logo"
          className="flex items-center gap-1 cursor-pointer group select-none"
          onClick={() => onNavigate('/')}
        >
          <span
            className="font-abril text-[28px] sm:text-[32px] text-[#00537A] tracking-normal leading-none"
            style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
          >
            Music
          </span>
          <img
            src="/images/logo-clef.png"
            alt="Clave de Sol MusicKids"
            className="h-9 sm:h-11 w-auto object-contain -mx-0.5 -mt-1 select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
          <span
            className="font-abril text-[28px] sm:text-[32px] text-[#00537A] tracking-normal leading-none"
            style={{ fontFamily: "'Abril Fatface', cursive, serif" }}
          >
            Kids
          </span>
        </div>

        {/* Botón Superior Derecho: Comenzar (lleva al sistema de acceso/login) */}
        <button
          id="landing-nav-comenzar-btn"
          type="button"
          onClick={() => onNavigate('/login')}
          className="rounded-full bg-[#00537A] hover:bg-[#004262] active:scale-95 text-white text-sm font-semibold px-6 py-2.5 transition-all duration-150 cursor-pointer shadow-none focus:outline-none focus:ring-2 focus:ring-[#00537A]/40"
        >
          Comenzar
        </button>
      </header>

      {/* Hero Section Principal */}
      <main
        id="landing-hero-section"
        className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-6 md:py-10 flex-1 flex items-center"
      >
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Columna Izquierda: Título, Descripción y CTA Principal */}
          <div className="lg:col-span-7 flex flex-col items-start justify-center space-y-6 lg:space-y-8">
            {/* Título Principal: Parkinsans 48px, tracking 15%, 3 líneas con punto final */}
            <h1
              id="landing-hero-title"
              className="font-parkinsans text-3xl sm:text-4xl lg:text-[48px] font-normal text-[#00537A] leading-[1.18] sm:leading-[1.15]"
              style={{
                fontFamily: "'Parkinsans', sans-serif",
                letterSpacing: '0.15em',
              }}
            >
              <span className="block">Desata la</span>
              <span className="block">
                <span className="text-[#FAB816]">Magia</span> de la
              </span>
              <span className="block">Música.</span>
            </h1>

            {/* Texto Descriptivo: Siemreap 20px, #000000, entrecomillado, ancho acotado */}
            <p
              id="landing-hero-description"
              className="font-siemreap text-base sm:text-lg lg:text-[20px] font-normal text-black leading-relaxed max-w-xl text-left"
              style={{
                fontFamily: "'Siemreap', sans-serif",
                letterSpacing: '0%',
              }}
            >
              “Descubre la magia de aprender música con profesores reales, clases
              en vivo y actividades diseñadas especialmente para cada niño.
              Aprende, crea y disfruta desde cualquier lugar del mundo.”
            </p>

            {/* CTA Principal: Empieza a Aprender Hoy (lleva al registro) */}
            <div className="pt-2">
              <button
                id="landing-hero-cta-btn"
                type="button"
                onClick={() => onNavigate('/register')}
                className="rounded-full bg-[#00537A] hover:bg-[#004262] active:scale-98 text-white font-medium text-base sm:text-lg px-8 py-3.5 sm:px-10 sm:py-4 transition-all duration-200 cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#00537A]/40"
              >
                Empieza a Aprender Hoy
              </button>
            </div>
          </div>

          {/* Columna Derecha: Fotografía Hero */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[460px] lg:max-w-[520px] overflow-hidden rounded-tl-[48px] rounded-tr-[32px] rounded-bl-[48px] rounded-br-[24px] shadow-lg shadow-[#00537A]/10 bg-slate-200">
              <img
                id="landing-hero-image"
                src="/images/landing-hero.png"
                alt="Niña tocando ukulele y aprendiendo música online en MusicKids"
                className="w-full h-auto aspect-square object-cover select-none"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Espaciado inferior de balance geométrico */}
      <footer className="w-full py-4 text-center text-xs text-slate-400 select-none">
        {/* Espacio reservado para balance visual */}
      </footer>
    </div>
  );
};
