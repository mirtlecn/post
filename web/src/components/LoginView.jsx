import { icons } from '../icons/Icons.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent } from './ui/card.jsx';
import { Input } from './ui/input.jsx';

export function LoginView({ password, onChange, onSubmit, isBusy, error }) {
  const LoadingIcon = icons.refresh;
  const SendIcon = icons.send;

  return (
    <section className="login-wrap">
      <div className="login-frame">
        <Card className="login-card animate-fade-up">
          <CardContent className="login-grid">
            <div className="login-brand">
              <div className="login-badge" />
              <h1 className="login-title">Post</h1>
              <p className="login-subtitle">Lightweight file, text &amp; URL sharing service</p>
            </div>
            <form className={error ? 'animate-shake-soft' : ''} onSubmit={onSubmit}>
              <div className={`login-input ${error ? 'login-input-error' : ''}`}>
                <Input
                  aria-invalid={Boolean(error)}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  className="masked-input h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                  inputMode="text"
                  onChange={(event) => onChange(event.target.value)}
                  placeholder="Enter password"
                  spellCheck={false}
                  type="password"
                  value={password}
                />
                <Button className="login-submit" disabled={isBusy || !password.trim()} size="icon-lg">
                  {isBusy ? <LoadingIcon className="size-4 animate-spin" strokeWidth={2.2} /> : <SendIcon className="size-4" strokeWidth={2.2} />}
                </Button>
              </div>
              {error ? <p className="login-error-message">{error}</p> : null}
            </form>
          </CardContent>
          <div className="login-corner-meta">
            <span>© Mirtle</span>
            <span className="app-footer-sep">|</span>
            <a href="https://github.com/mirtlecn/post" rel="noreferrer" target="_blank">Source code</a>
          </div>
        </Card>
      </div>
    </section>
  );
}
