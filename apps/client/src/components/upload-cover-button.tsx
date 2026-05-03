import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMyPermissions, useUploadCoverMutation } from '@/lib/queries';

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function UploadCoverButton({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const { data: perms } = useMyPermissions();
  const uploadMutation = useUploadCoverMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  if (!perms?.canUploadCovers) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const result = await uploadMutation.mutateAsync(file);
      onChange(result.url);
    } catch (err: any) {
      if (err?.status === 400) {
        setError('Only JPEG/PNG/WebP under 5MB');
      } else {
        setError('Upload failed, try again');
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload cover'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
