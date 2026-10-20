import React, { useState } from 'react';
import { 
  Compass, 
  ArrowRight, 
  Check, 
  Layers, 
  Eye, 
  Columns, 
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { DirectionOption } from '../../types/document';
import { CERAMIC_IMAGES } from '../../data/splotDemo';

interface DirectionsViewProps {
  directions: Record<string, DirectionOption>;
  activeDirectionId: string;
  onSelectDirectionAndOpenEditor: (dirId: string) => void;
  onBackToIntake: () => void;
}

export const DirectionsView: React.FC<DirectionsViewProps> = ({
  directions,
  activeDirectionId,
  onSelectDirectionAndOpenEditor,
  onBackToIntake
}) => {
  const [comparing, setComparing] = useState<[string, string] | null>(null);

  const dirList = Object.values(directions);

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#292824] flex flex-col p-6 sm:p-12 font-sans selection:bg-[#A86645]/20 selection:text-[#292824]">
      
      {/* Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[#DED9CF]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToIntake}
            className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#FFFEFB] hover:bg-[#EFECE3] text-[#706C65] hover:text-[#292824] transition-colors"
            title="Wróć do wywiadu i założeń"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[#A86645]">
              Etap 2 · Trzy propozycje konceptu
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#292824]">
              Wybierz kierunek dla: Pracownia Splot
            </h1>
          </div>
        </div>

        <div className="text-xs text-[#706C65] hidden sm:block">
          Pozostałe propozycje zostaną bezpiecznie zachowane na półce projektu.
        </div>
      </header>

      {/* Main Grid: 3 Distinct Directions */}
      <main className="max-w-6xl mx-auto w-full my-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dirList.map((dir, idx) => {
            const isSelected = dir.id === activeDirectionId;
            const previewImg = 
              dir.id === 'materia' ? CERAMIC_IMAGES.heroMateria :
              dir.id === 'pracownia' ? CERAMIC_IMAGES.heroPracownia :
              CERAMIC_IMAGES.heroRytm;

            return (
              <div
                key={dir.id}
                className={`bg-[#FFFEFB] border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'border-[#A86645] shadow-lg ring-2 ring-[#A86645]/30'
                    : 'border-[#DED9CF] hover:border-[#706C65] shadow-sm'
                }`}
              >
                {/* Visual Header / Thumbnail Mockup */}
                <div className="relative h-44 bg-[#ECE8DF] overflow-hidden">
                  <img
                    src={previewImg}
                    alt={dir.name}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 bg-[#FFFEFB]/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase text-[#292824] border border-[#DED9CF]">
                    Koncepcja #{idx + 1}
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-[#A86645] text-white px-2 py-0.5 rounded text-[10px] font-bold">
                      Aktualna
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#292824]">{dir.name}</h3>
                    <p className="text-xs font-semibold text-[#A86645] mt-0.5">{dir.subtitle}</p>
                    <p className="text-xs text-[#706C65] mt-2.5 leading-relaxed">{dir.concept}</p>
                  </div>

                  {/* Meta Specs */}
                  <div className="space-y-2 pt-3 border-t border-[#DED9CF]/70 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#706C65]">Typografia:</span>
                      <span className="font-medium text-[#292824] truncate max-w-[160px]">{dir.typography}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#706C65]">Nastrój:</span>
                      <span className="font-medium text-[#292824]">{dir.atmosphere}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#706C65]">Paleta barw:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: dir.colorPalette.surface }} />
                        <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: dir.colorPalette.copper }} />
                        <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: dir.colorPalette.primary }} />
                      </div>
                    </div>
                  </div>

                  {/* Subpages plan */}
                  <div className="space-y-1 pt-2 border-t border-[#DED9CF]/70 text-[11px]">
                    <span className="text-[#706C65] block font-semibold">Plan 4 podstron:</span>
                    <div className="flex flex-wrap gap-1">
                      {dir.subpagesPlan.map((p, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-[#F6F4EF] text-[#292824] font-medium text-[10px]">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Primary CTA */}
                  <button
                    onClick={() => onSelectDirectionAndOpenEditor(dir.id)}
                    className="w-full mt-4 py-2.5 px-4 rounded-xl bg-[#A86645] hover:bg-[#935537] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <span>Rozwijaj ten kierunek</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full text-center text-xs text-[#706C65] pt-6 border-t border-[#DED9CF]">
        Każdy kierunek można później wymienić lub przenieść wybrane sekcje bez utraty wprowadzonych treści.
      </footer>

    </div>
  );
};
