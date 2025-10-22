import { TrashIcon } from 'lucide-react';
import { type RefCallback, type RefObject } from 'react';

type Props = {
  currentImage?: string | null;
  onChange: (image?: File | null) => void;
  onImagePreview: (imageUrl: string | null) => void;
  onRemoveImage?: () => void | Promise<void>;
  placeholder?: string;
  ref?: RefObject<HTMLInputElement> | RefCallback<HTMLInputElement>;
  name: string;
};

export function ImageInput({
  ref,
  name,
  currentImage,
  onChange,
  onImagePreview,
  onRemoveImage,
  placeholder = 'Add an image',
}: Props) {
  if (currentImage && currentImage !== '') {
    return (
      <div className="group relative size-24 overflow-hidden rounded-full">
        <img
          alt="Preview"
          className="h-full w-full object-cover transition-opacity group-hover:opacity-25"
          src={currentImage}
        />
        <button
          className="absolute top-0 right-0 bottom-0 left-0 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-red-600 opacity-0 group-hover:opacity-100 hover:cursor-pointer"
          onClick={() => {
            URL.revokeObjectURL(currentImage);
            onImagePreview(null);
            onChange(null);
            onRemoveImage?.();
          }}
          type="button"
        >
          <TrashIcon size={16} />
          Remove
        </button>
      </div>
    );
  }
  return (
    <label className="flex size-24 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed border-zinc-200 p-4 hover:border-zinc-400">
      <span className="text-center text-xs text-gray-500">{placeholder}</span>
      <input
        ref={ref}
        accept="image/*"
        className="hidden"
        name={name}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onImagePreview(URL.createObjectURL(file));
            onChange(file);
          }
        }}
        type="file"
      />
    </label>
  );
}
