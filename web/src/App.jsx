import { LoadingView } from './components/LoadingView.jsx';
import { LoginView } from './components/LoginView.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { TooltipProvider } from './components/ui/tooltip.jsx';
import { useSession } from './hooks/useSession.js';
import { useThemeMode } from './hooks/useThemeMode.js';

export default function App() {
  const session = useSession();
  useThemeMode();

  return (
    <TooltipProvider>
      <div className="app-shell">
        {session.booting ? (
          <LoadingView />
        ) : session.authenticated ? (
          <Dashboard onLogout={session.logout} />
        ) : (
          <LoginView
            error={session.error}
            isBusy={session.isBusy}
            onChange={session.setPassword}
            onSubmit={session.login}
            password={session.password}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
