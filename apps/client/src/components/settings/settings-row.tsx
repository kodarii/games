type SettingsRowProps = {
  label: React.ReactNode;
  desc?: React.ReactNode;
  /** Right-aligned control slot (button, select, read-only value box, status text). */
  children: React.ReactNode;
};

/**
 * Row with hairline divider that auto-suppresses on the last row via `last:border-b-0`.
 * MUST be a direct child of `SettingsCard`'s body — `last:` resolves against immediate
 * DOM siblings.
 */
export function SettingsRow({ label, desc, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-apex-line-4 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-apex-ink">{label}</div>
        {desc && <div className="mt-0.5 text-[12px] text-apex-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
