/** "1 h 20 min" reads faster than "80 min" once you're past an hour. */
export function formatMinutes(minutes: number | null) {
  if (minutes === null || minutes === 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * How an attribution reads on one line: the given name when there is one, otherwise the URL's
 * hostname ("okusno.je"), since a full path is unreadable next to other metadata.
 *
 * Returns `null` when there is nothing to attribute.
 */
export function formatSource(sourceName: string | null, sourceUrl: string | null) {
  if (sourceName) {
    return sourceName;
  }

  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    // The server validates the URL, so this only trips on legacy or hand-edited data.
    return sourceUrl;
  }
}
