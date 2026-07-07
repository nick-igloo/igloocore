import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { uploadTurnoverPhoto, getPhotoUrl } from '../lib/turnover';

interface Props {
  folder: 'issues' | 'tasks';
  paths: string[];
  onChange: (paths: string[]) => void;
  max?: number;
  label?: string;
}

export function PhotoPicker({ folder, paths, onChange, max = 4, label = 'Add photo' }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const p = await uploadTurnoverPhoto(file, folder);
      onChange([...paths, p]);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (p: string) => onChange(paths.filter((x) => x !== p));

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {paths.map((p) => (
          <div key={p} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
            <img src={getPhotoUrl(p)} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
              aria-label="Remove photo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {paths.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-500 hover:border-teal-400 hover:text-teal-600 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
