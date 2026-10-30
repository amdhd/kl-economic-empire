// Phase 2 entry: mounts the standalone market harness. When merged with the Phase 1 shell, mount
// that shell here and render MarketBrowser / SecurityDetail inside its Markets panel instead.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Phase2App } from './phase2/Phase2App';
import './phase2/phase2.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Phase2App />
  </StrictMode>,
);
