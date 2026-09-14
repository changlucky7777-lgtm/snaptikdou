import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Wrench, RotateCcw, Copy, Check, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleAutoFix = () => {
    // Clear potentially corrupted local state & restore safe defaults
    try {
      localStorage.removeItem('snaptikdou_path_config');
      localStorage.removeItem('tik1click_path_config');
      sessionStorage.clear();
    } catch {
      // ignore
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleCopyForAI = () => {
    const errorText = `Fix the errors in the app
[AIS_METADATA_SECTION_START]
error: ${this.state.error?.name || 'Error'}: ${this.state.error?.message || 'Unknown error'}
stack: ${this.state.error?.stack || ''}
componentStack: ${this.state.errorInfo?.componentStack || ''}
[AIS_METADATA_SECTION_END]`;

    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl flex-shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    PREVIEW ERROR DETECTED
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Đã phát hiện sự cố trong ứng dụng
                </h2>
                <p className="text-xs text-slate-400">
                  Hệ thống tự động bảo vệ giao diện khỏi bị trắng màn hình. Bạn có thể bấm nút Fix dưới đây để xử lý ngay.
                </p>
              </div>
            </div>

            {/* Error detail box */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs text-red-400 space-y-1 overflow-x-auto max-h-48">
              <div className="font-bold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                <span>Chi tiết lỗi:</span>
              </div>
              <div className="text-red-300 font-semibold">{this.state.error?.message}</div>
              {this.state.error?.stack && (
                <div className="text-[10px] text-slate-500 pt-1 leading-relaxed whitespace-pre-wrap">
                  {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                </div>
              )}
            </div>

            {/* Action buttons with prominent FIX button */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              
              {/* Main Fix Button */}
              <button
                onClick={this.handleAutoFix}
                className="w-full sm:w-auto flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-amber-500 hover:from-pink-500 hover:to-amber-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-pink-600/25 transition active:scale-95"
              >
                <Wrench className="w-4 h-4" />
                <span>⚡ FIX: Tự Động Khắc Phục & Khôi Phục</span>
              </button>

              {/* Copy prompt for AI */}
              <button
                onClick={this.handleCopyForAI}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
                title="Sao chép toàn bộ mã lỗi để gửi AI Studio sửa ngay lập tức"
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Đã chép mã lỗi!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>Copy Lỗi Cho AI Sửa</span>
                  </>
                )}
              </button>

              {/* Retry Button */}
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Thử Lại</span>
              </button>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
