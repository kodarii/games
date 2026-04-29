import { useState } from 'react';
import { exportData } from '@/lib/api';

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setIsExporting(true);
    setError(null);
    try {
      const { blob, filename } = await exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Failed to export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  return { isExporting, error, trigger };
}
