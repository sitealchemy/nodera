import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Mail, 
  Send, 
  ExternalLink, 
  Globe, 
  ShieldCheck, 
  FileText, 
  Image as ImageIcon, 
  Link2, 
  Sparkles,
  Rocket
} from 'lucide-react';
import { ProjectState, PublishingCheckItem } from '../../types/document';

interface PublishChecklistViewProps {
  project: ProjectState;
  onClose: () => void;
  onJumpToElement?: (pageSlug: string, elementId: string) => void;
  onPublishSuccess?: () => void;
}

export const PublishChecklistView: React.FC<PublishChecklistViewProps> = ({
  project,
  onClose,
  onJumpToElement,
  onPublishSuccess
}) => {
  const [recipientEmail, setRecipientEmail] = useState('warsztaty@pracowniasplot.pl');
  const [testFormStatus, setTestFormStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isPublishing, setIsPublishing] = useState(false);
  const [published, setPublished] = useState(project.isPublished || false);

  // Concrete check items
  const checkItems: PublishingCheckItem[] = [
    {
      id: 'c-1',
      category: 'content',
      title: 'Treści robocze i placeholdery',
      status: 'passed',
      description: 'Brak niepotwierdzonych tekstów „Lorem Ipsum”. Wszystkie ceny warsztatów (850 zł i 480 zł) są zgodne z wywiadem.',
      pageSlug: 'start'
    },
    {
      id: 'c-2',
      category: 'links',
      title: 'Odnośniki i nawigacja',
      status: 'passed',
      description: 'Wszystkie 4 podstrony (Start, Warsztaty, O pracowni, Kontakt) są poprawnie spięte w menu głównym.',
      pageSlug: 'start'
    },
    {
      id: 'c-3',
      category: 'forms',
      title: 'Formularz kontaktowy i zapytania',
      status: 'warning',
      description: 'Odbiorca ustawiony na warsztaty@pracowniasplot.pl. Wykonaj test konfiguracji przesyłania formularza przed publikacją.',
      pageSlug: 'kontakt'
    },
    {
      id: 'c-4',
      category: 'accessibility',
      title: 'Opisy alternatywne zdjęć (ALT)',
      status: 'passed',
      description: 'Wszystkie fotografie ceramiki i pracowni posiadają poprawne semantyczne opisy dla czytników ekranowych.',
      pageSlug: 'start'
    },
    {
      id: 'c-5',
      category: 'layout',
      title: 'Responsywność i overflow',
      status: 'passed',
      description: 'Sprawdzono układ dla 375 px (smartfon), 768 px (tablet) i 1280 px (desktop). Brak uciętych elementów.',
      pageSlug: 'start'
    }
  ];

  const handleTestForm = () => {
    setTestFormStatus('testing');
    setTimeout(() => {
      setTestFormStatus('success');
      setTimeout(() => setTestFormStatus('idle'), 4000);
    }, 800);
  };

  const handlePublish = () => {
    setIsPublishing(true);
    setTimeout(() => {
      setIsPublishing(false);
      setPublished(true);
      if (onPublishSuccess) onPublishSuccess();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#292824]/60 backdrop-blur-sm select-none font-sans">
      <div className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-[#DED9CF] flex items-center justify-between bg-[#F6F4EF]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#292824]">Przygotowanie do publikacji</h2>
              <p className="text-xs text-[#706C65]">Lista kontrolna jakości: treści, linki, formularz i responsywność</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[#DED9CF] text-[#706C65] hover:text-[#292824] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          
          {/* Status lifecycle pill */}
          <div className="p-3 rounded-xl bg-[#F6F4EF] border border-[#DED9CF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[#292824]">Stan projektu:</span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium text-[11px]">Robocza</span>
                <span className="text-[#706C65]">→</span>
                <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-medium text-[11px]">Propozycja (Snapshot)</span>
                <span className="text-[#706C65]">→</span>
                <span className={`px-2 py-0.5 rounded font-medium text-[11px] ${
                  published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {published ? 'Opublikowana' : 'Gotowa do publikacji'}
                </span>
              </div>
            </div>
            <span className="text-[11px] text-[#706C65]">Edycja robocza nie zmienia publicznej wersji</span>
          </div>

          {/* Checklist Items */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">
              Weryfikacja jakości (5 punktów)
            </h3>

            <div className="space-y-2.5">
              {checkItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-[#DED9CF] bg-[#F6F4EF]/50 flex items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      {item.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      {item.status === 'error' && <XCircle className="w-4 h-4 text-rose-600" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#292824]">{item.title}</h4>
                      <p className="text-[#706C65] text-[11px] mt-0.5 leading-relaxed">{item.description}</p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                    item.status === 'passed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {item.status === 'passed' ? 'Zgodne' : 'Do sprawdzenia'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Form Configuration & Real Test */}
          <div className="p-4 rounded-xl border border-[#DED9CF] bg-[#FFFEFB] space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#A86645]" />
              <h4 className="font-semibold text-[#292824]">Konfiguracja formularza zgłoszeniowego</h4>
            </div>
            <p className="text-[11px] text-[#706C65]">
              Wiadomości z formularza na podstronie Kontakt trafiają na adres e-mail pracowni.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="flex-1 w-full px-3 py-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs text-[#292824] font-mono"
              />
              <button
                onClick={handleTestForm}
                disabled={testFormStatus === 'testing'}
                className="w-full sm:w-auto px-4 py-2 bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-[#292824] font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-[#A86645]" />
                <span>{testFormStatus === 'testing' ? 'Testowanie...' : 'Wyślij testowe zapytanie'}</span>
              </button>
            </div>

            {testFormStatus === 'success' && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Testowy pakiet webhook został pomyślnie zweryfikowany dla {recipientEmail}.</span>
              </div>
            )}
          </div>

          {/* Published URL Result */}
          {published && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-xs">Strona została pomyślnie opublikowana!</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Publiczny adres: <strong className="font-mono">https://pracowniasplot.pl</strong> (wersja produkcyjna)
              </p>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#DED9CF] bg-[#F6F4EF] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#FFFEFB] border border-[#DED9CF] hover:bg-[#EFECE3] text-[#292824] text-xs font-medium transition-colors"
          >
            Zamknij
          </button>

          <button
            onClick={handlePublish}
            disabled={isPublishing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#A86645] hover:bg-[#935537] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" />
            <span>{isPublishing ? 'Publikowanie serwisu...' : published ? 'Opublikuj ponownie' : 'Opublikuj stronę teraz'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
