import React, { useState } from 'react';
import { 
  X, 
  MessageSquare, 
  Share2, 
  RotateCw, 
  CheckCircle2, 
  Plus, 
  Calendar, 
  ExternalLink,
  Lock,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { ProjectState, ProposalComment, ProposalSnapshot, NodeElement } from '../../types/document';
import { StorageService } from '../../services/storage';

interface ProposalViewProps {
  project: ProjectState;
  onClose: () => void;
  onAddComment: (comment: ProposalComment) => void;
  onUpdateSnapshot: (title: string) => void;
}

export const ProposalView: React.FC<ProposalViewProps> = ({
  project,
  onClose,
  onAddComment,
  onUpdateSnapshot
}) => {
  const [activePageSlug, setActivePageSlug] = useState<string>('start');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [authorName, setAuthorName] = useState('Klient (Magda)');
  const [targetElement, setTargetElement] = useState('Główna sekcja Hero');
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);

  // Latest snapshot or fallback to active direction
  const activeSnapshot: ProposalSnapshot = project.snapshots[project.snapshots.length - 1] || {
    id: 'live-snap',
    createdAt: 'Wersja bieżąca',
    title: 'Wersja wstępna',
    directionId: project.activeDirectionId,
    directionName: project.directions[project.activeDirectionId].name,
    commentsCount: project.comments.length,
    snapshotData: {
      pages: project.directions[project.activeDirectionId].pages,
      tokens: project.tokens
    }
  };

  const pages = activeSnapshot.snapshotData.pages;
  const activePage = pages[activePageSlug] || Object.values(pages)[0];

  const handleAddCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment: ProposalComment = {
      id: 'comm-' + Date.now(),
      elementId: 'elem-' + Date.now(),
      elementName: targetElement,
      author: authorName,
      text: commentText.trim(),
      createdAt: 'Przed chwilą',
      resolved: false
    };

    onAddComment(newComment);
    setCommentText('');
    setShowCommentInput(false);
  };

  const handleCreateNewSnapshot = () => {
    onUpdateSnapshot(`Propozycja ${activeSnapshot.directionName} (v${project.snapshots.length + 1})`);
    setSnapshotSuccess(true);
    setTimeout(() => setSnapshotSuccess(false), 2500);
  };

  // Render simplified read-only node
  const renderReadOnlyNode = (node: NodeElement): React.ReactNode => {
    const Tag = node.tag as any;
    const style: React.CSSProperties = { ...node.styles } as React.CSSProperties;
    if (node.opticalOffset) {
      style.transform = `translate(${node.opticalOffset.x}px, ${node.opticalOffset.y}px)`;
    }

    if (node.tag === 'img') {
      return <img key={node.id} src={node.src} alt={node.alt || ''} style={style} />;
    }

    return (
      <Tag key={node.id} style={style}>
        {node.content}
        {node.children && node.children.map(c => renderReadOnlyNode(c))}
      </Tag>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F6F4EF] flex flex-col font-sans select-none overflow-hidden">
      
      {/* Discrete Client Banner (Sekcja 4.D) */}
      <header className="h-14 bg-[#FFFEFB] border-b border-[#DED9CF] px-6 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-bold text-[#292824] uppercase tracking-wider text-[11px]">
              Propozycja strony dla klienta
            </span>
          </div>
          <span className="text-[#706C65]">·</span>
          <span className="text-[#706C65]">Pracownia Splot</span>
          <span className="text-[#706C65]">·</span>
          <span className="bg-[#F6F4EF] px-2 py-0.5 rounded border border-[#DED9CF] font-mono text-[10px] text-[#292824]">
            {activeSnapshot.title} ({activeSnapshot.createdAt})
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            <Lock className="w-3 h-3" /> Niezmienny snapshot
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          
          <button
            onClick={() => setShowCommentInput(!showCommentInput)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-[#292824] font-medium"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#A86645]" />
            <span>Zostaw uwagę ({project.comments.length})</span>
          </button>

          <button
            onClick={handleCreateNewSnapshot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F6F4EF] hover:bg-[#EFECE3] border border-[#DED9CF] text-[#292824] font-medium"
            title="Zamroź bieżące zmiany edytora do nowego snapshotu"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#706C65]" />
            <span>{snapshotSuccess ? 'Zaktualizowano!' : 'Aktualizuj propozycję'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-[#292824] hover:bg-[#3d3b36] text-white font-medium"
          >
            Wróć do edytora
          </button>

        </div>
      </header>

      {/* Subpage Navigator for Client */}
      <div className="h-10 bg-[#FFFEFB]/80 border-b border-[#DED9CF] px-6 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-[#706C65] mr-2">Przeglądaj podstrony:</span>
          {Object.values(pages).map((page) => (
            <button
              key={page.slug}
              onClick={() => setActivePageSlug(page.slug)}
              className={`px-3 py-1 rounded-md transition-all ${
                activePageSlug === page.slug
                  ? 'bg-[#292824] text-white font-medium'
                  : 'text-[#706C65] hover:text-[#292824]'
              }`}
            >
              {page.name}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-[#706C65]">
          Tryb bezpiecznego odczytu (odwiedzający nie może naruszyć kodu)
        </span>
      </div>

      {/* Client Feedback Drawer */}
      {showCommentInput && (
        <div className="bg-[#FFFEFB] border-b border-[#DED9CF] p-4 shadow-md animate-in fade-in">
          <form onSubmit={handleAddCommentSubmit} className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full space-y-1">
              <label className="text-[11px] font-semibold text-[#292824]">Twoja uwaga do projektu:</label>
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Np. Czy w nagłówku warsztatów możemy dopisać informację o poczęstunku?"
                className="w-full px-3 py-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs text-[#292824] focus:outline-none focus:border-[#A86645]"
              />
            </div>
            <div className="w-full sm:w-48 space-y-1">
              <label className="text-[11px] font-semibold text-[#292824]">Autor:</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full px-3 py-2 bg-[#F6F4EF] border border-[#DED9CF] rounded-lg text-xs text-[#292824] focus:outline-none focus:border-[#A86645]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#A86645] hover:bg-[#935537] text-white rounded-lg text-xs font-semibold shrink-0"
            >
              Dodaj uwagę
            </button>
          </form>
        </div>
      )}

      {/* Existing Comments List Bar */}
      {project.comments.length > 0 && (
        <div className="bg-[#FAF7F2] border-b border-[#DED9CF] px-6 py-2 flex items-center gap-3 overflow-x-auto text-xs">
          <span className="font-semibold text-[#292824] shrink-0">Przypięte uwagi:</span>
          {project.comments.map((comm) => (
            <div key={comm.id} className="bg-white border border-[#DED9CF] px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-2">
              <span className="font-semibold text-[#A86645]">{comm.author}:</span>
              <span className="text-[#292824] truncate max-w-[220px]">„{comm.text}”</span>
              <span className="text-[10px] text-[#706C65]">({comm.elementName})</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Clean Preview Area */}
      <div className="flex-1 overflow-y-auto p-6 flex justify-center bg-[#ECE8DF]">
        <div className="w-full max-w-5xl bg-[#FFFEFB] border border-[#DED9CF] rounded-2xl shadow-xl overflow-hidden min-h-[90vh]">
          {renderReadOnlyNode(activePage.root)}
        </div>
      </div>

    </div>
  );
};
