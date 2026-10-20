import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Monitor, Smartphone, Tablet } from 'lucide-react';
import { DesignTokens, PageDocument, ViewportDevice } from '../../types/document';
import { LinkTarget } from '../../lib/links';
import { DocumentFrame } from '../../render/DocumentFrame';
import { VIEWPORT_WIDTHS } from '../../render/resolveStyles';

/**
 * User preview: the page as a visitor meets it.
 *
 * Unlike the editor artboard this frame has a fixed height and scrolls
 * internally, which is the only honest way to see viewport-dependent
 * behaviour (sticky headers, `position: fixed`, viewport units). The editor's
 * full-height artboard cannot simulate those and does not claim to.
 */

export interface PreviewViewProps {
  pages: PageDocument[];
  activePageSlug: string;
  onSelectPage: (slug: string) => void;
  tokens: DesignTokens;
  device: ViewportDevice;
  onSelectDevice: (device: ViewportDevice) => void;
  onBackToEditor: () => void;
  onNavigate: (target: LinkTarget) => void;
  /** Fragment to scroll to once the page has rendered. */
  pendingAnchor: string | null;
  onAnchorConsumed: () => void;
}

export const PreviewView: React.FC<PreviewViewProps> = ({
  pages,
  activePageSlug,
  onSelectPage,
  tokens,
  device,
  onSelectDevice,
  onBackToEditor,
  onNavigate,
  pendingAnchor,
  onAnchorConsumed,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(0);
  const page = pages.find((p) => p.slug === activePageSlug) ?? pages[0];
  const width = VIEWPORT_WIDTHS[device];
  const slugs = pages.map((p) => p.slug);

  const handleFrameReady = useCallback((frame: HTMLIFrameElement | null) => {
    frameRef.current = frame;
    setReady((n) => n + 1);
  }, []);

  /**
   * Resolve a pending fragment once the target page is on screen.
   *
   * Scrolls the iframe's own document — the artboard is inside the frame, so
   * scrolling the app shell would move the wrong thing.
   */
  useEffect(() => {
    if (!pendingAnchor) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;

    const attempt = () => {
      const escaped =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(pendingAnchor) : pendingAnchor;
      const target =
        doc.getElementById(pendingAnchor) ?? doc.querySelector(`[name="${escaped}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Consumed either way: a fragment with no target should not keep retrying.
      onAnchorConsumed();
    };

    // One frame of delay so a page switch has rendered before we look.
    const timer = window.setTimeout(attempt, 60);
    return () => window.clearTimeout(timer);
  }, [pendingAnchor, activePageSlug, ready, onAnchorConsumed]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#ECE8DF] text-[#292824] font-sans overflow-hidden">
      <header className="h-12 shrink-0 bg-[#FFFEFB] border-b border-[#DED9CF] px-3 flex items-center justify-between gap-3">
        <button
          onClick={onBackToEditor}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-xs font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[#A86645]" />
          <span>Wróć do edytora</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-[#706C65] font-medium hidden sm:block">
            Podgląd użytkowy
          </span>
          <select
            value={activePageSlug}
            onChange={(e) => onSelectPage(e.target.value)}
            className="px-2 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs font-medium max-w-[180px]"
          >
            {pages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center bg-[#F6F4EF] p-0.5 rounded-lg border border-[#DED9CF]">
          {([
            ['desktop', Monitor],
            ['tablet', Tablet],
            ['mobile', Smartphone],
          ] as const).map(([value, Icon]) => (
            <button
              key={value}
              onClick={() => onSelectDevice(value)}
              className={`p-1.5 rounded-md transition-colors ${
                device === value
                  ? 'bg-[#FFFEFB] text-[#292824] shadow-sm'
                  : 'text-[#706C65] hover:text-[#292824]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto flex justify-center p-4">
        <div
          className="bg-white shadow-xl ring-1 ring-black/5 overflow-hidden"
          style={{ width, maxWidth: '100%', height: '100%' }}
        >
          {/* Keyed by page+device only: the frame must not remount on every
              render, or a pending anchor would never find a stable document. */}
          <DocumentFrame
            key={`${page.slug}-${device}`}
            root={page.root}
            tokens={tokens}
            device={device}
            interactive
            knownSlugs={slugs}
            onNavigate={onNavigate}
            onFrameReady={handleFrameReady}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>

      <footer className="shrink-0 bg-[#FFFEFB] border-t border-[#DED9CF] px-4 py-2 text-[10px] text-[#706C65] text-center">
        Odnośniki wewnętrzne przełączają podstrony, zewnętrzne otwierają się w nowej karcie.
        Formularze nie mają backendu i pozostają demonstracyjne.
      </footer>
    </div>
  );
};
