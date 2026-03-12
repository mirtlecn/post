import { LoadingView } from './components/LoadingView.jsx';
import { LoginView } from './components/LoginView.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { useSession } from './hooks/useSession.js';

export default function App() {
  const session = useSession();

  return (
    <div className="app-shell">
      {session.booting ? (
        <LoadingView />
      ) : session.token ? (
        <Dashboard onLogout={session.logout} token={session.token} />
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
  );
}
