import { useRef } from 'react';
import { avatarColor, initials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export function AvatarUpload({
  src,
  name,
  onFileSelect,
  buttonLabel = 'Upload photo',
  hint = 'JPG, PNG up to 2MB',
  accept = 'image/*',
  className,
}: {
  src?: string | null;
  name?: string;
  onFileSelect: (file: File) => void;
  buttonLabel?: string;
  hint?: string;
  accept?: string;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const trimmed = name?.trim() ?? '';
  const bg = trimmed ? avatarColor(trimmed) : '#c8c8c8';
  const glyph = trimmed ? initials(trimmed) : '?';

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-[18px] font-bold text-white"
        style={{ background: bg }}
      >
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span>{glyph}</span>}
      </div>
      <div className="flex flex-col gap-[5px]">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md bg-[#EEF2FF] px-3 py-[6px] text-[12px] font-medium text-apex-accent transition-colors hover:bg-[#dde5ff]"
        >
          {buttonLabel}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelect(f);
          }}
        />
        <div className="text-[11px] text-apex-faint">{hint}</div>
      </div>
    </div>
  );
}
