import { icons } from '../icons/Icons.jsx';
import { Alert, AlertAction, AlertDescription } from './ui/alert.jsx';
import { Button } from './ui/button.jsx';

export function ToastLayer({ toast, onClose }) {
  if (!toast) return null;
  const CloseIcon = icons.close;
  const isError = toast.kind === 'error';

  return (
    <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
      <Alert className={isError ? '' : 'border-primary/35 bg-primary/10 text-primary'} variant={isError ? 'destructive' : 'default'}>
        <AlertDescription className={isError ? '' : 'text-primary'}>
          {toast.message}
        </AlertDescription>
        <AlertAction>
          <Button aria-label="Close" onClick={onClose} size="icon-xs" type="button" variant="ghost">
            <CloseIcon className="size-3" strokeWidth={2.2} />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
