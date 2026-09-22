import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles,
  Send,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  Zap,
  Brain,
  MessageSquare,
  Bot,
  User,
  Paperclip,
  Download,
  AlertCircle,
  HelpCircle,
  X,
  ExternalLink,
} from 'lucide-react';
import { ChatMessage, ChatTaskTier, TikTokMediaItem } from '../types';
import { CHAT_ROLE_PRESETS, TIER_CONFIG } from '../data/chatRoles';

interface GeminiChatProps {
  currentMedia?: TikTokMediaItem | null;
  onOpenDownloader?: () => void;
  isFloating?: boolean;
  onClose?: () => void;
}

const STORAGE_KEY_MESSAGES = 'snaptikdou_gemini_chat_history';
const STORAGE_KEY_ROLE = 'snaptikdou_gemini_active_role';
const STORAGE_KEY_TIER = 'snaptikdou_gemini_active_tier';
const STORAGE_KEY_CUSTOM_INSTRUCTION = 'snaptikdou_gemini_custom_instruction';

export const GeminiChat: React.FC<GeminiChatProps> = ({
  currentMedia,
  onOpenDownloader,
  isFloating = false,
  onClose,
}) => {
  // Active Role & Tier States
  const [activeRoleId, setActiveRoleId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_ROLE) || 'creator_strategist';
    }
    return 'creator_strategist';
  });

  const activeRolePreset =
    CHAT_ROLE_PRESETS.find((r) => r.id === activeRoleId) || CHAT_ROLE_PRESETS[0];

  const [activeTier, setActiveTier] = useState<ChatTaskTier>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_TIER) as ChatTaskTier;
      if (saved && ['general', 'complex', 'fast'].includes(saved)) {
        return saved;
      }
    }
    return activeRolePreset.defaultTier;
  });

  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem(STORAGE_KEY_CUSTOM_INSTRUCTION) ||
        activeRolePreset.systemInstruction
      );
    }
    return activeRolePreset.systemInstruction;
  });

  const [isSystemInstructionEditorOpen, setIsSystemInstructionEditorOpen] = useState(false);

  // Conversation History
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auto-scroll ref
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ROLE, activeRoleId);
  }, [activeRoleId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TIER, activeTier);
  }, [activeTier]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CUSTOM_INSTRUCTION, customSystemInstruction);
  }, [customSystemInstruction]);

  // Scroll to bottom when messages update
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleRoleSelect = (roleId: string) => {
    const preset = CHAT_ROLE_PRESETS.find((r) => r.id === roleId);
    if (!preset) return;
    setActiveRoleId(roleId);
    setActiveTier(preset.defaultTier);
    setCustomSystemInstruction(preset.systemInstruction);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? input).trim();
    if (!textToSend || isLoading) return;

    setErrorMsg(null);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          taskTier: activeTier,
          model: TIER_CONFIG[activeTier].model,
          systemInstruction: customSystemInstruction,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Không thể tạo phản hồi từ Gemini AI.');
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        role: 'model',
        content: data.text || '(Không có nội dung phản hồi)',
        timestamp: Date.now(),
        modelUsed: data.modelUsed || TIER_CONFIG[activeTier].model,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Chat error:', err);
      const friendlyError =
        err?.message || 'Đã xảy ra lỗi khi kết nối tới Gemini AI. Vui lòng thử lại.';
      setErrorMsg(friendlyError);

      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: `⚠️ **Lỗi:** ${friendlyError}\n\n*Gợi ý:* Hãy kiểm tra cài đặt khóa API trong mục **Settings > Secrets** hoặc chuyển sang mức tác vụ "General (gemini-3.5-flash)" / "Fast (gemini-3.1-flash-lite)".`,
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    if (messages.length === 0) return;
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử đoạn hội thoại này không?')) {
      setMessages([]);
      setErrorMsg(null);
    }
  };

  const handleCopyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    const transcript = messages
      .map(
        (m) =>
          `### ${m.role === 'user' ? '👤 Người dùng' : `🤖 Gemini AI (${m.modelUsed || 'Gemini'})`} - ${new Date(m.timestamp).toLocaleTimeString()}\n\n${m.content}\n`
      )
      .join('\n---\n\n');

    const header = `# Lịch sử trò chuyện Gemini AI - SnapTikDou\nVai trò: ${activeRolePreset.title}\nMô hình: ${TIER_CONFIG[activeTier].model}\nNgày tạo: ${new Date().toLocaleString()}\n\n---\n\n`;

    const blob = new Blob([header + transcript], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Gemini_Chat_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleInsertMediaContext = () => {
    if (!currentMedia) return;
    const mediaPrompt = `Tôi đang tải video này từ ${currentMedia.platform === 'douyin' ? 'Douyin' : 'TikTok'}:
- Tác giả: @${currentMedia.author.uniqueId} (${currentMedia.author.nickname})
- Tiêu đề / Caption: "${currentMedia.title || 'Không có tiêu đề'}"
- Lượt xem: ${currentMedia.stats.plays.toLocaleString()} | Tim: ${currentMedia.stats.likes.toLocaleString()} | Bình luận: ${currentMedia.stats.comments.toLocaleString()}
- Âm thanh: "${currentMedia.audio.title || 'Âm thanh gốc'}" bởi ${currentMedia.audio.author || 'Creator'}

Hãy phân tích ngắn gọn lý do video này thu hút khán giả, và gợi ý 3 ý tưởng hook / biến thể sáng tạo dựa trên định dạng này.`;

    setInput(mediaPrompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div
      className={`flex flex-col bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden ${
        isFloating
          ? 'h-[85vh] max-h-[720px] w-full max-w-xl mx-auto'
          : 'h-[calc(100vh-140px)] min-h-[580px] max-w-5xl mx-auto w-full'
      }`}
    >
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-slate-50 via-pink-50/30 to-purple-50/20 border-b border-slate-200/80">
        {/* Left: Bot Brand & Role Dropdown */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900">
                Gemini AI Chat
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200">
                Multi-Turn
              </span>
            </div>

            {/* Role Preset Selector */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-slate-500">Vai trò:</span>
              <select
                value={activeRoleId}
                onChange={(e) => handleRoleSelect(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-white/90 border border-slate-200 rounded-lg px-2 py-0.5 hover:border-pink-300 focus:outline-none focus:ring-1 focus:ring-pink-500 cursor-pointer shadow-2xs"
                title="Chọn vai trò định sẵn cho Chatbot"
              >
                {CHAT_ROLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Task Tier & Tools */}
        <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
          {/* Speed & Complexity Tier Selector */}
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTier('fast')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                activeTier === 'fast'
                  ? 'bg-white text-emerald-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Fast: Tối ưu phản hồi nhanh với gemini-3.1-flash-lite"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Nhanh</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTier('general')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                activeTier === 'general'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="General: Tác vụ tổng quát tiêu chuẩn với gemini-3.5-flash"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Tổng quát</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTier('complex')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                activeTier === 'complex'
                  ? 'bg-white text-purple-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Complex: Tác vụ phức tạp, phân tích chuyên sâu với gemini-3.1-pro-preview"
            >
              <Brain className="w-3.5 h-3.5 text-purple-600" />
              <span>Chuyên sâu</span>
            </button>
          </div>

          {/* System Instruction Edit Button */}
          <button
            type="button"
            onClick={() => setIsSystemInstructionEditorOpen(!isSystemInstructionEditorOpen)}
            className={`p-1.5 rounded-lg border transition text-xs font-medium flex items-center gap-1 cursor-pointer ${
              isSystemInstructionEditorOpen
                ? 'bg-pink-100 text-pink-700 border-pink-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Xem và chỉnh sửa System Instruction (Chỉ dẫn hệ thống)"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Chỉ thị</span>
          </button>

          {/* Export Chat */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleExportChat}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
              title="Xuất nội dung hội thoại dạng Markdown"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Clear History */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition cursor-pointer"
              title="Xóa lịch sử trò chuyện"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {isFloating && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* System Instruction Drawer/Editor */}
      {isSystemInstructionEditorOpen && (
        <div className="bg-slate-50/95 border-b border-slate-200 p-3 sm:p-4 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-pink-600" />
              <span className="text-xs font-bold text-slate-800">
                System Instruction (Chỉ thị vai trò cho Gemini)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCustomSystemInstruction(activeRolePreset.systemInstruction)}
              className="text-[11px] text-pink-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Đặt lại mặc định của vai trò
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            Chỉ thị này quy định phong cách trả lời, vai trò chuyên gia và tiêu chuẩn định dạng của
            Gemini trong suốt toàn bộ cuộc đối thoại.
          </p>
          <textarea
            value={customSystemInstruction}
            onChange={(e) => setCustomSystemInstruction(e.target.value)}
            rows={3}
            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-y"
            placeholder="Nhập System Instruction tùy chỉnh..."
          />
        </div>
      )}

      {/* Active Model Indicator Strip */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100/70 border-b border-slate-200/70 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span>Mô hình đang dùng:</span>
          <span
            className={`font-mono font-semibold px-2 py-0.5 rounded-md border ${TIER_CONFIG[activeTier].badgeClass}`}
          >
            {TIER_CONFIG[activeTier].model}
          </span>
          <span className="hidden sm:inline text-slate-400">
            • {TIER_CONFIG[activeTier].description}
          </span>
        </div>

        {currentMedia && (
          <button
            type="button"
            onClick={handleInsertMediaContext}
            className="text-[11px] font-medium text-pink-600 hover:text-pink-700 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            title="Đưa thông tin bài viết Douyin/TikTok hiện tại vào ô nhập tin nhắn"
          >
            <Paperclip className="w-3 h-3" />
            <span>Đính kèm video hiện tại</span>
          </button>
        )}
      </div>

      {/* Scrollable Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 sm:space-y-5 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center text-white shadow-md mb-3.5">
              <Sparkles className="w-7 h-7" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
              {activeRolePreset.title}
            </h3>
            <p className="text-xs text-slate-600 max-w-md mb-6 leading-relaxed">
              {activeRolePreset.description}
            </p>

            {/* Quick Starter Suggestions */}
            <div className="w-full space-y-2 text-left">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block px-1">
                Gợi ý câu hỏi bắt đầu:
              </span>
              <div className="grid grid-cols-1 gap-2">
                {activeRolePreset.starterPrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full text-left text-xs bg-white hover:bg-pink-50/60 hover:border-pink-200 border border-slate-200 rounded-xl p-2.5 transition-all text-slate-700 font-medium flex items-center justify-between group shadow-2xs cursor-pointer"
                  >
                    <span>{prompt}</span>
                    <Send className="w-3.5 h-3.5 text-slate-300 group-hover:text-pink-600 transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                className={`flex gap-3 max-w-[92%] sm:max-w-[85%] ${
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                    isUser
                      ? 'bg-slate-800 text-white'
                      : message.isError
                      ? 'bg-rose-100 text-rose-600 border border-rose-200'
                      : 'bg-gradient-to-tr from-pink-500 via-rose-500 to-indigo-600 text-white'
                  }`}
                >
                  {isUser ? (
                    <User className="w-4 h-4" />
                  ) : message.isError ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                {/* Message Bubble Container */}
                <div className="flex flex-col space-y-1">
                  {/* Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                      isUser
                        ? 'bg-slate-900 text-white rounded-tr-xs'
                        : message.isError
                        ? 'bg-rose-50/90 text-rose-900 border border-rose-200/80 rounded-tl-xs'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap select-text">{message.content}</p>
                    ) : (
                      <div className="prose prose-xs sm:prose-sm max-w-none text-slate-800 prose-headings:font-bold prose-headings:text-slate-900 prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-code:text-pink-600 prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-pre:bg-slate-900 prose-pre:text-slate-100 select-text">
                        <Markdown>{message.content}</Markdown>
                      </div>
                    )}
                  </div>

                  {/* Metadata & Actions */}
                  <div
                    className={`flex items-center gap-2 px-1 text-[10px] text-slate-400 ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span>
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {!isUser && message.modelUsed && (
                      <span className="font-mono text-[9px] px-1.5 py-0.2 bg-slate-100 rounded text-slate-500">
                        {message.modelUsed}
                      </span>
                    )}

                    {!isUser && !message.isError && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(message.content, message.id)}
                        className="hover:text-slate-700 flex items-center gap-0.5 transition cursor-pointer"
                        title="Sao chép nội dung"
                      >
                        {copiedId === message.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === message.id ? 'Đã chép' : 'Chép'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator Bubble */}
        {isLoading && (
          <div className="flex gap-3 max-w-[85%] mr-auto animate-in fade-in duration-200">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-2xs">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-4 py-3 shadow-2xs flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-rose-500 animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                />
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Gemini ({TIER_CONFIG[activeTier].model}) đang suy nghĩ...
              </span>
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Media Context Quick Bar (If present) */}
      {currentMedia && (
        <div className="bg-pink-50/50 border-t border-pink-100/70 px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={currentMedia.cover || currentMedia.images[0] || '/logo.svg'}
              alt="Preview"
              className="w-7 h-7 rounded-md object-cover border border-pink-200 shrink-0"
            />
            <span className="text-xs text-slate-700 truncate font-medium">
              Đang phân tích: <strong>@{currentMedia.author.uniqueId}</strong> - "
              {currentMedia.title || 'Video Media'}"
            </span>
          </div>
          <button
            type="button"
            onClick={handleInsertMediaContext}
            className="text-xs font-semibold text-pink-700 bg-white hover:bg-pink-100 px-2.5 py-1 rounded-lg border border-pink-200 transition cursor-pointer shrink-0"
          >
            Hỏi về video này
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200/90">
        <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-300 rounded-2xl p-1.5 focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-500/20 transition-all shadow-2xs">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Hỏi Gemini (${TIER_CONFIG[activeTier].name}) - Nhấn Enter để gửi, Shift+Enter xuống dòng...`}
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 p-2 focus:outline-none resize-none max-h-40 min-h-[38px]"
          />

          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isLoading}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              input.trim() && !isLoading
                ? 'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-sm hover:scale-105 active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            title="Gửi tin nhắn"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Helper Bar */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-2">
          <span>
            Được hỗ trợ bởi <strong>Google Gemini API</strong> (@google/genai SDK)
          </span>
          <span className="hidden sm:inline">Shift + Enter để xuống hàng</span>
        </div>
      </div>
    </div>
  );
};
