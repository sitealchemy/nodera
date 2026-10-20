import React, { useState } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Compass, 
  Plus, 
  Info 
} from 'lucide-react';
import { ProjectAssumption } from '../../types/document';

interface IntakeViewProps {
  onGenerateDirections: (notes: string, assumptions: ProjectAssumption[]) => void;
  onLoadDemoProject: () => void;
}

export const IntakeView: React.FC<IntakeViewProps> = ({
  onGenerateDirections,
  onLoadDemoProject
}) => {
  const [interviewNotes, setInterviewNotes] = useState(
    `Klient: Magda i Piotr Winiarscy, pracownia ceramiczna w Kazimierzu Dolnym.
Chcą stronę firmową z podstronami: Start, Warsztaty, O pracowni, Kontakt.
Główny cel: pokazać surowe, autorskie naczynia toczone na kole i zapełnić terminy weekendowych warsztatów ceramicznych.
Cennik: Kurs toczenia na kole (2 dni) - 850 zł/os. Formowanie z płata (1 dzień) - 480 zł/os.
Klimat: ciepły, ziemisty, wabi-sabi, naturalna glina, miedź, drewno. Brak dominujących jaskrawych kolorów.
Materiały: posiadają zdjęcia naczyń i pracowni, logo mamy w wektorze. Formularz zapytania o wolne terminy.`
  );

  const [assumptions, setAssumptions] = useState<ProjectAssumption[]>([
    { id: '1', category: 'cel', label: 'Główny cel', value: 'Prezentacja autorskiej ceramiki użytkowej oraz rejestracja na weekendowe warsztaty toczenia.' },
    { id: '2', category: 'odbiorcy', label: 'Grupa odbiorców', value: 'Osoby ceniące rzemiosło do domu oraz dorośli szukający odpoczynku twórczego w Kazimierzu Dolnym.' },
    { id: '3', category: 'charakter', label: 'Charakter wizualny', value: 'Wabi-sabi, surowa faktura gliny, ciepła złamana biel, grafit i oszczędna miedź.' },
    { id: '4', category: 'materialy', label: 'Dostępne materiały', value: 'Zdjęcia z pracowni, cennik warsztatów (850 zł / 480 zł), logo autorskie.' },
    { id: '5', category: 'braki', label: 'Brakujące informacje', value: 'Brak natychmiastowych płatności online — wdrożenie formularza zapytania o termin.' }
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerateDirections(interviewNotes, assumptions);
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#292824] flex flex-col justify-between p-6 sm:p-12 font-sans selection:bg-[#A86645]/20 selection:text-[#292824]">
      
      {/* Top Bar */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#292824] text-white flex items-center justify-center font-serif font-bold text-base">
            N
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight">Nodera</span>
            <span className="text-[10px] text-[#706C65] font-medium ml-1.5">by Brainode</span>
          </div>
        </div>

        <button
          onClick={onLoadDemoProject}
          className="text-xs font-semibold text-[#A86645] hover:text-[#935537] px-3 py-1.5 rounded-lg border border-[#DED9CF] bg-[#FFFEFB] shadow-sm transition-all"
        >
          Wczytaj gotowe demo: Pracownia Splot →
        </button>
      </header>

      {/* Main Intake Form */}
      <main className="max-w-3xl mx-auto w-full my-8 space-y-8">
        
        <div className="space-y-3 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#A86645]">
            Etap 1 · Brief i notatki z wywiadu
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#292824]">
            Co chcesz stworzyć?
          </h1>
          <p className="text-sm sm:text-base text-[#706C65] leading-relaxed max-w-2xl">
            Wklej surowe notatki z rozmowy z klientem, opis projektu lub wymagania. Nodera wyodrębni kluczowe założenia i przygotuje trzy wyraziste kierunki projektowe.
          </p>
        </div>

        {/* Input Card */}
        <form onSubmit={handleSubmit} className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl p-6 shadow-sm space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#292824] uppercase tracking-wider block">
              Notatki, materiały i wywiad z klientem
            </label>
            <textarea
              value={interviewNotes}
              onChange={(e) => setInterviewNotes(e.target.value)}
              rows={7}
              placeholder="Wklej tutaj notatki, cennik, styl, branżę lub cokolwiek przekazał klient..."
              className="w-full p-4 bg-[#F6F4EF] border border-[#DED9CF] rounded-xl text-xs sm:text-sm text-[#292824] focus:outline-none focus:border-[#A86645] resize-none leading-relaxed font-sans"
            />
          </div>

          {/* Extracted Assumptions (Sekcja 4.A) */}
          <div className="space-y-3 pt-2 border-t border-[#DED9CF]/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#A86645]" />
                Wyodrębnione założenia projektowe (edytowalne)
              </span>
              <span className="text-[11px] text-[#706C65]">Bez wymyślania fikcyjnych faktów</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {assumptions.map((ass) => (
                <div key={ass.id} className="p-3 rounded-xl bg-[#F6F4EF] border border-[#DED9CF] flex items-start gap-3 text-xs">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider shrink-0 mt-0.5 ${
                    ass.category === 'cel' ? 'bg-[#A86645]/15 text-[#A86645]' :
                    ass.category === 'braki' ? 'bg-amber-500/15 text-amber-700' :
                    'bg-[#292824]/10 text-[#292824]'
                  }`}>
                    {ass.category}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[#292824] block">{ass.label}:</span>
                    <span className="text-[#706C65]">{ass.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-[#706C65]">
              Nodera przygotuje 3 kierunki: wierny briefowi, interpretujący i odkrywczy.
            </span>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#A86645] hover:bg-[#935537] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span>Pokaż 3 kierunki projektowe</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </form>

      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-[#706C65] py-4">
        Nodera by Brainode · Spokojne, precyzyjne narzędzie dla designerów i frontend developerów
      </footer>

    </div>
  );
};
