import { icons } from '../icons/Icons.jsx';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';

export function LoginView({ password, onChange, onSubmit, isBusy, error }) {
  const LoadingIcon = icons.refresh;
  const SendIcon = icons.send;

  return (
    <section className="grid min-h-screen place-items-center px-5 py-8">
      <div className="grid w-full max-w-md gap-8">
        <header className="grid gap-2">
          <h1 className="text-6xl font-black leading-none tracking-normal text-foreground sm:text-7xl">Post</h1>
          <p className="max-w-sm text-base leading-7 text-muted-foreground">Lightweight file, text &amp; URL sharing service</p>
          <div className="h-1.5 w-20 rounded-full bg-primary" />
        </header>

        <form className="grid gap-2" onSubmit={onSubmit}>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-input/20 p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
            <Input
              aria-invalid={Boolean(error)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className="h-10 border-0 bg-transparent px-2 text-base shadow-none focus-visible:ring-0"
              inputMode="text"
              onChange={(event) => onChange(event.target.value)}
              placeholder="Enter password"
              spellCheck={false}
              type="password"
              value={password}
            />
            <Button disabled={isBusy || !password.trim()} size="icon-lg" type="submit">
              {isBusy ? <LoadingIcon className="size-4 animate-spin" strokeWidth={2.2} /> : <SendIcon className="size-4" strokeWidth={2.2} />}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>

        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© Mirtle</span>
          <Button asChild className="h-auto px-0 text-xs" variant="link">
            <a href="https://github.com/mirtlecn/post" rel="noreferrer" target="_blank">Source code</a>
          </Button>
        </footer>
      </div>
    </section>
  );
}
