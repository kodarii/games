import { cn } from '@/lib/utils';
import { useRef } from 'react';
import { Avatar, type AvatarShape } from './avatar';

export function AvatarUpload({
  src,
  name,
  shape = 'circle',
  size = 56,
  onFileSelect,
  buttonLabel = 'Upload photo',
  hint = 'JPG, PNG up to 2MB',
  accept = 'image/*',
  className,
}: {
  src?: string | null;
  name?: string;
  shape?: AvatarShape;
  size?: number;
  onFileSelect: (file: File) => void;
  buttonLabel?: string;
  hint?: string;
  accept?: string;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Avatar shape={shape} size={size} src={src} name={name} />
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
