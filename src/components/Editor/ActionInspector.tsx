import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Monitor,
  RotateCcw,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { ElementAction } from '../../lib/documentTree';
import { ElementStyles, NodeElement, OpticalOffset, ResponsiveScope } from '../../types/document';
import { resolveStyles } from '../../render/resolveStyles';

/**
 * The inspector, shown only once an action has been chosen for the selection.
 *
 * Selection on its own gives a label and the local action bar; this panel
 * appears on demand so the default state stays quiet.
 */

export interface ActionInspectorProps {
  node: NodeElement;
  action: ElementAction;
  responsiveScope: ResponsiveScope;
  /** Offset that applies at the current scope, already resolved. */
  effectiveOffset: OpticalOffset;
  onClose: () => void;
  onUpdateContent: (content: string) => void;
  onUpdateStyles: (styles: Partial<ElementStyles>) => void;
  onNudge: (dx: number, dy: number) => void;
  onResetNudge: () => void;
}

const SCOPE_COPY: Record<ResponsiveScope, { icon: React.ElementType; label: string }> = {
  all: { icon: Monitor, label: 'Zmiana dotyczy wszystkich ekranów' },
  tablet: { icon: Tablet, label: 'Zmiana dotyczy tylko tabletów' },
  mobile: { icon: Smartphone, label: 'Zmiana dotyczy tylko małych ekranów' },
};

const ACTION_TITLE: Record<ElementAction, string> = {
  text: 'Treść',
  size: 'Rozmiar i odstępy',
  appearance: 'Wygląd',
  position: 'Położenie',
};

/** A labelled text field bound to one style property. */
const StyleField: React.FC<{
  label: string;
  value: string | undefined;
  placeholder?: string;
  onChange: (value: string) => void;
}> = ({ label, value, placeholder, onChange }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-[#706C65]">{label}</span>
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder ?? 'auto'}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-[11px] text-[#292824] focus:outline-none focus:border-[#A86645]"
    />
  </label>
);

export const ActionInspector: React.FC<ActionInspectorProps> = ({
  node,
  action,
  responsiveScope,
  effectiveOffset,
  onClose,
  onUpdateContent,
  onUpdateStyles,
  onNudge,
  onResetNudge,
}) => {
  // Show the styles that actually apply at the scope being edited.
  const device = responsiveScope === 'mobile' ? 'mobile' : responsiveScope === 'tablet' ? 'tablet' : 'desktop';
  const styles = resolveStyles(node, device);
  const scope = SCOPE_COPY[responsiveScope];
  const ScopeIcon = scope.icon;

  return (
    <aside className="w-64 shrink-0 bg-[#FFFEFB] border-l border-[#DED9CF] flex flex-col z-30">
      <div className="h-10 px-3 flex items-center justify-between border-b border-[#DED9CF] bg-[#F6F4EF]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-mono uppercase bg-[#A86645] text-white px-1.5 py-0.5 rounded font-bold shrink-0">
            {node.tag}
          </span>
          <span className="text-[11px] font-semibold text-[#292824] truncate">
            {ACTION_TITLE[action]}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[#DED9CF] text-[#706C65]"
          title="Zamknij (Escape)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* What this edit will affect — visible for every action. */}
        <div
          className={`p-2 rounded-lg border flex items-center gap-2 text-[10px] ${
            responsiveScope === 'all'
              ? 'bg-[#F6F4EF] border-[#DED9CF] text-[#706C65]'
              : 'bg-[#A86645]/10 border-[#A86645]/30 text-[#A86645]'
          }`}
        >
          <ScopeIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium leading-snug">{scope.label}</span>
        </div>

        <p className="text-[10px] text-[#706C65] truncate" title={node.name}>
          {node.name}
        </p>

        {action === 'text' && (
          <div className="space-y-1.5">
            <label className="text-[#292824] font-medium block">Treść elementu</label>
            <textarea
              value={node.content ?? ''}
              onChange={(e) => onUpdateContent(e.target.value)}
              rows={5}
              autoFocus
              className="w-full p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-[11px] text-[#292824] focus:outline-none focus:border-[#A86645] resize-none leading-relaxed"
            />
            <p className="text-[10px] text-[#706C65]">
              Treść jest wspólna dla wszystkich ekranów.
            </p>
          </div>
        )}

        {action === 'size' && (
          <div className="space-y-2.5">
            <StyleField
              label="Rozmiar tekstu"
              value={styles.fontSize}
              onChange={(value) => onUpdateStyles({ fontSize: value })}
            />
            <StyleField
              label="Szerokość"
              value={styles.width}
              onChange={(value) => onUpdateStyles({ width: value })}
            />
            <StyleField
              label="Wysokość"
              value={styles.height}
              onChange={(value) => onUpdateStyles({ height: value })}
            />
            <StyleField
              label="Dopełnienie"
              value={styles.padding}
              onChange={(value) => onUpdateStyles({ padding: value })}
            />
            <StyleField
              label="Margines"
              value={styles.margin}
              onChange={(value) => onUpdateStyles({ margin: value })}
            />
            <StyleField
              label="Odstęp (gap)"
              value={styles.gap}
              onChange={(value) => onUpdateStyles({ gap: value })}
            />
          </div>
        )}

        {action === 'appearance' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[#706C65]">Kolor tekstu</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styles.color ?? '#292824'}
                  onChange={(e) => onUpdateStyles({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-[#DED9CF] cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={styles.color ?? ''}
                  placeholder="inherit"
                  onChange={(e) => onUpdateStyles({ color: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[#706C65]">Tło</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styles.backgroundColor ?? '#FFFEFB'}
                  onChange={(e) => onUpdateStyles({ backgroundColor: e.target.value })}
                  className="w-7 h-7 rounded border border-[#DED9CF] cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={styles.backgroundColor ?? ''}
                  placeholder="brak"
                  onChange={(e) => onUpdateStyles({ backgroundColor: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded font-mono text-[11px]"
                />
              </div>
            </div>

            <StyleField
              label="Zaokrąglenie"
              value={styles.borderRadius}
              onChange={(value) => onUpdateStyles({ borderRadius: value })}
            />
            <StyleField
              label="Grubość tekstu"
              value={styles.fontWeight}
              onChange={(value) => onUpdateStyles({ fontWeight: value })}
            />
          </div>
        )}

        {action === 'position' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#292824]">Korekta optyczna</span>
                {(effectiveOffset.x !== 0 || effectiveOffset.y !== 0) && (
                  <button
                    onClick={onResetNudge}
                    className="text-[10px] text-[#A86645] hover:underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[#706C65] leading-relaxed">
                Przesuwa element wizualnie, bez rozpychania sąsiadów. Strzałki na klawiaturze
                działają tak samo.
              </p>

              <div className="flex items-center justify-between pt-1">
                <div className="text-center">
                  <span className="text-[9px] text-[#706C65] uppercase block font-mono">X</span>
                  <span className="font-mono font-bold text-[11px] text-[#292824]">
                    {effectiveOffset.x} px
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => onNudge(0, -1)}
                    className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded"
                    title="W górę (−1 px)"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onNudge(-1, 0)}
                      className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded"
                      title="W lewo (−1 px)"
                    >
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onNudge(1, 0)}
                      className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded"
                      title="W prawo (+1 px)"
                    >
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => onNudge(0, 1)}
                    className="p-1 bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] rounded"
                    title="W dół (+1 px)"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-center">
                  <span className="text-[9px] text-[#706C65] uppercase block font-mono">Y</span>
                  <span className="font-mono font-bold text-[11px] text-[#292824]">
                    {effectiveOffset.y} px
                  </span>
                </div>
              </div>
            </div>

            <StyleField
              label="Wyrównanie tekstu"
              value={styles.textAlign}
              placeholder="left"
              onChange={(value) => onUpdateStyles({ textAlign: value as ElementStyles['textAlign'] })}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
