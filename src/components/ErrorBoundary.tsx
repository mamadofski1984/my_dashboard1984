import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  sectionName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'خطای غیرمنتظره در پردازش این بخش'
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Error in ${this.props.sectionName || 'Component'}:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl mx-auto my-8 p-6 rounded-2xl border-2 border-rose-500/40 bg-rose-950/20 text-right" dir="rtl">
          <div className="flex items-center gap-3 text-rose-400 mb-3">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h3 className="text-base font-bold">
              خطا در نمایش بخش «{this.props.sectionName || 'تحلیلی'}»
            </h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            این بخش با یک خطای محاسباتی یا ساختاری مواجه شد، اما سایر بخش‌های داشبورد کاملاً فعال هستند. جزئیات فنی:
            <span className="block mt-1.5 p-2 rounded bg-slate-950/70 font-mono text-[11px] text-rose-300" dir="ltr">
              {this.state.errorMessage}
            </span>
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>تلاش مجدد برای بارگذاری این بخش</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}