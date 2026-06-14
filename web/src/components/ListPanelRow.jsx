import { icons } from '../icons/Icons.jsx';
import { IconButton } from './IconButton.jsx';
import { TableCell, TableRow } from './ui/table.jsx';

function getTypeIcon(typeLabel) {
  switch (typeLabel) {
    case 'file':
      return icons.fileBadge;
    case 'html':
      return icons.fileCode;
    case 'topic':
      return icons.folderTree;
    case 'url':
      return icons.link;
    case 'text':
    default:
      return icons.text;
  }
}

export function ListPanelRow({
  actionTooltip,
  confirmPath,
  copiedPath,
  deletingPath,
  item,
  onConfirmDelete,
  onCopyLink,
  onEdit,
  onOpenLink,
  pathColumnClassName,
  previewColumnClassName,
  typeLabel,
  metaColumnClassName,
}) {
  const TypeIcon = getTypeIcon(typeLabel);

  return (
    <TableRow>
      <TableCell className={pathColumnClassName}>
        <span className="block truncate font-medium" title={item.path}>{item.path}</span>
        {item.title ? (
          <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground" title={`${item.title} · ${typeLabel}`}>
            <TypeIcon className="size-3 shrink-0 opacity-55" strokeWidth={2} />
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 text-muted-foreground/70">·</span>
            <span className="shrink-0 lowercase text-muted-foreground/80">{typeLabel}</span>
          </span>
        ) : (
          <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground lowercase" title={typeLabel}>
            <TypeIcon className="size-3 shrink-0 opacity-55" strokeWidth={2} />
            <span className="truncate">{typeLabel}</span>
          </span>
        )}
      </TableCell>
      <TableCell className={metaColumnClassName}>
        <span className="block truncate text-sm text-foreground/80" title={item.created || ''}>
          {item.createdText || 'unknown'}
        </span>
        <span className="mt-1 block truncate text-xs text-muted-foreground" title={item.ttlText}>
          {item.ttlText === 'never' ? 'never expires' : `TTL ${item.ttlText}`}
        </span>
      </TableCell>
      <TableCell className={previewColumnClassName} title={item.content}>{item.content}</TableCell>
      <TableCell className="overflow-visible">
        <div className="flex justify-end gap-1.5 overflow-visible">
          <IconButton icon={icons.edit} onClick={() => onEdit(item)} title="Edit" tooltip={actionTooltip} />
          <IconButton icon={icons.open} onClick={() => onOpenLink(item.surl)} title="Open" tooltip={actionTooltip} />
          <IconButton
            className={copiedPath === item.path ? 'text-primary' : ''}
            disabled={copiedPath === item.path}
            icon={copiedPath === item.path ? icons.check : icons.copy}
            onClick={() => onCopyLink(item.path, item.surl)}
            title={copiedPath === item.path ? 'Copied' : 'Copy'}
            tooltip={actionTooltip}
          />
          {deletingPath === item.path ? (
            <IconButton className="text-destructive opacity-80" disabled icon={icons.refresh} iconClassName="animate-spin" title="Deleting..." tooltip={actionTooltip} />
          ) : (
            <IconButton
              className="text-destructive hover:bg-destructive/10"
              data-delete-btn="true"
              data-path={item.path}
              icon={confirmPath === item.path ? icons.check : icons.delete}
              onClick={() => onConfirmDelete(item.path)}
              title={confirmPath === item.path ? 'Delete?' : 'Delete'}
              tooltip={actionTooltip}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
