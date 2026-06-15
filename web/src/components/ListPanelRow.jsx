import { useState } from 'react';
import { icons } from '../icons/Icons.jsx';
import { getItemTypeIconKey } from '../lib/list-panel.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.jsx';
import { Button } from './ui/button.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.jsx';
import { TableCell, TableRow } from './ui/table.jsx';

export function ListPanelRow({
  copiedPath,
  deletingPath,
  item,
  onCopyLink,
  onDeleteItem,
  onEdit,
  onOpenLink,
  pathColumnClassName,
  previewColumnClassName,
  typeLabel,
  metaColumnClassName,
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const TypeIcon = icons[getItemTypeIconKey(item.type)];
  const MoreIcon = icons.more;
  const EditIcon = icons.edit;
  const OpenIcon = icons.open;
  const CopyIcon = copiedPath === item.path ? icons.check : icons.copy;
  const DeleteIcon = deletingPath === item.path ? icons.refresh : icons.delete;

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
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={`Actions for ${item.path}`} className="ml-auto flex" size="icon" type="button" variant="ghost">
                <MoreIcon className="size-4" strokeWidth={2.1} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onEdit(item)}>
                  <EditIcon />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenLink(item.surl)}>
                  <OpenIcon />
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem disabled={copiedPath === item.path} onSelect={() => onCopyLink(item.path, item.surl)}>
                  <CopyIcon />
                  {copiedPath === item.path ? 'Copied' : 'Copy'}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={Boolean(deletingPath)} onSelect={() => setDeleteDialogOpen(true)} variant="destructive">
                  <DeleteIcon className={deletingPath === item.path ? 'animate-spin' : ''} />
                  {deletingPath === item.path ? 'Deleting...' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this item?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes {item.path} and disables its public link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDeleteItem(item.path)} variant="destructive">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
