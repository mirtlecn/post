import { icons } from '../icons/Icons.jsx';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './ui/alert.jsx';
import { Button } from './ui/button.jsx';

const toastTone = {
  error: {
    icon: icons.alert,
    title: 'Action failed',
    variant: 'destructive',
  },
  success: {
    icon: icons.check,
    title: 'Done',
    variant: 'default',
  },
};

const successDescriptions = {
  Copied: 'The link has been copied to your clipboard.',
  Created: 'The item was created and the list has been refreshed.',
  Deleted: 'The item was deleted from the list.',
  Updated: 'The item was updated and the list has been refreshed.',
  Uploaded: 'The file was uploaded and the list has been refreshed.',
};

export function ToastLayer({ toast, onClose }) {
  if (!toast) return null;
  const CloseIcon = icons.close;
  const tone = toastTone[toast.kind] || toastTone.success;
  const StatusIcon = tone.icon;
  const description = toast.kind === 'error'
    ? toast.message
    : successDescriptions[toast.message] || 'The action completed successfully.';

  return (
    <div className="fixed right-4 top-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
      <Alert variant={tone.variant}>
        <StatusIcon />
        <AlertTitle>{tone.title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        <AlertAction>
          <Button aria-label="Close" onClick={onClose} size="icon-xs" type="button" variant="ghost">
            <CloseIcon className="size-3" strokeWidth={2.2} />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
