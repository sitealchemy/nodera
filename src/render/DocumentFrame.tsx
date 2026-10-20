import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DesignTokens, NodeElement, ViewportDevice } from '../types/document';
import { LinkTarget, classifyLink } from '../lib/links';
import { renderDocument } from './renderNode';
import { VIEWPORT_WIDTHS } from './resolveStyles';

/**
 * Hosts the rendered page in an iframe whose width is the real document
 * viewport (1440 / 768 / 375 CSS px).
 *
 * Media queries inside resolve against *its* width, not the app window's, so
 * scaling it on the outer canvas changes apparent size without changing the
 * breakpoint — zoom and viewport stay independent.
 *
 * SECURITY MODEL: same-origin, and no script ever executes from document data.
 * Content is rendered through React, so it only ever becomes text nodes and
 * attribute values; there is no `innerHTML` path and the NodeElement tag union
 * contains no script-bearing tag.
 */

export interface DocumentFrameProps {
  root: NodeElement;
  tokens: DesignTokens;
  device: ViewportDevice;
  /** User preview: links are followed through `onNavigate`, fields are usable. */
  interactive?: boolean;
  /** Fixed height (preview). Omit to auto-size to the content (editor artboard). */
  height?: number;
  /** Page slugs this project has, so links can be classified. */
  knownSlugs?: string[];
  onNavigate?: (target: LinkTarget) => void;
  onContentHeightChange?: (height: number) => void;
  onFrameReady?: (frame: HTMLIFrameElement | null) => void;
  className?: string;
  style?: React.CSSProperties;
}

const BASE_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>`;

/** The element we portal into. Measured directly, so height can shrink. */
const MOUNT_ID = 'nodera-root';

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
    /* flow-root so the mount's box contains its children's margins, making its
       measured height the true content height. */
    #${MOUNT_ID} { display: flow-root; }
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
  knownSlugs,
  onNavigate,
  onContentHeightChange,
  onFrameReady,
  className,
  style,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const lastReportedHeight = useRef(0);

  // Callback props are kept in refs and read at call time. Parents pass inline
  // arrows, so depending on their identity would re-run the ref callback on
  // every render — detaching and re-attaching the frame, re-initialising the
  // document and stacking up a fresh `load` listener each time.
  const onContentHeightChangeRef = useRef(onContentHeightChange);
  onContentHeightChangeRef.current = onContentHeightChange;
  const onFrameReadyRef = useRef(onFrameReady);
  onFrameReadyRef.current = onFrameReady;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const knownSlugsRef = useRef(knownSlugs);
  knownSlugsRef.current = knownSlugs;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const width = VIEWPORT_WIDTHS[device];

  /**
   * Measures the portal mount, not `documentElement`.
   *
   * `documentElement.scrollHeight` is bounded below by the iframe's own
   * viewport height. Since that height is driven BY this measurement, a tall
   * page followed by a short one could never shrink the artboard: the frame
   * stayed 2000px tall, so scrollHeight stayed 2000px, so the frame stayed
   * 2000px. Measuring the mount element breaks that ratchet.
   */
  const reportHeight = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const mount = doc?.getElementById(MOUNT_ID);
    if (!mount) return;
    const measured = Math.ceil(mount.getBoundingClientRect().height);
    if (measured > 0 && Math.abs(measured - lastReportedHeight.current) > 1) {
      lastReportedHeight.current = measured;
      onContentHeightChangeRef.current?.(measured);
    }
  }, []);

  /**
   * Ref callback with a stable identity (no reactive dependencies), so React
   * only calls it when the element actually mounts or unmounts.
   *
   * The document is written synchronously rather than left to `srcDoc`: with
   * srcDoc the element starts on about:blank, and a portal mounted on first
   * ref lands in a body that the srcDoc load then REPLACES, leaving the portal
   * attached to a detached node and the frame visibly empty.
   */
  const attachFrame = useCallback(
    (frame: HTMLIFrameElement | null) => {
      // Tear down whatever the previous element had.
      const previous = frameRef.current;
      if (previous && previous !== frame) {
        const cleanup = (previous as HTMLIFrameElement & { __noderaCleanup?: () => void })
          .__noderaCleanup;
        cleanup?.();
      }

      frameRef.current = frame;
      if (!frame) {
        setMountNode(null);
        onFrameReadyRef.current?.(null);
        return;
      }

      // Defined before `install` so it can (re)bind them to whatever document
      // is current. `document.open()` drops every listener on the document,
      // and an iframe with no src still fires a natural about:blank `load`
      // that can replace the document after the first install — so binding
      // once, outside install, silently loses the handlers.
      const onClick = (event: MouseEvent) => {
        const anchor = (event.target as Element | null)?.closest?.('a');
        if (!anchor) return;
        const target = classifyLink(anchor.getAttribute('href'), knownSlugsRef.current ?? []);

        if (target.kind === 'protocol') return; // let the user agent handle it

        // Everything else is handled by the app: following it inside the frame
        // would load the Nodera shell into its own preview.
        event.preventDefault();
        if (!interactiveRef.current) return; // editor: links are inert
        onNavigateRef.current?.(target);
      };

      const onSubmit = (event: Event) => {
        // No backend exists; submitting would navigate the frame.
        event.preventDefault();
      };

      const bindDocumentListeners = (doc: Document) => {
        // Remove-then-add keeps this idempotent across repeated installs.
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('submit', onSubmit, true);
        doc.addEventListener('click', onClick, true);
        doc.addEventListener('submit', onSubmit, true);
      };

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
          styleEl.textContent = baseCss(tokensRef.current);
          doc.head.appendChild(styleEl);
          styleRef.current = styleEl;
        }

        let mount = doc.getElementById(MOUNT_ID);
        if (!mount) {
          mount = doc.createElement('div');
          mount.id = MOUNT_ID;
          doc.body.appendChild(mount);
        }

        // Bound here, on every install, so they survive any document swap.
        bindDocumentListeners(doc);

        setMountNode((current) => (current === mount ? current : mount));
        onFrameReadyRef.current?.(frame);
      };

      install();
      frame.addEventListener('load', install);

      (frame as HTMLIFrameElement & { __noderaCleanup?: () => void }).__noderaCleanup = () => {
        frame.removeEventListener('load', install);
        const d = frame.contentDocument;
        d?.removeEventListener('click', onClick, true);
        d?.removeEventListener('submit', onSubmit, true);
      };
    },
    [],
  );

  // No unmount effect for listener teardown on purpose. React calls the ref
  // callback with null when the element goes away, and that path already runs
  // __noderaCleanup. An extra effect cleanup fires in StrictMode's
  // mount/cleanup/mount cycle while the iframe stays attached, stripping the
  // click handlers from a live document and letting links navigate the frame.

  // Keep the base stylesheet current without tearing down the document.
  useEffect(() => {
    if (styleRef.current) styleRef.current.textContent = baseCss(tokens);
  }, [tokens]);

  // Observe everything that can change content height, in both directions.
  useEffect(() => {
    if (!mountNode) return;
    const doc = mountNode.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;

    const observer = new win.ResizeObserver(() => reportHeight());
    observer.observe(mountNode);

    const onLoad = () => reportHeight();
    doc.addEventListener('load', onLoad, true); // images
    doc.fonts?.ready.then(reportHeight).catch(() => {});
    reportHeight();

    return () => {
      observer.disconnect();
      doc.removeEventListener('load', onLoad, true);
    };
  }, [mountNode, reportHeight]);

  // Re-measure when the rendered document changes.
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
        // overlay above it, which hit-tests via elementFromPoint.
        pointerEvents: interactive ? 'auto' : 'none',
        ...style,
      }}
      {...(interactive ? {} : { tabIndex: -1 })}
    >
      {mountNode
        ? createPortal(renderDocument(root, { device, interactive }), mountNode)
        : null}
    </iframe>
  );
};
