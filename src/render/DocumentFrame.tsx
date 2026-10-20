import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DesignTokens, NodeElement, ViewportDevice } from '../types/document';
import { renderDocument } from './renderNode';
import { VIEWPORT_WIDTHS } from './resolveStyles';

/**
 * Hosts the rendered page in an iframe whose width is the real document
 * viewport (1440 / 768 / 375 CSS px).
 *
 * Why an iframe: media queries inside it resolve against *its* width, not the
 * app window's. Scaling it on the outer canvas therefore changes apparent size
 * without changing the breakpoint — zoom and viewport stay independent, which
 * is the property the editor is built around.
 *
 * SECURITY MODEL: same-origin, and no script ever executes from document data.
 * We render through React into the iframe's DOM, so document content only ever
 * becomes text nodes and attribute values; there is no `innerHTML` path and the
 * NodeElement tag union contains no script-bearing tag. External images are
 * fetched as images — that is not a reason to allow arbitrary JS.
 */

export interface DocumentFrameProps {
  root: NodeElement;
  tokens: DesignTokens;
  device: ViewportDevice;
  /** User preview: links navigate, the page scrolls naturally. */
  interactive?: boolean;
  /** Fixed height (preview). Omit to auto-size to the content (editor artboard). */
  height?: number;
  onContentHeightChange?: (height: number) => void;
  onFrameReady?: (frame: HTMLIFrameElement) => void;
  className?: string;
  style?: React.CSSProperties;
}

const BASE_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;

function baseCss(tokens: DesignTokens): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background-color: ${tokens.surfaceColor};
      color: ${tokens.textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    img { max-width: 100%; }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        transition-duration: 0.001ms !important;
      }
    }
  `;
}

export const DocumentFrame: React.FC<DocumentFrameProps> = ({
  root,
  tokens,
  device,
  interactive = false,
  height,
  onContentHeightChange,
  onFrameReady,
  className,
  style,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const lastReportedHeight = useRef(0);

  const width = VIEWPORT_WIDTHS[device];

  // Report content height, de-bounced by value so a 1px jitter cannot start a
  // resize feedback loop (height -> layout -> observer -> height -> ...).
  const reportHeight = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const measured = Math.max(
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight,
      doc.body.offsetHeight,
    );
    if (measured > 0 && Math.abs(measured - lastReportedHeight.current) > 1) {
      lastReportedHeight.current = measured;
      onContentHeightChange?.(measured);
    }
  }, [onContentHeightChange]);

  // Set up the iframe document once it exists.
  //
  // The document is written synchronously with document.write rather than left
  // to `srcDoc`. With srcDoc the element starts on about:blank, so a portal
  // mounted on first ref lands in a body that the srcDoc load then REPLACES,
  // leaving the portal attached to a detached node and the frame visibly empty.
  // Writing the skeleton ourselves makes the document ready in the same tick,
  // with no second load to invalidate it. The `load` listener stays as a safety
  // net in case the browser ever swaps the document underneath us.
  const attachFrame = useCallback(
    (frame: HTMLIFrameElement | null) => {
      frameRef.current = frame;
      if (!frame) {
        setMountNode(null);
        return;
      }

      const install = () => {
        const doc = frame.contentDocument;
        if (!doc) return;

        if (!doc.body || !doc.documentElement.dataset.noderaReady) {
          doc.open();
          doc.write(BASE_DOCUMENT);
          doc.close();
          doc.documentElement.dataset.noderaReady = '1';
          styleRef.current = null;
        }
        if (!styleRef.current || styleRef.current.ownerDocument !== doc) {
          const styleEl = doc.createElement('style');
          styleEl.textContent = baseCss(tokens);
          doc.head.appendChild(styleEl);
          styleRef.current = styleEl;
        }
        setMountNode((current) => (current === doc.body ? current : doc.body));
        onFrameReady?.(frame);
      };

      install();
      frame.addEventListener('load', install);
    },
    // `tokens` is intentionally not a dependency: the stylesheet is kept in
    // sync by the effect below rather than by re-attaching the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFrameReady],
  );

  // Keep the base stylesheet current without tearing down the document.
  useEffect(() => {
    if (styleRef.current) styleRef.current.textContent = baseCss(tokens);
  }, [tokens]);

  // Observe everything that can change content height.
  useEffect(() => {
    if (!mountNode) return;
    const doc = mountNode.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;

    const observer = new win.ResizeObserver(() => reportHeight());
    observer.observe(mountNode);

    const onLoad = () => reportHeight();
    // Images and fonts both change layout after first paint.
    doc.addEventListener('load', onLoad, true);
    doc.fonts?.ready.then(reportHeight).catch(() => {});

    reportHeight();

    return () => {
      observer.disconnect();
      doc.removeEventListener('load', onLoad, true);
    };
  }, [mountNode, reportHeight, root, device]);

  // Re-measure when the document itself changes.
  useEffect(() => {
    if (mountNode) reportHeight();
  }, [root, device, mountNode, reportHeight]);

  return (
    <iframe
      ref={attachFrame}
      title="Podgląd strony"
      className={className}
      style={{
        width,
        height: height ?? '100%',
        border: 'none',
        display: 'block',
        background: tokens.surfaceColor,
        // In the editor the frame is inert: all pointer work happens in the
        // overlay above it, which hit-tests via elementFromPoint. This is what
        // makes it impossible to accidentally follow a link or submit a form.
        pointerEvents: interactive ? 'auto' : 'none',
        ...style,
      }}
      {...(interactive ? {} : { tabIndex: -1 })}
    >
      {mountNode ? createPortal(renderDocument(root, { device, interactive }), mountNode) : null}
    </iframe>
  );
};
