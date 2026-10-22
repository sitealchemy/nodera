import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CloudOff,
  Download,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Redo2,
  Save,
  Smartphone,
  Tablet,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { Camera, IDENTITY_CAMERA } from '../lib/camera';
import {
  DocumentAction,
  DocumentState,
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  createDocumentState,
  documentReducer,
} from '../lib/history';
import { PREVIEW_WIDTHS, PreviewWidth, SiteCanvas } from './SiteCanvas';
import { SiteDocument } from './types';
import {
  EDITABLE_PROPERTIES,
  SiteSelection,
  describeSelection,
  exportSite,
  labelFor,
  overridesFor,
  setImage,
  setStyle,
  setText,
} from './editSite';
import { parseHtml, serialise } from './ingest';

/**
 * The editor for a page Manus designed.
 *
 * Deliberately a separate screen from the node editor rather than a mode
 * inside it: the two work on different document models, and pretending
 * otherwise is how a faithful import turns into a lossy one.
 */

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface SiteEditorProps {
  initialSite: SiteDocument;
  projectName: string;
  onDocumentChange: (site: SiteDocument) => void;
  onSave: () => void;
  saveState: SaveState;
  saveError: string | null;
  onBackToDashboard: () => void;
}

const WIDTH_BUTTONS: { key: PreviewWidth; icon: React.ElementType; title: string }[] = [
  { key: 'desktop', icon: Monitor, title: `Duże ekrany (${PREVIEW_WIDTHS.desktop} px)` },
  { key: 'tablet', icon: Tablet, title: `Tablet (${PREVIEW_WIDTHS.tablet} px)` },
  { key: 'mobile', icon: Smartphone, title: `Smartfon (${PREVIEW_WIDTHS.mobile} px)` },
];

const PROPERTY_LABEL: Record<string, string> = {
  color: 'Kolor tekstu',
  backgroundColor: 'Tło',
  fontSize: 'Rozmiar tekstu',
  fontWeight: 'Grubość',
  letterSpacing: 'Odstęp liter',
  lineHeight: 'Interlinia',
  padding: 'Dopełnienie',
  margin: 'Margines',
  textAlign: 'Wyrównanie',
  borderRadius: 'Zaokrąglenie',
};

export const SiteEditor: React.FC<SiteEditorProps> = ({
  initialSite,
  projectName,
  onDocumentChange,
  onSave,
  saveState,
  saveError,
  onBackToDashboard,
}) => {
  const [doc, dispatch] = useReducer(
    (state: DocumentState<SiteDocument>, action: DocumentAction<SiteDocument>) =>
      documentReducer(state, action),
    createDocumentState(initialSite),
  );
  const site = doc.project;

  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [width, setWidth] = useState<PreviewWidth>('desktop');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Report changes upwards; mounting is not an edit.
  useEffect(() => {
    if (site === initialSite) return;
    onDocumentChange(site);
  }, [site, initialSite, onDocumentChange]);

  const commit = useCallback((next: SiteDocument) => dispatch({ type: 'commit', next }), []);

  const selection: SiteSelection | null = useMemo(
    () => (selectedId ? describeSelection(site, selectedId, parseHtml) : null),
    [site, selectedId],
  );

  const overrides = selectedId ? overridesFor(site, selectedId) : {};

  // Images already stored with the project, offered as replacements.
  //
  // Their thumbnail URLs are made once per asset list and revoked when it
  // changes: creating them inline in the markup would mint a fresh blob URL
  // on every keystroke in the inspector and never release any of them.
  const imageAssets = useMemo(
    () =>
      site.assets
        .filter((asset) => asset.contentType.startsWith('image/'))
        .map((asset) => ({ ...asset, thumbnail: URL.createObjectURL(asset.blob) })),
    [site.assets],
  );
  useEffect(
    () => () => imageAssets.forEach((asset) => URL.revokeObjectURL(asset.thumbnail)),
    [imageAssets],
  );

  const handleExport = useCallback(async () => {
    const files = exportSite(site, parseHtml, serialise);
    // One file at a time: a zip would need a dependency, and the export is
    // small enough that the browser's own download does the job.
    for (const file of files) {
      const blob = file.blob ?? new Blob([file.text ?? ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.path.split('/').pop() ?? 'plik';
      anchor.click();
      URL.revokeObjectURL(url);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }, [site]);

  // Undo/redo from the keyboard, with text fields left alone.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

      if (event.key === 'Escape') {
        if (selectedRef.current) setSelectedId(null);
        return;
      }
      if (typing) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const report = site.report;
  const hasLimitations = report.limitations.length > 0 || report.missingAssets.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EF] text-[#292824] overflow-hidden font-sans">
      <header className="h-12 shrink-0 bg-[#FFFEFB] border-b border-[#DED9CF] px-3 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBackToDashboard}
            title="Wróć do projektów"
            className="p-1.5 rounded-lg hover:bg-[#F6F4EF] text-[#706C65] hover:text-[#292824] shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-6 h-6 rounded-md bg-[#292824] flex items-center justify-center text-white font-serif font-bold text-[13px] shrink-0">
            N
          </div>
          <span className="text-xs font-semibold truncate hidden sm:block">{projectName}</span>
          <span className="text-[10px] text-[#706C65] bg-[#F6F4EF] border border-[#DED9CF] rounded px-1.5 py-0.5 shrink-0">
            Strona z Manusa
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#F6F4EF] p-0.5 rounded-lg border border-[#DED9CF]">
            {WIDTH_BUTTONS.map(({ key, icon: Icon, title }) => (
              <button
                key={key}
                onClick={() => setWidth(key)}
                title={title}
                className={`p-1.5 rounded-md transition-colors ${
                  width === key
                    ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                    : 'text-[#706C65] hover:text-[#292824]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="flex items-center">
            <button
              onClick={() => dispatch({ type: 'undo' })}
              disabled={!canUndoOf(doc)}
              title="Cofnij (Ctrl/Cmd + Z)"
              className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] disabled:opacity-30"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => dispatch({ type: 'redo' })}
              disabled={!canRedoOf(doc)}
              title="Ponów (Ctrl/Cmd + Shift + Z)"
              className="p-1.5 rounded-lg text-[#706C65] hover:bg-[#F6F4EF] disabled:opacity-30"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {hasLimitations && (
            <button
              onClick={() => setReportOpen(true)}
              title="Raport konwersji"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Raport</span>
            </button>
          )}
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            title={saveError ?? 'Zapisz projekt'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
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
            onClick={() => void handleExport()}
            title="Pobierz pliki strony"
            className="p-1.5 rounded-lg hover:bg-[#F6F4EF] text-[#706C65] hover:text-[#292824]"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 relative min-w-0 flex flex-col">
          <SiteCanvas
            site={site}
            width={width}
            camera={camera}
            onCameraChange={setCamera}
            selectedId={selectedId}
            onSelect={setSelectedId}
            selectMode={selectMode}
            onToggleSelectMode={() => setSelectMode((on) => !on)}
            handTool={handTool}
            onToggleHandTool={() => setHandTool((on) => !on)}
          />
        </div>

        {selection && (
          <aside className="w-72 shrink-0 bg-[#FFFEFB] border-l border-[#DED9CF] flex flex-col z-30">
            <div className="h-10 px-3 flex items-center justify-between border-b border-[#DED9CF] bg-[#F6F4EF]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-mono uppercase bg-[#A86645] text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                  {selection.tagName}
                </span>
                <span className="text-[11px] font-semibold truncate">{labelFor(selection)}</span>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                title="Odznacz (Escape)"
                className="p-1 rounded hover:bg-[#DED9CF] text-[#706C65]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-5 text-xs">
              {selection.available.includes('text') ? (
                <div className="space-y-1.5">
                  <label className="font-medium flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-[#A86645]" /> Treść
                  </label>
                  <textarea
                    value={selection.text ?? ''}
                    onChange={(event) => {
                      const next = setText(site, selection.nodeId, event.target.value, parseHtml, serialise);
                      if (next) commit(next);
                    }}
                    rows={4}
                    className="w-full p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-[11px] focus:outline-none focus:border-[#A86645] resize-none leading-relaxed"
                  />
                </div>
              ) : (
                // Said plainly rather than offered and silently destructive.
                <p className="text-[10px] text-[#706C65] leading-relaxed p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg">
                  Ten element zawiera zagnieżdżone formatowanie, więc zmiana całej treści
                  skasowałaby je. Zaznacz fragment wewnątrz, aby edytować tekst.
                </p>
              )}

              {selection.image && (
                <div className="space-y-2">
                  <label className="font-medium flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#A86645]" /> Obraz
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {imageAssets.map((asset) => (
                      <button
                        key={asset.path}
                        onClick={() => {
                          const next = setImage(
                            site,
                            selection.nodeId,
                            { src: asset.path },
                            parseHtml,
                            serialise,
                          );
                          if (next) commit(next);
                        }}
                        title={asset.path}
                        className={`aspect-video rounded border overflow-hidden ${
                          selection.image?.src.endsWith(asset.path.split('/').pop() ?? '')
                            ? 'border-[#A86645] ring-1 ring-[#A86645]/40'
                            : 'border-[#DED9CF]'
                        }`}
                      >
                        <img
                          src={asset.thumbnail}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[#706C65]">Tekst alternatywny</span>
                    <input
                      type="text"
                      value={selection.image.alt}
                      onChange={(event) => {
                        const next = setImage(
                          site,
                          selection.nodeId,
                          { alt: event.target.value },
                          parseHtml,
                          serialise,
                        );
                        if (next) commit(next);
                      }}
                      className="w-full px-2 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded text-[11px]"
                    />
                  </label>
                </div>
              )}

              <div className="space-y-2">
                <span className="font-medium block">Styl</span>
                {EDITABLE_PROPERTIES.map((property) => (
                  <label key={property} className="flex items-center justify-between gap-2">
                    <span className="text-[#706C65]">{PROPERTY_LABEL[property] ?? property}</span>
                    <input
                      type="text"
                      value={overrides[property] ?? ''}
                      placeholder="—"
                      onChange={(event) =>
                        commit(setStyle(site, selection.nodeId, { [property]: event.target.value }))
                      }
                      className="w-24 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-[11px] focus:outline-none focus:border-[#A86645]"
                    />
                  </label>
                ))}
                <p className="text-[10px] text-[#706C65] leading-relaxed">
                  Zmiany zapisują się jako osobne reguły CSS. Oryginalny arkusz autora
                  pozostaje nietknięty, więc układ responsywny działa dalej.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-[#292824]/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-auto shadow-2xl">
            <div className="p-4 border-b border-[#DED9CF] flex items-center justify-between bg-[#F6F4EF]">
              <h2 className="text-sm font-bold">Raport konwersji</h2>
              <button onClick={() => setReportOpen(false)} className="p-1 rounded hover:bg-[#DED9CF]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <p>
                <strong>Rozpoznany stos:</strong>{' '}
                {report.stack === 'static-html-css'
                  ? 'statyczny HTML + CSS'
                  : report.stack === 'static-html-js'
                    ? 'HTML + CSS + JavaScript'
                    : 'nieobsługiwany'}
              </p>
              <p>
                <strong>Plik wejściowy:</strong> {report.entry} · <strong>plików:</strong>{' '}
                {report.files.length} · <strong>materiałów:</strong> {report.assets.length}
              </p>
              {report.limitations.length > 0 && (
                <div>
                  <strong>Ograniczenia:</strong>
                  <ul className="mt-1 space-y-1 text-[#706C65]">
                    {report.limitations.map((limitation, index) => (
                      <li key={index}>• {limitation}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.missingAssets.length > 0 && (
                <div>
                  <strong>Brakujące materiały:</strong>
                  <ul className="mt-1 space-y-1 text-rose-700">
                    {report.missingAssets.map((path) => (
                      <li key={path}>• {path}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.externalReferences.length > 0 && (
                <div>
                  <strong>Zasoby zewnętrzne:</strong>
                  <ul className="mt-1 space-y-1 text-[#706C65] break-all">
                    {report.externalReferences.map((reference) => (
                      <li key={reference}>• {reference}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
