import React from 'react';
import { AlertTriangle, Image as ImageIcon, Monitor, X } from 'lucide-react';
import { ElementAction } from '../lib/documentTree';
import { SITE_DOCUMENT_CAPABILITIES } from '../editor/capabilities';
import { SiteSelection } from './editSite';
import { SiteAsset } from './types';

/**
 * The contextual panel for a page designed elsewhere.
 *
 * Same shape and same place as the node editor's inspector: opened by the
 * action chips on the selection, never standing open on its own. The fields
 * differ because the document does — an HTML element has no Nodera styles to
 * resolve — but the shape of the interaction is the same one the user already
 * knows.
 */

export interface SiteActionInspectorProps {
  selection: SiteSelection;
  action: ElementAction;
  /** Declarations currently overridden for this element. */
  overrides: Record<string, string>;
  /** Stored images offered as replacements. */
  images: (SiteAsset & { thumbnail: string })[];
  onClose: () => void;
  onSetText: (text: string) => void;
  onSetImage: (next: { src?: string; alt?: string }) => void;
  onSetStyle: (declarations: Record<string, string>) => void;
}

const ACTION_TITLE: Record<ElementAction, string> = {
  text: 'Treść',
  size: 'Rozmiar i odstępy',
  appearance: 'Wygląd',
  position: 'Położenie',
};

const SIZE_FIELDS: { property: string; label: string; placeholder: string }[] = [
  { property: 'fontSize', label: 'Rozmiar tekstu', placeholder: 'np. 18px' },
  { property: 'lineHeight', label: 'Interlinia', placeholder: 'np. 1.5' },
  { property: 'letterSpacing', label: 'Odstęp liter', placeholder: 'np. 0.02em' },
  { property: 'padding', label: 'Dopełnienie', placeholder: 'np. 16px 24px' },
  { property: 'margin', label: 'Margines', placeholder: 'np. 0 0 24px' },
  { property: 'borderRadius', label: 'Zaokrąglenie', placeholder: 'np. 8px' },
];

const APPEARANCE_FIELDS: { property: string; label: string; placeholder: string }[] = [
  { property: 'color', label: 'Kolor tekstu', placeholder: 'np. #292824' },
  { property: 'backgroundColor', label: 'Tło', placeholder: 'np. #F6F4EF' },
  { property: 'fontWeight', label: 'Grubość', placeholder: 'np. 600' },
  { property: 'textAlign', label: 'Wyrównanie', placeholder: 'np. center' },
];

const StyleField: React.FC<{
  label: string;
  placeholder: string;
  value: string | undefined;
  onChange: (value: string) => void;
}> = ({ label, placeholder, value, onChange }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-[#706C65]">{label}</span>
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-28 px-2 py-1 bg-[#F6F4EF] border border-[#DED9CF] rounded text-right font-mono text-[11px] text-[#292824] focus:outline-none focus:border-[#A86645]"
    />
  </label>
);

export const SiteActionInspector: React.FC<SiteActionInspectorProps> = ({
  selection,
  action,
  overrides,
  images,
  onClose,
  onSetText,
  onSetImage,
  onSetStyle,
}) => (
  <aside className="w-64 shrink-0 bg-[#FFFEFB] border-l border-[#DED9CF] flex flex-col z-30">
    <div className="h-10 px-3 flex items-center justify-between border-b border-[#DED9CF] bg-[#F6F4EF]">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[9px] font-mono uppercase bg-[#A86645] text-white px-1.5 py-0.5 rounded font-bold shrink-0">
          {selection.tagName}
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
      <div className="p-2 rounded-lg border bg-[#F6F4EF] border-[#DED9CF] text-[#706C65] flex items-center gap-2 text-[10px]">
        <Monitor className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium leading-snug">Zmiana dotyczy wszystkich ekranów</span>
      </div>

      {action === 'text' && (
        <>
          {selection.available.includes('text') && selection.text !== null && (
            <div className="space-y-1.5">
              <label className="text-[#292824] font-medium block">Treść elementu</label>
              <textarea
                value={selection.text}
                onChange={(event) => onSetText(event.target.value)}
                rows={5}
                autoFocus
                className="w-full p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-[11px] text-[#292824] focus:outline-none focus:border-[#A86645] resize-none leading-relaxed"
              />
            </div>
          )}

          {selection.text === null && !selection.image && (
            // Said plainly rather than offered and silently destructive: the
            // element holds nested markup that replacing its text would erase.
            <p className="text-[10px] text-[#706C65] leading-relaxed p-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg">
              Ten element zawiera zagnieżdżone formatowanie, więc zmiana całej treści
              skasowałaby je. Zaznacz fragment wewnątrz, aby edytować tekst.
            </p>
          )}

          {selection.image && (
            <div className="space-y-2">
              <label className="text-[#292824] font-medium flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#A86645]" /> Obraz
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {images.map((asset) => (
                  <button
                    key={asset.path}
                    onClick={() => onSetImage({ src: asset.path })}
                    title={asset.path}
                    className={`aspect-video rounded border overflow-hidden ${
                      selection.image?.src.endsWith(asset.path.split('/').pop() ?? '\u0000')
                        ? 'border-[#A86645] ring-1 ring-[#A86645]/40'
                        : 'border-[#DED9CF]'
                    }`}
                  >
                    <img src={asset.thumbnail} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <label className="block space-y-1">
                <span className="text-[#706C65]">Tekst alternatywny</span>
                <input
                  type="text"
                  value={selection.image.alt}
                  onChange={(event) => onSetImage({ alt: event.target.value })}
                  className="w-full px-2 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded text-[11px]"
                />
              </label>
            </div>
          )}
        </>
      )}

      {(action === 'size' || action === 'appearance') && (
        <div className="space-y-2.5">
          {(action === 'size' ? SIZE_FIELDS : APPEARANCE_FIELDS).map(
            ({ property, label, placeholder }) => (
              <StyleField
                key={property}
                label={label}
                placeholder={placeholder}
                value={overrides[property]}
                onChange={(value) => onSetStyle({ [property]: value })}
              />
            ),
          )}
          <p className="text-[10px] text-[#706C65] leading-relaxed">
            Zmiany zapisują się jako osobne reguły CSS. Oryginalny arkusz autora pozostaje
            nietknięty, więc układ responsywny działa dalej. Puste pole usuwa nadpisanie.
          </p>
        </div>
      )}

      {action === 'position' && (
        <div className="p-2 rounded-lg border bg-amber-50 border-amber-200 text-amber-800 flex items-start gap-2 text-[10px] leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{SITE_DOCUMENT_CAPABILITIES.opticalNudge}</span>
        </div>
      )}
    </div>
  </aside>
);
