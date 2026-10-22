import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CloudOff,
  Loader2,
  Save,
  Code,
  Compass,
  Eye,
  Monitor,
  MoreHorizontal,
  Redo2,
  Share2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react';
import { ResponsiveScope, ViewportDevice } from '../../types/document';
import { UnsupportedFeatures } from '../../editor/capabilities';

/**
 * Compact editor header.
 *
 * Only the things needed constantly stay visible: identity, which page, how
 * wide, what an edit applies to, undo, and the way out to preview. Everything
 * else moves into "Więcej" rather than disappearing.
 */

/** Just enough of a page for the picker; both document kinds can say this. */
export interface HeaderPage {
  slug: string;
  name: string;
}

export interface HeaderMenuItem {
  icon: React.ElementType;
  label: string;
  hint?: string;
  action: () => void;
}

export interface EditorHeaderProps {
  projectName: string;
  /** A badge beside the name, e.g. which kind of document is open. */
  documentBadge?: string;
  pages: HeaderPage[];
  activePageSlug: string;
  onSelectPage: (slug: string) => void;
  /** Shown as the hint on the directions entry; omitted when there are none. */
  directionHint?: string;
  /** Features the open document does not support, with the reason for each. */
  unsupported?: UnsupportedFeatures;
  /** Entries appended to "Więcej", for tools only one document kind has. */
  extraMenuItems?: HeaderMenuItem[];
  viewportDevice: ViewportDevice;
  onSelectViewport: (device: ViewportDevice) => void;
  responsiveScope: ResponsiveScope;
  onSelectResponsiveScope: (scope: ResponsiveScope) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPreview: () => void;
  onOpenProposal?: () => void;
  onOpenPublishChecklist?: () => void;
  onOpenCodeExport: () => void;
  onOpenDirectionsView?: () => void;
  onBackToDashboard: () => void;
  onSave: () => void;
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  saveError: string | null;
}

function useDismissable(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);
  return ref;
}

const SCOPE_LABEL: Record<ResponsiveScope, string> = {
  all: 'Wszystkie ekrany',
  tablet: 'Tablety',
  mobile: 'Małe ekrany',
};

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  projectName,
  documentBadge,
  pages,
  activePageSlug,
  onSelectPage,
  directionHint,
  unsupported = {},
  extraMenuItems = [],
  viewportDevice,
  onSelectViewport,
  responsiveScope,
  onSelectResponsiveScope,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenPreview,
  onOpenProposal,
  onOpenPublishChecklist,
  onOpenCodeExport,
  onOpenDirectionsView,
  onBackToDashboard,
  onSave,
  saveState,
  saveError,
}) => {
  const [pagesOpen, setPagesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  const pagesRef = useDismissable(() => setPagesOpen(false));
  const moreRef = useDismissable(() => setMoreOpen(false));
  const scopeRef = useDismissable(() => setScopeOpen(false));

  const activePage = pages.find((page) => page.slug === activePageSlug) ?? pages[0];

  return (
    <header className="h-12 shrink-0 bg-[#FFFEFB] border-b border-[#DED9CF] px-3 flex items-center justify-between gap-3 z-40 select-none">
      {/* Identity + page */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onBackToDashboard}
          title="Wróć do projektów"
          className="p-1.5 rounded-lg hover:bg-[#F6F4EF] text-[#706C65] hover:text-[#292824] transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-6 h-6 rounded-md bg-[#292824] flex items-center justify-center text-white font-serif font-bold text-[13px] shrink-0">
          N
        </div>
        <span className="text-xs font-semibold text-[#292824] truncate hidden sm:block">
          {projectName}
        </span>
        {documentBadge && (
          <span className="text-[10px] text-[#706C65] bg-[#F6F4EF] border border-[#DED9CF] rounded px-1.5 py-0.5 shrink-0 hidden md:block">
            {documentBadge}
          </span>
        )}

        <span className="w-px h-4 bg-[#DED9CF] mx-0.5 hidden sm:block" />

        {/* Page picker — names come from the document, not a fixed slug list. */}
        <div className="relative" ref={pagesRef}>
          <button
            onClick={() => setPagesOpen((open) => !open)}
            disabled={!!unsupported.pages}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#F6F4EF] text-xs font-medium text-[#292824] transition-colors disabled:hover:bg-transparent disabled:cursor-default"
            title={unsupported.pages ?? 'Wybierz podstronę'}
          >
            <span className="truncate max-w-[160px]">{activePage?.name ?? 'Strona'}</span>
            {!unsupported.pages && <ChevronDown className="w-3.5 h-3.5 text-[#706C65] shrink-0" />}
          </button>
          {pagesOpen && !unsupported.pages && (
            <div className="absolute left-0 top-full mt-1 w-60 bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-lg py-1 z-50">
              {pages.map((page) => (
                <button
                  key={page.slug}
                  onClick={() => {
                    onSelectPage(page.slug);
                    setPagesOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-[#F6F4EF] text-left"
                >
                  <span className="truncate text-[#292824]">{page.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[10px] text-[#706C65]">/{page.slug}</span>
                    {page.slug === activePageSlug && <Check className="w-3.5 h-3.5 text-[#A86645]" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Viewport + scope + history */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#F6F4EF] p-0.5 rounded-lg border border-[#DED9CF]">
          {([
            ['desktop', Monitor, 'Duże ekrany (1440 px)'],
            ['tablet', Tablet, 'Tablet (768 px)'],
            ['mobile', Smartphone, 'Smartfon (375 px)'],
          ] as const).map(([device, Icon, title]) => (
            <button
              key={device}
              onClick={() => onSelectViewport(device)}
              title={title}
              className={`p-1.5 rounded-md transition-colors ${
                viewportDevice === device
                  ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                  : 'text-[#706C65] hover:text-[#292824]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Edit scope stays legible even with both panels closed. */}
        <div className="relative" ref={scopeRef}>
          <button
            onClick={() => setScopeOpen((open) => !open)}
            disabled={!!unsupported.responsiveScope}
            title={unsupported.responsiveScope ?? 'Zakres edycji — gdzie zapisywana jest zmiana'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-45 disabled:cursor-default ${
              responsiveScope === 'all'
                ? 'bg-[#F6F4EF] border-[#DED9CF] text-[#706C65] hover:text-[#292824]'
                : 'bg-[#A86645]/10 border-[#A86645]/40 text-[#A86645]'
            }`}
          >
            <span className="hidden md:inline">Zakres:</span>
            <span>{unsupported.responsiveScope ? 'Wszystkie ekrany' : SCOPE_LABEL[responsiveScope]}</span>
            {!unsupported.responsiveScope && <ChevronDown className="w-3 h-3" />}
          </button>
          {scopeOpen && !unsupported.responsiveScope && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-lg py-1 z-50">
              {(['all', 'tablet', 'mobile'] as ResponsiveScope[]).map((scope) => (
                <button
                  key={scope}
                  onClick={() => {
                    onSelectResponsiveScope(scope);
                    setScopeOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-[#F6F4EF] text-left text-[#292824]"
                >
                  <span>{SCOPE_LABEL[scope]}</span>
                  {scope === responsiveScope && <Check className="w-3.5 h-3.5 text-[#A86645]" />}
                </button>
              ))}
              <p className="px-3 py-2 text-[10px] text-[#706C65] leading-relaxed border-t border-[#DED9CF] mt-1">
                Zakres edycji jest niezależny od szerokości podglądu.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] hover:text-[#292824] disabled:opacity-30 transition-colors"
            title="Cofnij (Ctrl/Cmd + Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] hover:text-[#292824] disabled:opacity-30 transition-colors"
            title="Ponów (Ctrl/Cmd + Shift + Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview + more */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSave}
          disabled={saveState === 'saving'}
          title={saveError ?? 'Zapisz projekt'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            saveState === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : saveState === 'dirty'
                ? 'bg-[#A86645] border-[#A86645] text-white hover:bg-[#935537]'
                : 'bg-[#F6F4EF] border-[#DED9CF] text-[#706C65]'
          }`}
        >
          {saveState === 'saving' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saveState === 'error' ? (
            <CloudOff className="w-3.5 h-3.5" />
          ) : saveState === 'dirty' ? (
            <Save className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span className="hidden md:inline">
            {saveState === 'saving'
              ? 'Zapisuję…'
              : saveState === 'error'
                ? 'Błąd zapisu'
                : saveState === 'dirty'
                  ? 'Zapisz'
                  : 'Zapisano'}
          </span>
        </button>

        <button
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium text-[#292824] transition-colors"
          title="Otwórz podgląd użytkowy — działające odnośniki"
        >
          <Eye className="w-3.5 h-3.5 text-[#A86645]" />
          <span className="hidden md:inline">Podgląd</span>
        </button>

        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((open) => !open)}
            className="p-1.5 rounded-lg hover:bg-[#F6F4EF] text-[#706C65] hover:text-[#292824] transition-colors"
            title="Więcej"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-[#FFFEFB] border border-[#DED9CF] rounded-xl shadow-lg py-1 z-50 text-xs">
              {[
                {
                  icon: Compass,
                  label: 'Kierunki projektowe',
                  hint: directionHint,
                  action: onOpenDirectionsView,
                  reason: unsupported.directions,
                },
                {
                  icon: Share2,
                  label: 'Propozycja dla klienta',
                  action: onOpenProposal,
                  reason: unsupported.proposal,
                },
                {
                  icon: ShieldCheck,
                  label: 'Przygotowanie do publikacji',
                  action: onOpenPublishChecklist,
                  reason: unsupported.checklist,
                },
                { icon: Code, label: 'Kod i eksport', action: onOpenCodeExport },
                ...extraMenuItems.map((item) => ({ ...item, reason: undefined as string | undefined })),
              ].map(({ icon: Icon, label, hint, action, reason }) => (
                // An entry that does not apply stays in place, visibly off and
                // carrying its reason. Removing it would make the menu differ
                // between document kinds for no reason the user can see.
                <button
                  key={label}
                  disabled={!!reason || !action}
                  title={reason}
                  onClick={() => {
                    action?.();
                    setMoreOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-start gap-2.5 hover:bg-[#F6F4EF] text-left text-[#292824] disabled:hover:bg-transparent disabled:cursor-default"
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${reason ? 'text-[#706C65]' : 'text-[#A86645]'}`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={reason ? 'text-[#706C65]' : undefined}>{label}</span>
                    {reason && (
                      <span className="block text-[10px] text-[#706C65] leading-snug mt-0.5">
                        {reason}
                      </span>
                    )}
                  </span>
                  {hint && !reason && (
                    <span className="text-[10px] text-[#706C65] truncate max-w-[80px]">{hint}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
