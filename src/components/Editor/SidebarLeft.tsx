import React, { useState } from 'react';
import { 
  FileText, 
  Compass, 
  FolderTree, 
  Palette, 
  Image as ImageIcon, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Check, 
  Eye, 
  Sparkles 
} from 'lucide-react';
import { 
  NodeElement, 
  DirectionOption, 
  DesignTokens, 
  PageDocument 
} from '../../types/document';
import { CERAMIC_IMAGES } from '../../data/splotDemo';

interface SidebarLeftProps {
  pages: Record<string, PageDocument>;
  activePageSlug: string;
  onSelectPage: (slug: string) => void;
  directions: Record<string, DirectionOption>;
  activeDirectionId: string;
  onSelectDirection: (id: string) => void;
  rootElement: NodeElement;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  tokens: DesignTokens;
  onUpdateTokens: (newTokens: Partial<DesignTokens>) => void;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  pages,
  activePageSlug,
  onSelectPage,
  directions,
  activeDirectionId,
  onSelectDirection,
  rootElement,
  selectedElementId,
  onSelectElement,
  tokens,
  onUpdateTokens
}) => {
  const [activeTab, setActiveTab] = useState<'pages' | 'directions' | 'tree' | 'tokens' | 'assets'>('pages');

  // Recursive Tree Node Renderer
  const renderTreeItem = (node: NodeElement, depth = 0): React.ReactNode => {
    const isSelected = selectedElementId === node.id;
    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => onSelectElement(node.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`py-1.5 pr-2 flex items-center justify-between text-xs cursor-pointer rounded-lg transition-colors ${
            isSelected
              ? 'bg-[#A86645] text-white font-medium'
              : 'text-[#292824] hover:bg-[#F6F4EF]'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span className={`text-[10px] uppercase font-mono px-1 rounded ${
              isSelected ? 'bg-black/20 text-white' : 'bg-[#DED9CF] text-[#706C65]'
            }`}>
              {node.tag}
            </span>
            <span className="truncate">{node.name}</span>
          </div>
        </div>
        {node.children && node.children.map(c => renderTreeItem(c, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="w-72 bg-[#FFFEFB] border-r border-[#DED9CF] flex flex-col h-[calc(100vh-4rem-5rem)] select-none">
      
      {/* Icon Navigation Tabs */}
      <div className="flex items-center justify-around border-b border-[#DED9CF] p-1 bg-[#F6F4EF] text-xs">
        <button
          onClick={() => setActiveTab('pages')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'pages' ? 'bg-[#FFFEFB] text-[#A86645] shadow-sm font-semibold' : 'text-[#706C65] hover:text-[#292824]'
          }`}
          title="Podstrony serwisu"
        >
          <FileText className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTab('directions')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'directions' ? 'bg-[#FFFEFB] text-[#A86645] shadow-sm font-semibold' : 'text-[#706C65] hover:text-[#292824]'
          }`}
          title="Półka alternatywnych kierunków"
        >
          <Compass className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTab('tree')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'tree' ? 'bg-[#FFFEFB] text-[#A86645] shadow-sm font-semibold' : 'text-[#706C65] hover:text-[#292824]'
          }`}
          title="Struktura i drzewo dokumentu"
        >
          <FolderTree className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTab('tokens')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'tokens' ? 'bg-[#FFFEFB] text-[#A86645] shadow-sm font-semibold' : 'text-[#706C65] hover:text-[#292824]'
          }`}
          title="Globalne tokeny stylu"
        >
          <Palette className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTab('assets')}
          className={`p-2 rounded-lg transition-colors ${
            activeTab === 'assets' ? 'bg-[#FFFEFB] text-[#A86645] shadow-sm font-semibold' : 'text-[#706C65] hover:text-[#292824]'
          }`}
          title="Materiały i zdjęcia"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* TAB 1: PAGES */}
        {activeTab === 'pages' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">Podstrony ({Object.keys(pages).length})</span>
            </div>
            <div className="space-y-1">
              {Object.values(pages).map((page) => (
                <div
                  key={page.slug}
                  onClick={() => onSelectPage(page.slug)}
                  className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between text-xs transition-colors ${
                    activePageSlug === page.slug
                      ? 'bg-[#F6F4EF] text-[#292824] font-semibold border border-[#DED9CF]'
                      : 'text-[#706C65] hover:text-[#292824] hover:bg-[#F6F4EF]/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-[#A86645]" />
                    <span>{page.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#706C65]">/{page.slug}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: DIRECTIONS SHELF */}
        {activeTab === 'directions' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">Półka kierunków (3)</span>
            <div className="space-y-2.5">
              {Object.values(directions).map((dir) => {
                const isActive = dir.id === activeDirectionId;
                return (
                  <div
                    key={dir.id}
                    onClick={() => onSelectDirection(dir.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#FFFEFB] border-[#A86645] shadow-sm ring-1 ring-[#A86645]/40'
                        : 'bg-[#F6F4EF] border-[#DED9CF] hover:border-[#706C65]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#292824]">{dir.name}</span>
                      {isActive && <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#A86645] text-white">Aktywny</span>}
                    </div>
                    <p className="text-[11px] text-[#706C65] mt-1 leading-snug">{dir.subtitle}</p>
                    <div className="mt-2 pt-2 border-t border-[#DED9CF]/60 flex items-center justify-between text-[10px] text-[#706C65]">
                      <span>{dir.subpagesPlan.length} podstrony</span>
                      <span className="text-[#A86645] font-medium">Przełącz →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: TREE */}
        {activeTab === 'tree' && (
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">Struktura elementów</span>
            <div className="border border-[#DED9CF] rounded-xl p-2 bg-[#F6F4EF]/50 max-h-[60vh] overflow-y-auto">
              {renderTreeItem(rootElement)}
            </div>
          </div>
        )}

        {/* TAB 4: TOKENS */}
        {activeTab === 'tokens' && (
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">Globalne tokeny stylu</span>
            
            {/* Accent Copper Color */}
            <div className="space-y-1.5 text-xs">
              <label className="text-[#292824] font-medium block">Kolor akcentu (Przyciski CTA)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={tokens.accentCopper}
                  onChange={(e) => onUpdateTokens({ accentCopper: e.target.value })}
                  className="w-8 h-8 rounded border border-[#DED9CF] cursor-pointer"
                />
                <input
                  type="text"
                  value={tokens.accentCopper}
                  onChange={(e) => onUpdateTokens({ accentCopper: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs font-mono text-[#292824]"
                />
              </div>
            </div>

            {/* Quick Palette presets */}
            <div className="space-y-1.5 text-xs">
              <span className="text-[#706C65] text-[11px]">Szybkie palety autorskie:</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onUpdateTokens({ accentCopper: '#A86645' })}
                  className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#F6F4EF] text-left flex items-center gap-2 hover:bg-[#EFECE3]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#A86645] shrink-0"></span>
                  <span className="text-[11px] text-[#292824]">Miedź</span>
                </button>
                <button
                  onClick={() => onUpdateTokens({ accentCopper: '#24486E' })}
                  className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#F6F4EF] text-left flex items-center gap-2 hover:bg-[#EFECE3]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#24486E] shrink-0"></span>
                  <span className="text-[11px] text-[#292824]">Kobalt</span>
                </button>
                <button
                  onClick={() => onUpdateTokens({ accentCopper: '#3E5748' })}
                  className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#F6F4EF] text-left flex items-center gap-2 hover:bg-[#EFECE3]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#3E5748] shrink-0"></span>
                  <span className="text-[11px] text-[#292824]">Szałwia</span>
                </button>
                <button
                  onClick={() => onUpdateTokens({ accentCopper: '#1C1B19' })}
                  className="p-1.5 rounded-lg border border-[#DED9CF] bg-[#F6F4EF] text-left flex items-center gap-2 hover:bg-[#EFECE3]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#1C1B19] shrink-0"></span>
                  <span className="text-[11px] text-[#292824]">Grafit</span>
                </button>
              </div>
            </div>

            {/* Button Radius */}
            <div className="space-y-1.5 text-xs">
              <label className="text-[#292824] font-medium block">Promień zaokrąglenia przycisków</label>
              <select
                value={tokens.buttonRadius}
                onChange={(e) => onUpdateTokens({ buttonRadius: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs text-[#292824]"
              >
                <option value="0px">0px (Ostre krawędzie)</option>
                <option value="4px">4px (Subtelne)</option>
                <option value="8px">8px (Domyślne ceramika)</option>
                <option value="16px">16px (Mocne zaokrąglenie)</option>
                <option value="9999px">Pełna pigułka</option>
              </select>
            </div>
          </div>
        )}

        {/* TAB 5: ASSETS */}
        {activeTab === 'assets' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#706C65]">Zdjęcia pracowni</span>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(CERAMIC_IMAGES).map(([name, url]) => (
                <div key={name} className="relative group rounded-lg overflow-hidden border border-[#DED9CF] aspect-video">
                  <img src={url} alt={name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-medium p-1 text-center">
                    {name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </aside>
  );
};
