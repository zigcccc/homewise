/** What a form holding a managed image field carries, whether or not it offers the avatar picker. */
type ManagedImageFormValues = {
  avatarFile?: File | null;
  image?: string | null;
  imageFile?: File | null;
};

/**
 * Turns a form's three picture fields into the one or two keys the endpoint takes.
 *
 * The order is the server's, and it is a priority rather than a sequence: an uploaded photo beats a
 * picked avatar, and only when neither is present does an emptied preview over a stored URL mean
 * "clear it". Anything else returns **nothing** — a missing key is how the server is told to leave
 * the picture alone, which is not the same as being sent an empty one.
 */
export function resolveManagedImage(values: ManagedImageFormValues, currentUrl: string | null | undefined) {
  if (values.imageFile instanceof File) {
    return { image: values.imageFile };
  }

  if (values.avatarFile instanceof File) {
    return { avatar: values.avatarFile };
  }

  return !values.image && currentUrl ? { image: '' as const } : {};
}
