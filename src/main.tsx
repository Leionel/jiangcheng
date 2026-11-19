import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { V2App } from './v2/V2App';
import { ErrorBoundary } from './shared/ErrorBoundary';
import './styles/base.css';
import './styles/game.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

const useV2 = new URLSearchParams(window.location.search).has('v2');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {useV2 ? <V2App /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
