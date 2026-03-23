import { createPortal } from 'react-dom';
import { icons } from '../icons/Icons.jsx';
import { formatTopicLabel, TOPIC_CREATE_TYPE } from '../lib/composer-mode.js';

const PATH_PATTERN = '[A-Za-z0-9_.\\/\\(\\)\\-]{1,99}';
const CONVERT_OPTIONS = [
  { value: 'none', label: 'auto type', icon: icons.sparkles },
  { value: 'md2html', label: 'md2html', icon: icons.fileCode },
  { value: 'qrcode', label: 'qrcode', icon: icons.qrcode },
  { value: 'html', label: 'html', icon: icons.fileBadge },
  { value: 'url', label: 'url', icon: icons.link },
  { value: 'text', label: 'text', icon: icons.text },
  { value: TOPIC_CREATE_TYPE, label: 'topic', icon: icons.folderTree, separated: true },
];

function getConvertMeta(value) {
  return CONVERT_OPTIONS.find((option) => option.value === value) || CONVERT_OPTIONS[0];
}

export function ComposerToolbar({
  canSubmit,
  busy,
  effectiveTtlPlaceholder,
  effectiveTtlSuffixVisible,
  file,
  form,
  isTopicMode,
  menuButtonRef,
  menuOpen,
  menuPanelRef,
  menuPosition,
  menuRef,
  onConvertSelect,
  onPathChange,
  onTopicBlur,
  onTopicChange,
  onTopicFocus,
  onTopicPointerDown,
  onTtlBlur,
  onTtlChange,
  onTtlFocus,
  pathInputVisible,
  pathPlaceholder,
  selectedTopicLabel,
  setMenuOpen,
  topicOpen,
  topicPrefix,
  topicRef,
  topics,
  ttlDisabled,
}) {
  const BusyIcon = icons.refresh;
  const CaretIcon = icons.chevronDown;
  const FileBadgeIcon = icons.fileBadge;
  const TtlIcon = icons.clock;
  const currentConvertMeta = getConvertMeta(form.convert);
  const CurrentConvertIcon = currentConvertMeta.icon;

  return (
    <div className="toolbar-grid">
      <div className="field-shell field-shell-fixed input input-bordered">
        <div
          aria-disabled={isTopicMode}
          className={`path-prefix-shell ${topicOpen ? 'path-prefix-shell-open' : ''} ${isTopicMode ? 'path-prefix-shell-disabled' : ''}`}
        >
          {topicPrefix ? (
            <span className="path-prefix-label" aria-hidden="true" title={topicPrefix}>
              <span className="path-prefix-label-text">{selectedTopicLabel}</span>
              <span className="path-prefix-label-slash">/</span>
            </span>
          ) : null}
          {isTopicMode ? null : (
            <select
              className="select path-prefix-select"
              onBlur={onTopicBlur}
              onChange={onTopicChange}
              onFocus={onTopicFocus}
              onPointerDown={onTopicPointerDown}
              ref={topicRef}
              value={form.topic}
            >
              <option value="">/</option>
              {topics.map((topic) => (
                <option key={topic.path} title={`${topic.path}/`} value={topic.path}>
                  {formatTopicLabel(topic.path)}
                </option>
              ))}
            </select>
          )}
        </div>
        {pathInputVisible ? (
          <input
            className="grow path-input"
            maxLength={99}
            onChange={(event) => onPathChange(event.target.value)}
            pattern={PATH_PATTERN}
            placeholder={pathPlaceholder}
            title="1-99 chars: a-z A-Z 0-9 - _ . / ( )"
            value={form.path}
          />
        ) : (
          <input
            aria-hidden="true"
            className="grow path-input path-input-disabled"
            disabled
            readOnly
            tabIndex={-1}
            value=""
          />
        )}
      </div>
      <div className="field-shell field-shell-fixed input input-bordered">
        <TtlIcon className="size-4 shrink-0 opacity-60" strokeWidth={2} />
        <input
          className="grow"
          disabled={ttlDisabled}
          inputMode="numeric"
          min={0}
          onBlur={onTtlBlur}
          onChange={(event) => onTtlChange(event.target.value)}
          onFocus={onTtlFocus}
          pattern="[0-9]*"
          placeholder={effectiveTtlPlaceholder}
          title="Leave empty to never expire"
          type="text"
          value={form.ttl}
        />
        {effectiveTtlSuffixVisible ? <span className="opacity-55">mins</span> : null}
      </div>
      {file ? (
        <div className="field-shell field-shell-fixed input input-bordered">
          <FileBadgeIcon className="size-4 opacity-60" strokeWidth={2} />
          <input disabled value="file" />
        </div>
      ) : (
        <div className={`select-shell ${menuOpen ? 'select-shell-open' : ''}`} ref={menuRef}>
          <CurrentConvertIcon className="select-shell-icon size-4 opacity-60" strokeWidth={2} />
          <CaretIcon className="select-shell-caret size-4" strokeWidth={2.2} />
          <button
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            className="select select-bordered select-shell-input select-shell-button"
            onClick={() => setMenuOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenuOpen(false);
              if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setMenuOpen(true);
              }
            }}
            ref={menuButtonRef}
            type="button"
          >
            <span>{currentConvertMeta.label}</span>
          </button>
          {menuOpen ? createPortal(
            <div
              className="select-menu"
              ref={menuPanelRef}
              role="listbox"
              style={{
                left: `${menuPosition?.left ?? -9999}px`,
                top: `${menuPosition?.top ?? -9999}px`,
                width: `${menuPosition?.width ?? menuButtonRef.current?.offsetWidth ?? 0}px`,
                visibility: menuPosition ? 'visible' : 'hidden',
              }}
            >
              {CONVERT_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                const isSelected = option.value === form.convert;
                return (
                  <div
                    className={option.separated ? 'select-menu-group select-menu-group-separated' : 'select-menu-group'}
                    key={option.value}
                  >
                    <button
                      aria-selected={isSelected}
                      className={`select-menu-item ${isSelected ? 'select-menu-item-active' : ''}`}
                      onClick={() => onConvertSelect(option.value)}
                      role="option"
                      type="button"
                    >
                      <span className="select-menu-item-check" aria-hidden="true">
                        {isSelected ? <icons.check className="size-4" strokeWidth={2.3} /> : null}
                      </span>
                      <OptionIcon className="size-4 select-menu-item-icon" strokeWidth={2} />
                      <span>{option.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          ) : null}
        </div>
      )}
      <button
        className={`btn field-shell field-action field-action-button h-12 min-h-12 self-end rounded-[1.2rem] px-4 ${canSubmit ? 'field-action-active' : 'field-action-inactive'}`}
        disabled={!canSubmit}
        type="submit"
      >
        {busy ? <BusyIcon className="size-4 animate-spin" strokeWidth={2.2} /> : <icons.send className="size-4" strokeWidth={2.2} />}
        <span>Post</span>
      </button>
    </div>
  );
}
