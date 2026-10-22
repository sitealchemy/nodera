import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { GenerationStatus, ProjectSummary } from '../../projects/types';

/**
 * The start screen: one prompt, and the projects that already exist.
 *
 * No statistics, no sidebar, no admin panels — the page the user is about to
 * make is the subject, and the list is a quiet way back to earlier work.
 */

export interface DashboardViewProps {
  projects: ProjectSummary[];
  loading: boolean;
  storageError: string | null;
  /** Explains a missing API key before the user spends a prompt on it. */
  configMessage: string;
  creating: boolean;
  onCreate: (prompt: string) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onLoadDemo: () => void;
}

const STATUS_LABEL: Record<GenerationStatus, string> = {
  none: 'Szkic',
  starting: 'Uruchamianie',
  generating: 'Generowanie',
  importing: 'Przygotowanie',
  waiting: 'Czeka na odpowiedź',
  ready: 'Gotowy',
  error: 'Błąd',
};

const STATUS_TONE: Record<GenerationStatus, string> = {
  none: 'bg-[#F6F4EF] text-[#706C65] border-[#DED9CF]',
  starting: 'bg-[#A86645]/10 text-[#A86645] border-[#A86645]/30',
  generating: 'bg-[#A86645]/10 text-[#A86645] border-[#A86645]/30',
  importing: 'bg-[#A86645]/10 text-[#A86645] border-[#A86645]/30',
  waiting: 'bg-amber-50 text-amber-800 border-amber-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};

const IN_PROGRESS: GenerationStatus[] = ['starting', 'generating', 'importing'];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A calm stand-in for a thumbnail, seeded by the project id. */
const PlaceholderPreview: React.FC<{ seed: string; heading: string }> = ({ seed, heading }) => {
  const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 40;
  return (
    <div
      className="h-28 rounded-lg border border-[#DED9CF] overflow-hidden flex flex-col justify-end p-3"
      style={{
        background: `linear-gradient(160deg, hsl(${30 + hue} 30% 96%), hsl(${20 + hue} 24% 90%))`,
      }}
    >
      <div className="space-y-1.5">
        <div className="h-1.5 w-10 rounded-full bg-[#A86645]/50" />
        <p className="text-[11px] font-semibold text-[#292824] leading-snug line-clamp-2">
          {heading || 'Bez nagłówka'}
        </p>
        <div className="h-1 w-20 rounded-full bg-[#292824]/15" />
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  loading,
  storageError,
  configMessage,
  creating,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  onLoadDemo,
}) => {
  const [prompt, setPrompt] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || creating) return;
    onCreate(text);
    setPrompt('');
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#292824] font-sans">
      <header className="px-6 sm:px-10 py-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#292824] flex items-center justify-center text-white font-serif font-bold">
          N
        </div>
        <div className="leading-tight">
          <span className="font-bold text-sm tracking-tight">Nodera</span>
          <span className="text-[11px] text-[#706C65] ml-1.5">by Brainode</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 sm:px-10 pb-20">
        <section className="pt-8 pb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Co chcesz stworzyć?
          </h1>
          <p className="text-sm text-[#706C65] mb-6 max-w-xl leading-relaxed">
            Opisz stronę, którą chcesz zbudować. Nodera przygotuje propozycję, którą otworzysz
            w edytorze i dopracujesz.
          </p>

          <form onSubmit={submit} className="space-y-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              placeholder="np. Strona dla małej piekarni rzemieślniczej w Gdańsku — pieczywo na zakwasie, sklep stacjonarny, zamówienia na telefon."
              aria-label="Opis strony"
              className="w-full p-4 bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl text-sm leading-relaxed focus:outline-none focus:border-[#A86645] resize-none shadow-sm"
            />

            {configMessage && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{configMessage}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="submit"
                disabled={!prompt.trim() || creating}
                className="px-5 py-3 rounded-xl bg-[#A86645] hover:bg-[#935537] text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-40 transition-colors shadow-sm"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Stwórz stronę</span>
              </button>

              <button
                type="button"
                onClick={onLoadDemo}
                className="text-xs text-[#706C65] hover:text-[#292824] underline underline-offset-4"
              >
                Otwórz projekt demonstracyjny
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#706C65] mb-3">
            Projekty
          </h2>

          {storageError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-800 mb-4">
              {storageError}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[#706C65] py-8">Wczytuję projekty…</p>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-[#DED9CF] rounded-2xl">
              <FileText className="w-6 h-6 text-[#DED9CF] mx-auto mb-3" />
              <p className="text-sm text-[#292824] font-medium">Nie masz jeszcze żadnego projektu</p>
              <p className="text-xs text-[#706C65] mt-1">
                Opisz powyżej, co chcesz stworzyć, albo otwórz projekt demonstracyjny.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl p-3 shadow-sm flex flex-col gap-3"
                >
                  <button
                    onClick={() => onOpen(project.id)}
                    className="text-left"
                    aria-label={`Otwórz ${project.name}`}
                  >
                    <PlaceholderPreview seed={project.id} heading={project.previewHeading} />
                  </button>

                  <div className="flex-1 min-w-0">
                    {renamingId === project.id ? (
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={() => commitRename(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename(project.id);
                          if (event.key === 'Escape') setRenamingId(null);
                        }}
                        aria-label="Nazwa projektu"
                        className="w-full px-2 py-1 border border-[#A86645] rounded-lg text-sm bg-[#F6F4EF] focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm font-semibold truncate" title={project.name}>
                        {project.name}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_TONE[project.status]}`}
                      >
                        {IN_PROGRESS.includes(project.status) && (
                          <Loader2 className="w-2.5 h-2.5 inline mr-1 animate-spin" />
                        )}
                        {STATUS_LABEL[project.status]}
                      </span>
                      {project.isDemo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#DED9CF] bg-[#F6F4EF] text-[#706C65]">
                          Demo
                        </span>
                      )}
                      <span className="text-[10px] text-[#706C65]">
                        {formatDate(project.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 border-t border-[#DED9CF] pt-2">
                    <button
                      onClick={() => onOpen(project.id)}
                      className="flex-1 text-xs font-semibold text-[#A86645] hover:underline flex items-center gap-1 justify-center py-1"
                    >
                      Otwórz <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(project.id);
                        setRenameValue(project.name);
                      }}
                      title="Zmień nazwę"
                      className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] hover:text-[#292824]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmingId(project.id)}
                      title="Usuń projekt"
                      className="p-1.5 rounded-lg text-[#706C65] hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {confirmingId === project.id && (
                    <div
                      role="alertdialog"
                      aria-label="Potwierdź usunięcie"
                      className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-900"
                    >
                      <p className="mb-2">Usunąć „{project.name}"? Tej operacji nie można cofnąć.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            onDelete(project.id);
                            setConfirmingId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-700 text-white font-semibold flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Usuń
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="px-2.5 py-1 rounded-lg border border-rose-300"
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};
