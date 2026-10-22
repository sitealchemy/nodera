import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Monitor, Smartphone, Tablet } from 'lucide-react';
import { ViewportDevice } from '../types/document';
import { PREVIEW_WIDTHS } from './SiteCanvas';
import { RenderedSite, releaseRender, renderSite } from './renderSite';
import { parseHtml, serialise } from './ingest';
import { SiteDocument } from './types';

/**
 * The page as a visitor sees it: no camera, no selection, working links.
 *
 * The same document and the same render as the canvas — only the editing
 * affordances are gone. Returning to the editor is one click and changes
 * nothing, so previewing is never a decision the user has to weigh.
 */

export interface SitePreviewProps {
  site: SiteDocument;
  device: ViewportDevice;
  onSelectDevice: (device: ViewportDevice) => void;
  onBackToEditor: () => void;
}

export const SitePreview: React.FC<SitePreviewProps> = ({
  site,
  device,
  onSelectDevice,
  onBackToEditor,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const renderedRef = useRef<RenderedSite | null>(null);

  const rendered = useMemo(() => {
    releaseRender(renderedRef.current);
    const next = renderSite(site, parseHtml, serialise);
    renderedRef.current = next;
    return next;
  }, [site]);

  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(rendered.html);
    doc.close();
  }, [rendered, device]);

  // Escape leaves the preview, matching the node editor's preview screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBackToEditor();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBackToEditor]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#ECE8DF] text-[#292824] overflow-hidden font-sans">
      <header className="h-12 shrink-0 bg-[#FFFEFB] border-b border-[#DED9CF] px-3 flex items-center justify-between gap-3 z-40">
        <button
          onClick={onBackToEditor}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium"
          title="Wróć do edytora (Escape)"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#A86645]" />
          Wróć do edytora
        </button>

        <span className="text-[11px] text-[#706C65] truncate hidden sm:block">
          Podgląd użytkowy — odnośniki działają, narzędzia edytora są wyłączone.
        </span>

        <div className="flex items-center bg-[#F6F4EF] p-0.5 rounded-lg border border-[#DED9CF]">
          {(
            [
              ['desktop', Monitor, 'Duże ekrany (1440 px)'],
              ['tablet', Tablet, 'Tablet (768 px)'],
              ['mobile', Smartphone, 'Smartfon (375 px)'],
            ] as const
          ).map(([key, Icon, title]) => (
            <button
              key={key}
              onClick={() => onSelectDevice(key)}
              title={title}
              className={`p-1.5 rounded-md transition-colors ${
                device === key
                  ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                  : 'text-[#706C65] hover:text-[#292824]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex justify-center overflow-auto py-6">
        <div
          className="bg-white shadow-[0_2px_24px_rgba(41,40,36,0.14)] ring-1 ring-black/5 shrink-0"
          style={{ width: PREVIEW_WIDTHS[device] }}
        >
          <iframe
            ref={frameRef}
            title="Podgląd strony dla użytkownika"
            // Links and anchors work here, which is the point of the screen.
            // Scripts stay withheld: the preview is still Nodera's origin.
            sandbox="allow-same-origin"
            style={{
              width: PREVIEW_WIDTHS[device],
              height: '100%',
              minHeight: 'calc(100vh - 6rem)',
              border: 'none',
              display: 'block',
              background: '#fff',
            }}
          />
        </div>
      </div>
    </div>
  );
};
