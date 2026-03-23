import { icons } from '../icons/Icons.jsx';

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
              <input
                className="input input-ghost composer-meta-inline-input"
                maxLength={120}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder=""
                value={titleValue}
              />
            </div>
            <div className="composer-meta-field composer-meta-field-created" onClick={onOpenCreatedPicker}>
              <span className="composer-meta-label">Created:</span>
              <div className={`composer-created-inputs ${createdDateValue ? '' : 'composer-created-inputs-empty'}`}>
                <input
                  className="input input-ghost composer-created-input composer-created-date"
                  onChange={(event) => onCreatedDateChange(event.target.value)}
                  ref={createdDateRef}
                  type="date"
                  value={createdDateValue}
                />
                {createdDateValue ? (
                  <input
                    className="input input-ghost composer-created-input composer-created-time"
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
        <div className="tooltip tooltip-left tooltip-layer composer-meta-tooltip" data-tip={metaVisible ? 'Hide' : 'Add meta info'}>
          <button
            className={`btn btn-ghost btn-xs composer-meta-icon ${metaVisible ? 'composer-meta-icon-open' : ''}`}
            onClick={onToggleMeta}
            type="button"
          >
            {metaVisible ? (
              <TitleCollapseIcon className="size-[0.95rem]" strokeWidth={1.9} />
            ) : (
              <TitleIcon className="size-[0.95rem]" strokeWidth={1.9} />
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}
