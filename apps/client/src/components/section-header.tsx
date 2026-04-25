export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <h2 className="text-[16px] font-semibold leading-tight tracking-tight text-apex-ink">
        {title}
      </h2>
      {description && (
        <p className="text-[12.5px] leading-relaxed text-apex-muted">{description}</p>
      )}
    </div>
  );
}
