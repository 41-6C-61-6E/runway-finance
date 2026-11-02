# Runway Finance — UI Primitives Catalog

Directory: `components/ui/`

Use existing primitives instead of reimplementing custom variants.

| Primitive | Path | Key Props | Description & Example Usage |
|---|---|---|---|
| `ActionButton` | `components/ui/action-button.tsx` | `variant`, `size`, `loading`, `icon` | Primary button with integrated loading spinner and icon slots. |
| `ModalBackdrop` | `components/ui/modal-overlay.tsx` | `isOpen`, `onClose`, `children` | Accessible backdrop overlay with focus trapping and ESC key listener. |
| `ClickOutsideBackdrop`| `components/ui/modal-overlay.tsx` | `onClickOutside`, `children` | Overlay container for custom floating panels and dropdown menus. |
| `Spinner` | `components/ui/spinner.tsx` | `size`, `className` | Standard animated SVG spinner conforming to theme tokens. |
| `ConfirmDeleteDialog`| `components/ui/confirm-delete-dialog.tsx`| `isOpen`, `title`, `description`, `onConfirm`, `onCancel` | Accessible modal dialog for destructive deletion confirmations. |
| `Dialog` | `components/ui/dialog.tsx` | `DialogContent`, `DialogHeader`, `DialogFooter` | Radix-based accessible modal dialog. |
| `Sheet` | `components/ui/sheet.tsx` | `SheetContent`, `side`, `isOpen` | Slide-out side drawer for detail panels and deep forms. |
| `Popover` | `components/ui/popover.tsx` | `PopoverTrigger`, `PopoverContent` | Floating contextual popup menu anchored to an element. |
| `SortableHeader` | `components/ui/sortable-header.tsx` | `column`, `label`, `align` | Table header cell with sort direction indicators. |
| `EmptyState` | `components/ui/empty-state.tsx` | `icon`, `title`, `description`, `action` | Standard placeholder for empty lists, search results, or tables. |
| `HeaderDropdown` | `components/ui/header-dropdown.tsx` | `items`, `trigger`, `onSelect` | Consistent header navigation and action dropdown. |

