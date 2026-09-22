import React from 'react';
import { GeminiChat } from './GeminiChat';
import { TikTokMediaItem } from '../types';

interface GeminiChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMedia?: TikTokMediaItem | null;
  onOpenDownloader?: () => void;
}

export const GeminiChatModal: React.FC<GeminiChatModalProps> = ({
  isOpen,
  onClose,
  currentMedia,
  onOpenDownloader,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <GeminiChat
          currentMedia={currentMedia}
          onOpenDownloader={onOpenDownloader}
          isFloating={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
