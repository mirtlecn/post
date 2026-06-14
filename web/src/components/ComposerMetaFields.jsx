import { icons } from '../icons/Icons.jsx';
import { Button } from './ui/button.jsx';
import { Calendar } from './ui/calendar.jsx';
import { Card, CardContent, CardFooter } from './ui/card.jsx';
import { Field, FieldGroup, FieldLabel } from './ui/field.jsx';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group.jsx';
import { Input } from './ui/input.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.jsx';

const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const createdDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function parseDateValue(value) {
  const match = DATE_VALUE_PATTERN.exec(value || '');
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function formatDateValue(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ComposerMetaFields({
  createdDateValue,
  createdTimeValue,
  metaVisible,
  onCreatedDateChange,
  onCreatedTimeChange,
  onToggleMeta,
  onTitleChange,
  showMetaToggle,
  titleValue,
}) {
  const TitleIcon = icons.title;
  const TitleCollapseIcon = icons.titleCollapse;
  const ClockIcon = icons.clock;
  const selectedDate = parseDateValue(createdDateValue);
  const createdLabel = selectedDate
    ? `${createdDateFormatter.format(selectedDate)}${createdTimeValue ? ` ${createdTimeValue}` : ''}`
    : 'Set created';

  function selectCreatedDate(date) {
    onCreatedDateChange(date ? formatDateValue(date) : '');
  }

  function clearCreatedValue() {
    onCreatedDateChange('');
  }

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
            <div className="composer-meta-field">
              <span className="composer-meta-label">Created:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className="h-8 min-w-40 justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
                    data-empty={!selectedDate}
                    title={selectedDate ? createdLabel : 'Set created date'}
                    type="button"
                    variant="outline"
                  >
                    <ClockIcon className="size-3.5 text-muted-foreground" strokeWidth={2} />
                    <span className="truncate">{createdLabel}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Card className="w-fit border-0 py-0 shadow-none ring-0" size="sm">
                    <CardContent className="p-3">
                      <Calendar
                        captionLayout="dropdown"
                        className="p-0"
                        mode="single"
                        onSelect={selectCreatedDate}
                        selected={selectedDate}
                      />
                    </CardContent>
                    <CardFooter className="border-t bg-card">
                      <FieldGroup className="gap-3">
                        <Field>
                          <FieldLabel htmlFor="created-time">Time</FieldLabel>
                          <InputGroup data-disabled={!selectedDate}>
                            <InputGroupInput
                              className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                              disabled={!selectedDate}
                              id="created-time"
                              onChange={(event) => onCreatedTimeChange(event.target.value)}
                              step={60}
                              type="time"
                              value={createdTimeValue}
                            />
                            <InputGroupAddon align="inline-end">
                              <ClockIcon className="text-muted-foreground" />
                            </InputGroupAddon>
                          </InputGroup>
                        </Field>
                        <Button
                          disabled={!selectedDate && !createdTimeValue}
                          onClick={clearCreatedValue}
                          type="button"
                          variant="ghost"
                        >
                          Clear
                        </Button>
                      </FieldGroup>
                    </CardFooter>
                  </Card>
                </PopoverContent>
              </Popover>
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
