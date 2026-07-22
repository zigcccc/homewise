import { useState } from 'react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ImageInput,
  Separator,
} from '@homewise/ui/core';

/**
 * The pet avatars this client offers, keyed by animal type. The client owns the set — the server
 * never lists or bundles them; it only stores whichever one the user picks. Each name maps to
 * `public/avatars/avatar-pet-<type>.svg`.
 */
const AVATARS = ['dog', 'cat', 'turtle', 'hamster', 'horse', 'parrot'] as const;

const avatarSrc = (name: string) => `/avatars/avatar-pet-${name}.svg`;

/** Loads a bundled avatar SVG as a `File`, so it can be uploaded like any other picture. */
async function avatarFile(name: string) {
  const blob = await fetch(avatarSrc(name)).then((res) => res.blob());
  return new File([blob], `avatar-pet-${name}.svg`, { type: 'image/svg+xml' });
}

/**
 * The pet's profile picture, editable via a dialog: upload a photo or pick one of the bundled
 * avatars. Purely presentational — the General form owns the values and decides what to persist.
 */
export function ProfilePictureField({
  currentImage,
  displayName,
  onSelectAvatar,
  onUploadFile,
  onRemove,
}: {
  currentImage?: string | null;
  displayName: string;
  onSelectAvatar: (file: File, previewSrc: string) => void;
  onUploadFile: (file: File) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handlePickAvatar = async (name: string) => {
    onSelectAvatar(await avatarFile(name), avatarSrc(name));
    setOpen(false);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Avatar className="size-24">
        <AvatarImage alt={displayName} src={currentImage || undefined} />
        <AvatarFallback className="text-2xl">{displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
        {currentImage ? 'Change photo' : 'Add a photo'}
      </Button>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile picture</DialogTitle>
            <DialogDescription>Upload your own photo, or pick a ready-made avatar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              <ImageInput
                currentImage={undefined}
                name="upload-pet-photo"
                onChange={(file) => {
                  if (file) {
                    onUploadFile(file);
                    setOpen(false);
                  }
                }}
                onImagePreview={() => {}}
                placeholder="Upload a photo"
              />
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">or pick an avatar</span>
              <Separator className="flex-1" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {AVATARS.map((name) => (
                <button
                  className="cursor-pointer overflow-hidden rounded-full border-2 border-transparent transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none"
                  key={name}
                  onClick={() => handlePickAvatar(name)}
                  type="button"
                >
                  <img alt={name} className="aspect-square w-full object-cover" src={avatarSrc(name)} />
                </button>
              ))}
            </div>

            {currentImage && (
              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    onRemove();
                    setOpen(false);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Remove photo
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
