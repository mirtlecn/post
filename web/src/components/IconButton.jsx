import { Button } from './ui/button.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.jsx';

export function IconButton({ icon, title, className = '', iconClassName = '', tooltip = 'bottom', ...props }) {
  const Icon = icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button className={className} size="icon-lg" title={title} type="button" variant="outline" {...props}>
          <Icon className={`size-4 ${iconClassName}`.trim()} strokeWidth={2.1} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltip}>
        {title}
      </TooltipContent>
    </Tooltip>
  );
}
