import React from 'react';
import { X } from 'lucide-react';
import { ConversionReport } from './types';

/**
 * What the conversion did, and what it could not do.
 *
 * Kept as its own screen rather than a badge in the header: the honest
 * answer to "is anything missing?" is a list, and a list belongs where it can
 * be read, not where it has to be guessed at from a warning colour.
 */

const STACK_LABEL: Record<ConversionReport['stack'], string> = {
  'static-html-css': 'statyczny HTML + CSS',
  'static-html-js': 'HTML + CSS + JavaScript',
  unsupported: 'nieobsługiwany',
};

export const ConversionReportModal: React.FC<{
  report: ConversionReport;
  onClose: () => void;
}> = ({ report, onClose }) => (
  <div className="fixed inset-0 z-50 bg-[#292824]/60 backdrop-blur-sm flex items-center justify-center p-6">
    <div
      role="dialog"
      aria-label="Raport konwersji"
      className="bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-auto shadow-2xl"
    >
      <div className="p-4 border-b border-[#DED9CF] flex items-center justify-between bg-[#F6F4EF]">
        <h2 className="text-sm font-bold">Raport konwersji</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-[#DED9CF]" title="Zamknij">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 text-xs">
        <p>
          <strong>Rozpoznany stos:</strong> {STACK_LABEL[report.stack]}
        </p>
        <p>
          <strong>Plik wejściowy:</strong> {report.entry} · <strong>plików:</strong>{' '}
          {report.files.length} · <strong>materiałów:</strong> {report.assets.length}
        </p>
        {report.scriptsRemoved > 0 && (
          <p>
            <strong>Usunięte skrypty:</strong> {report.scriptsRemoved} — kopia edytowalna nie
            wykonuje JavaScriptu.
          </p>
        )}

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
);
