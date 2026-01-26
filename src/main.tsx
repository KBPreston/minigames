import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './core/SettingsStore';
import { AppShell } from './app/AppShell';
import { Menu } from './app/routes/Menu';
import { GameRoute } from './app/routes/GameRoute';
import { LeaderboardRoute } from './app/routes/LeaderboardRoute';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/game/:id" element={<GameRoute />} />
          <Route path="/leaderboard/:id" element={<LeaderboardRoute />} />
        </Routes>
      </AppShell>
    </HashRouter>
  </SettingsProvider>
);
