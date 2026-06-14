import { icons } from '../icons/Icons.jsx';

export function LoadingView() {
  const LoadingIcon = icons.refresh;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingIcon className="size-8 animate-spin text-primary" strokeWidth={2.2} />
    </div>
  );
}
