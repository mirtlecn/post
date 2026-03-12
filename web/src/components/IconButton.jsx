export function IconButton({ icon, title, className = '', iconClassName = '', tooltip = 'bottom', ...props }) {
  const Icon = icon;
  const tooltipClassMap = {
    top: 'tooltip-top',
    bottom: 'tooltip-bottom',
    left: 'tooltip-left',
    right: 'tooltip-right',
  };
  const tooltipClass = tooltipClassMap[tooltip] || 'tooltip-bottom';
  return (
    <div className={`tooltip ${tooltipClass} tooltip-layer`} data-tip={title}>
      <button className={`btn btn-circle btn-md icon-button ${className}`.trim()} type="button" {...props}>
        <Icon className={`size-5 ${iconClassName}`.trim()} strokeWidth={2.1} />
      </button>
    </div>
  );
}
