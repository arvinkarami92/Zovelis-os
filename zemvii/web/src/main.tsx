import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setTransport } from './api/client.ts';
import { httpTransport } from './api/transport.ts';
import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (__DEMO__) {
    root.render(
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" />
        <span>Building the demo world…</span>
      </div>,
    );
    const { createDemoTransport } = await import('./api/demo.ts');
    setTransport(await createDemoTransport());
  } else {
    setTransport(httpTransport());
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
