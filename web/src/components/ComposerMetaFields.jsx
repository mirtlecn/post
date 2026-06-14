import { icons } from '../icons/Icons.jsx';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.jsx';

export function ComposerMetaFields({
  createdDateRef,
  createdTimeRef,
  createdDateValue,
  createdTimeValue,
  metaVisible,
  onCreatedDateChange,
  onCreatedTimeChange,
  onOpenCreatedPicker,
  onToggleMeta,
  onTitleChange,
  showMetaToggle,
  titleValue,
}) {
  const TitleIcon = icons.title;
  const TitleCollapseIcon = icons.titleCollapse;

  return (
    <>
      <div className={`composer-meta-row ${metaVisible ? 'composer-meta-row-open' : ''} ${showMetaToggle ? '' : 'composer-meta-row-hidden'}`}>
        {metaVisible ? (
          <>
            <div className="composer-meta-field composer-meta-field-title">
              <span className="composer-meta-label">Title:</span>
              <Input
                className="composer-meta-inline-input"
                maxLength={120}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder=""
                value={titleValue}
              />
            </div>
            <div className="composer-meta-field composer-meta-field-created" onClick={onOpenCreatedPicker}>
              <span className="composer-meta-label">Created:</span>
              <div className={`composer-created-inputs ${createdDateValue ? '' : 'composer-created-inputs-empty'}`}>
                <Input
                  className="composer-created-input composer-created-date"
                  onChange={(event) => onCreatedDateChange(event.target.value)}
                  ref={createdDateRef}
                  type="date"
                  value={createdDateValue}
                />
                {createdDateValue ? (
                  <Input
                    className="composer-created-input composer-created-time"
                    onChange={(event) => onCreatedTimeChange(event.target.value)}
                    ref={createdTimeRef}
                    step={60}
                    type="time"
                    value={createdTimeValue}
                  />
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
      {showMetaToggle ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className={`composer-meta-tooltip composer-meta-icon ${metaVisible ? 'composer-meta-icon-open' : ''}`}
              onClick={onToggleMeta}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              {metaVisible ? (
                <TitleCollapseIcon className="size-[0.95rem]" strokeWidth={1.9} />
              ) : (
                <TitleIcon className="size-[0.95rem]" strokeWidth={1.9} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{metaVisible ? 'Hide' : 'Add meta info'}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}
