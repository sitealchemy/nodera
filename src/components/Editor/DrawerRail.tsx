import React from 'react';
import { Compass, FileText, FolderTree, Image as ImageIcon, Palette, X } from 'lucide-react';
import { DesignTokens, DirectionOption, ResponsiveScope } from '../../types/document';
import { SCOPE_NAME } from '../../services/scopeCapability';
import { UnsupportedFeatures } from '../../editor/capabilities';

/**
 * Edge rail plus a single drawer.
 *
 * Only one drawer is open at a time and all of them start closed, so the page
 * — not the tooling — is what the user sees first. Opening or closing a drawer
 * never touches the camera: the canvas keeps its own pan and zoom.
 */

export type DrawerId = 'pages' | 'assets' | 'directions' | 'tree' | 'styles';

/**
 * One entry of the structure tree.
 *
 * The drawer only ever needed an id, a type badge, a name and children. Taking
 * a `NodeElement` instead is what kept the structure panel out of reach for
 * documents that are not node trees.
 */
export interface TreeEntry {
  id: string;
  tag: string;
  label: string;
  children?: TreeEntry[];
}

export interface DrawerAsset {
  name: string;
  url: string;
}

export interface DrawerRailProps {
  openDrawer: DrawerId | null;
  onToggleDrawer: (drawer: DrawerId) => void;
  onCloseDrawer: () => void;

  pages: { slug: string; name: string }[];
  activePageSlug: string;
  onSelectPage: (slug: string) => void;

  directions?: Record<string, DirectionOption>;
  activeDirectionId?: string;
  onSelectDirection?: (id: string) => void;

  tree: TreeEntry | null;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;

  assets: DrawerAsset[];

  tokens?: DesignTokens;
  onUpdateTokens?: (delta: Partial<DesignTokens>) => void;
  /** Shown so the token control cannot imply a locality it does not have. */
  responsiveScope: ResponsiveScope;

  /** Features the open document does not support, with the reason for each. */
  unsupported?: UnsupportedFeatures;
}

/** Which capability, if any, each drawer depends on. */
const DRAWER_FEATURE: Partial<Record<DrawerId, keyof UnsupportedFeatures>> = {
  pages: 'pages',
  directions: 'directions',
  styles: 'tokens',
};

const RAIL_ITEMS: { id: DrawerId; icon: React.ElementType; label: string }[] = [
  { id: 'pages', icon: FileText, label: 'Podstrony' },
  { id: 'assets', icon: ImageIcon, label: 'Materiały' },
  { id: 'directions', icon: Compass, label: 'Kierunki' },
  { id: 'tree', icon: FolderTree, label: 'Struktura' },
  { id: 'styles', icon: Palette, label: 'Style' },
];

const DRAWER_TITLE: Record<DrawerId, string> = {
  pages: 'Podstrony',
  assets: 'Materiały',
  directions: 'Kierunki projektowe',
  tree: 'Struktura dokumentu',
  styles: 'Globalne style',
};

export const DrawerRail: React.FC<DrawerRailProps> = ({
  openDrawer,
  onToggleDrawer,
  onCloseDrawer,
  pages,
  activePageSlug,
  onSelectPage,
  directions,
  activeDirectionId,
  onSelectDirection,
  tree,
  selectedElementId,
  onSelectElement,
  assets,
  tokens,
  onUpdateTokens,
  responsiveScope,
  unsupported = {},
}) => {
  // Global tokens are a property of the direction, not of a breakpoint. With a
  // local scope selected the control would otherwise look like a local edit
  // while changing every screen, so it says plainly what it does.
  const tokensAreShared = true;
  const scopeMismatch = responsiveScope !== 'all' && tokensAreShared;
  const renderTree = (node: TreeEntry, depth = 0): React.ReactNode => {
    const isSelected = selectedElementId === node.id;
    return (
      <div key={node.id}>
        <button
          onClick={() => onSelectElement(node.id)}
          style={{ paddingLeft: depth * 12 + 8 }}
          className={`w-full py-1.5 pr-2 flex items-center gap-1.5 text-[11px] rounded-lg text-left transition-colors ${
            isSelected ? 'bg-[#A86645] text-white' : 'text-[#292824] hover:bg-[#F6F4EF]'
          }`}
        >
          <span
            className={`text-[9px] uppercase font-mono px-1 rounded shrink-0 ${
              isSelected ? 'bg-black/20' : 'bg-[#DED9CF] text-[#706C65]'
            }`}
          >
            {node.tag}
          </span>
          <span className="truncate">{node.label}</span>
        </button>
        {node.children?.map((child) => renderTree(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      {/* Rail */}
      <div className="w-12 shrink-0 bg-[#FFFEFB] border-r border-[#DED9CF] flex flex-col items-center py-2 gap-1 z-30">
        {RAIL_ITEMS.map(({ id, icon: Icon, label }) => {
          const feature = DRAWER_FEATURE[id];
          const reason = feature ? unsupported[feature] : undefined;
          return (
            <button
              key={id}
              onClick={() => onToggleDrawer(id)}
              disabled={!!reason}
              // The rail keeps the same five tools for every document, and a
              // tool that does not apply says why instead of disappearing.
              title={reason ? `${label} — ${reason}` : label}
              aria-pressed={openDrawer === id}
              className={`p-2 rounded-lg transition-colors disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent ${
                openDrawer === id
                  ? 'bg-[#A86645] text-white'
                  : 'text-[#706C65] hover:text-[#292824] hover:bg-[#F6F4EF]'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Drawer */}
      {openDrawer && (
        <aside className="w-64 shrink-0 bg-[#FFFEFB] border-r border-[#DED9CF] flex flex-col z-30">
          <div className="h-10 px-3 flex items-center justify-between border-b border-[#DED9CF] bg-[#F6F4EF]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#706C65]">
              {DRAWER_TITLE[openDrawer]}
            </span>
            <button
              onClick={onCloseDrawer}
              className="p-1 rounded hover:bg-[#DED9CF] text-[#706C65]"
              title="Zamknij panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs">
            {openDrawer === 'pages' && (
              <div className="space-y-1">
                {pages.map((page) => (
                  <button
                    key={page.slug}
                    onClick={() => onSelectPage(page.slug)}
                    className={`w-full p-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors ${
                      activePageSlug === page.slug
                        ? 'bg-[#F6F4EF] border border-[#DED9CF] font-semibold text-[#292824]'
                        : 'text-[#706C65] hover:bg-[#F6F4EF]/60'
                    }`}
                  >
                    <span className="truncate">{page.name}</span>
                    <span className="text-[10px] font-mono text-[#706C65] shrink-0">/{page.slug}</span>
                  </button>
                ))}
              </div>
            )}

            {openDrawer === 'assets' && (
              <div className="grid grid-cols-2 gap-2">
                {assets.map(({ name, url }) => (
                  <div
                    key={name}
                    className="relative group rounded-lg overflow-hidden border border-[#DED9CF] aspect-video"
                  >
                    <img src={url} alt={name} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white p-1 text-center">
                      {name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {openDrawer === 'directions' && (
              <div className="space-y-2">
                {Object.values(directions ?? {}).map((dir) => {
                  const isActive = dir.id === activeDirectionId;
                  return (
                    <button
                      key={dir.id}
                      onClick={() => onSelectDirection?.(dir.id)}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        isActive
                          ? 'bg-[#FFFEFB] border-[#A86645] ring-1 ring-[#A86645]/40'
                          : 'bg-[#F6F4EF] border-[#DED9CF] hover:border-[#706C65]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#292824]">{dir.name}</span>
                        {isActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#A86645] text-white shrink-0">
                            Aktywny
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#706C65] mt-1 leading-snug">{dir.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {openDrawer === 'tree' &&
              (tree ? (
                <div className="-mx-1">{renderTree(tree)}</div>
              ) : (
                <p className="text-[11px] text-[#706C65] leading-relaxed">
                  Ten dokument nie udostępnia struktury.
                </p>
              ))}

            {openDrawer === 'styles' && tokens && onUpdateTokens && (
              <div className="space-y-4">
                <div
                  className={`p-2 rounded-lg border text-[10px] leading-snug ${
                    scopeMismatch
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-[#F6F4EF] border-[#DED9CF] text-[#706C65]'
                  }`}
                >
                  {scopeMismatch ? (
                    <>
                      Zakres edycji to „{SCOPE_NAME[responsiveScope]}", ale te style są
                      <strong> wspólne dla wszystkich ekranów</strong> w tym kierunku. Zmiana tutaj
                      dotyczy całego projektu, nie tylko wybranego zakresu.
                    </>
                  ) : (
                    <>Zmiana dotyczy wszystkich ekranów w aktywnym kierunku.</>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[#292824] font-medium block">Kolor akcentu (przyciski)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={tokens.accentCopper}
                      onChange={(e) => onUpdateTokens({ accentCopper: e.target.value })}
                      className="w-8 h-8 rounded border border-[#DED9CF] cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      value={tokens.accentCopper}
                      onChange={(e) => onUpdateTokens({ accentCopper: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[#706C65] text-[11px]">Szybkie palety:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      ['#A86645', 'Miedź'],
                      ['#24486E', 'Kobalt'],
                      ['#3E5748', 'Szałwia'],
                      ['#1C1B19', 'Grafit'],
                    ].map(([color, label]) => (
                      <button
                        key={color}
                        onClick={() => onUpdateTokens({ accentCopper: color })}
                        className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#F6F4EF] flex items-center gap-2 hover:bg-[#EFECE3]"
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[11px] text-[#292824]">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[#292824] font-medium block">Zaokrąglenie przycisków</label>
                  <select
                    value={tokens.buttonRadius}
                    onChange={(e) => onUpdateTokens({ buttonRadius: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-[11px]"
                  >
                    <option value="0px">0 px (ostre)</option>
                    <option value="4px">4 px (subtelne)</option>
                    <option value="8px">8 px (domyślne)</option>
                    <option value="16px">16 px (mocne)</option>
                    <option value="9999px">Pełna pigułka</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
