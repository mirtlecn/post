import { Fragment } from 'react';
import { icons } from '../icons/Icons.jsx';
import { formatTopicLabel, TOPIC_CREATE_TYPE } from '../lib/composer-mode.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/button.jsx';
import { Input } from './ui/input.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './ui/select.jsx';

const PATH_PATTERN = '[A-Za-z0-9_.\\/\\(\\)\\-]{1,99}';
const ROOT_TOPIC_VALUE = '__root__';
const CONVERT_OPTIONS = [
  { value: 'none', label: 'auto type', icon: icons.sparkles },
  { value: 'md2html', label: 'md2html', icon: icons.textInitial },
  { value: 'qrcode', label: 'qrcode', icon: icons.qrcode },
  { value: 'html', label: 'html', icon: icons.globe },
  { value: 'url', label: 'url', icon: icons.link },
  { value: 'text', label: 'text', icon: icons.text },
  { value: TOPIC_CREATE_TYPE, label: 'topic', icon: icons.folderTree, separated: true },
];

function getTopicValue(value) {
  return value || ROOT_TOPIC_VALUE;
}

function normalizeTopicValue(value) {
  return value === ROOT_TOPIC_VALUE ? '' : value;
}

export function ComposerToolbar({
  canSubmit,
  busy,
  effectiveTtlPlaceholder,
  effectiveTtlSuffixVisible,
  fileMode,
  form,
  isTopicMode,
  onConvertSelect,
  onPathChange,
  onPathBlur,
  pathLocked,
  onTopicChange,
  onTopicOpenChange,
  onTtlBlur,
  onTtlChange,
  onTtlFocus,
  pathInputVisible,
  pathPlaceholder,
  topicOpen,
  topics,
  ttlDisabled,
}) {
  const BusyIcon = icons.refresh;
  const FileTypeIcon = icons.fileType;
  const TtlIcon = icons.clock;
  const topicControlLocked = isTopicMode || pathLocked;
  const topicLabel = formatTopicLabel(form.topic);

  return (
    <div className="toolbar-grid">
      <div className="field-shell field-shell-fixed">
        <Select
          disabled={topicControlLocked}
          onOpenChange={onTopicOpenChange}
          onValueChange={(value) => onTopicChange(normalizeTopicValue(value))}
          value={getTopicValue(form.topic)}
        >
          <SelectTrigger
            aria-label="Topic"
            className={cn(
              'path-prefix-select-trigger',
              form.topic && 'path-prefix-select-trigger-topic',
              topicOpen && !topicControlLocked && 'path-prefix-select-trigger-open',
            )}
            title={topicLabel}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            <SelectItem value={ROOT_TOPIC_VALUE}>/</SelectItem>
            {topics.map((topic) => (
              <SelectItem key={topic.path} value={topic.path}>
                {formatTopicLabel(topic.path)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pathInputVisible ? (
          <Input
            className="field-input path-input"
            disabled={pathLocked}
            maxLength={99}
            onBlur={onPathBlur}
            onChange={(event) => onPathChange(event.target.value)}
            pattern={PATH_PATTERN}
            placeholder={pathPlaceholder}
            readOnly={pathLocked}
            title="1-99 chars: a-z A-Z 0-9 - _ . / ( )"
            value={form.path}
          />
        ) : (
          <Input
            aria-hidden="true"
            className="field-input path-input path-input-disabled"
            disabled
            readOnly
            tabIndex={-1}
            value=""
          />
        )}
      </div>
      <div className="field-shell field-shell-fixed">
        <TtlIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <Input
          className="field-input"
          disabled={ttlDisabled}
          inputMode="text"
          min={0}
          onBlur={onTtlBlur}
          onChange={(event) => onTtlChange(event.target.value)}
          onFocus={onTtlFocus}
          pattern="[0-9*]*"
          placeholder={effectiveTtlPlaceholder}
          title="Use minutes or multiplication, e.g. 60*24. Leave empty to never expire"
          type="text"
          value={form.ttl}
        />
        {effectiveTtlSuffixVisible ? <span className="text-muted-foreground">mins</span> : null}
      </div>
      {fileMode ? (
        <div className="field-shell field-shell-fixed">
          <FileTypeIcon className="size-4 text-muted-foreground" strokeWidth={2} />
          <Input className="field-input" disabled readOnly value="file" />
        </div>
      ) : (
        <Select onValueChange={onConvertSelect} value={form.convert}>
          <SelectTrigger className="field-select-trigger field-shell-fixed" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" position="popper">
            {CONVERT_OPTIONS.map((option) => {
              const OptionIcon = option.icon;
              return (
                <Fragment key={option.value}>
                  {option.separated ? <SelectSeparator /> : null}
                  <SelectItem value={option.value}>
                    <span className="flex min-w-0 items-center gap-2">
                      <OptionIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                      <span className="truncate">{option.label}</span>
                    </span>
                  </SelectItem>
                </Fragment>
              );
            })}
          </SelectContent>
        </Select>
      )}
      <Button
        className="field-action h-[3.3rem] w-full self-end"
        disabled={!canSubmit}
        size="lg"
        type="submit"
        variant={canSubmit ? 'default' : 'secondary'}
      >
        {busy ? <BusyIcon className="size-4 animate-spin" strokeWidth={2.2} /> : <icons.send className="size-4" strokeWidth={2.2} />}
        <span>Post</span>
      </Button>
    </div>
  );
}
