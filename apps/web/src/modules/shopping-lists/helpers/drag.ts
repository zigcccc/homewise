/** What a shopping-list row is, to dnd-kit. Shared so a droppable can only accept the right thing. */
export const ITEM_DRAG_TYPE = 'shopping-list-item';

/** The ungrouped bucket's group id. It has no section row, so it has no id of its own to use. */
export const UNGROUPED_GROUP = 'ungrouped';

/** dnd-kit groups are addressed by string; a section is addressed by number. */
export const sectionGroupId = (sectionId: number | null) => (sectionId === null ? UNGROUPED_GROUP : String(sectionId));

export const groupIdToSectionId = (groupId: string) => (groupId === UNGROUPED_GROUP ? null : Number(groupId));
