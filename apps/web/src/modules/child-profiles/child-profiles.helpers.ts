/** How full a child's dictionary is — the one line the kids list and the dashboard both show. */
export const dictionaryLabel = (entryCount: number) =>
  `${entryCount} ${entryCount === 1 ? 'word' : 'words'} in the dictionary`;
