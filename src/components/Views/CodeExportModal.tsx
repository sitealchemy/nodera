import React, { useState } from 'react';
import { 
  X, 
  Code, 
  Copy, 
  Check, 
  Download, 
  FileJson, 
  FileCode, 
  Layers 
} from 'lucide-react';
import { ProjectState } from '../../types/document';
import { StorageService } from '../../services/storage';

interface CodeExportModalProps {
  project: ProjectState;
  onClose: () => void;
}

export const CodeExportModal: React.FC<CodeExportModalProps> = ({
  project,
  onClose
}) => {
  const [activeSlug, setActiveSlug] = useState('start');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const activeHtml = StorageService.generateExportHtml(project, activeSlug);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeHtml);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([activeHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-${activeSlug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    StorageService.exportProjectJson(project);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#292824]/60 backdrop-blur-sm select-none font-sans">
      <div className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-[#DED9CF] flex items-center justify-between bg-[#F6F4EF]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#292824] text-white">
              <Code className="w-5 h-5 text-[#A86645]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#292824]">Semantyczny kod i eksport projektu</h2>
              <p className="text-xs text-[#706C65]">Czysty HTML + Tailwind, gotowy do wdrożenia lub dalszej pracy z developerem</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-[#DED9CF] text-[#706C65] hover:text-[#292824] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subpages Tabs & Export Actions */}
        <div className="px-6 py-2.5 bg-[#F6F4EF]/80 border-b border-[#DED9CF] flex flex-wrap items-center justify-between gap-3 text-xs">
          
          <div className="flex items-center gap-1.5">
            <span className="text-[#706C65] mr-1">Podstrona:</span>
            {['start', 'warsztaty', 'o-pracowni', 'kontakt'].map((slug) => (
              <button
                key={slug}
                onClick={() => setActiveSlug(slug)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  activeSlug === slug
                    ? 'bg-[#292824] text-white'
                    : 'bg-[#FFFEFB] border border-[#DED9CF] text-[#706C65] hover:text-[#292824]'
                }`}
              >
                {slug === 'start' ? 'Start' : slug === 'warsztaty' ? 'Warsztaty' : slug === 'o-pracowni' ? 'O pracowni' : 'Kontakt'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] text-[#292824] font-medium transition-colors"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#706C65]" />}
              <span>{copiedCode ? 'Skopiowano kod' : 'Kopiuj HTML'}</span>
            </button>

            <button
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FFFEFB] hover:bg-[#EFECE3] border border-[#DED9CF] text-[#292824] font-medium transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-[#A86645]" />
              <span>Pobierz .html</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#292824] hover:bg-[#3d3b36] text-white font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#A86645]" />
              <span>Pobierz paczkę projektu (JSON)</span>
            </button>
          </div>

        </div>

        {/* Code Box */}
        <div className="flex-1 overflow-auto p-4 bg-[#1E1E1E]">
          <pre className="font-mono text-xs text-[#D4D4D4] leading-relaxed select-text">
            {activeHtml}
          </pre>
        </div>

      </div>
    </div>
  );
};
