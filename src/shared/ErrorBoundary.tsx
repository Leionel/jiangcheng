import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * 错误边界：任何未捕获的渲染错误都不应该白屏。
 * P0 没有错误边界，P1 补上，保证「演示中最坏也只是看到一张说明页」。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 本地原型不上报，只留在控制台便于排查
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app">
        <div className="grain" aria-hidden="true" />
        <main className="sheet" style={{ padding: 'clamp(24px, 5vw, 48px)' }}>
          <p className="eyebrow">观测中断 · PAGE FAULT</p>
          <h1 className="h2">这一页把墨水打翻了</h1>
          <p className="lede">
            界面出现了一个未处理的错误。你的图鉴保存在本机浏览器里，不会因此丢失。
          </p>
          <p className="fineprint" style={{ marginTop: 12 }}>
            错误信息：{this.state.error.message || '未知错误'}
          </p>
          <div className="reveal-actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                window.location.reload();
              }}
            >
              重新加载
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                this.setState({ error: null });
              }}
            >
              返回上一页
            </button>
          </div>
        </main>
      </div>
    );
  }
}
