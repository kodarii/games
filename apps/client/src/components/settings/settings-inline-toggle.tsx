type SettingsInlineToggleProps = {
  open: boolean;
  id?: string;
  children: React.ReactNode;
};

/**
 * Pure-CSS animated disclosure. Animates `grid-template-rows: 0fr → 1fr` so the
 * body grows to its intrinsic auto-height without JS measurement or max-height
 * magic numbers. Mirrors v6 `ToggleBlock`.
 */
export function SettingsInlineToggle({ open, id, children }: SettingsInlineToggleProps) {
  return (
    <div
      id={id}
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
