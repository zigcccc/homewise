import { Link } from '@tanstack/react-router';
import { type ReactNode } from 'react';

import { type ActivityEntry } from '../activity.queries';
import { activityAction } from '../helpers';

const LINK_CLASS = 'font-medium underline-offset-4 hover:underline';

/**
 * Wraps the label in a link to whatever it was about, where that still exists.
 *
 * A `switch` returning a whole `<Link>` per route rather than a computed `to`: the router types each
 * route's params separately, so threading one through a variable widens it to `string` and loses
 * exactly the checking that makes this safe. Entities with no page of their own fall through to
 * plain text, as does anything deleted — its id now points at a 404.
 */
function EntryLabel({ entry }: { entry: ActivityEntry }) {
  const { entity, entityId, label, operation, parentId } = entry;
  const plain = <span className="font-medium">{label}</span>;

  if (operation === 'delete') {
    return plain;
  }

  switch (entity) {
    case 'contact':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ contactId: String(entityId) }} to="/family/contacts/$contactId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'child_profile':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ profileId: String(entityId) }} to="/family/kids/$profileId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'pet_profile':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ profileId: String(entityId) }} to="/family/pets/$profileId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'recipe':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ recipeId: String(entityId) }} to="/food/recipes/$recipeId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'shopping_list':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ listId: String(entityId) }} to="/food/shopping-lists/$listId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'storage_location':
      return entityId ? (
        <Link className={LINK_CLASS} params={{ locationId: String(entityId) }} to="/storage/locations/$locationId">
          {label}
        </Link>
      ) : (
        plain
      );
    // An item has no page of its own — its location is where you go to find it.
    case 'storage_item':
      return parentId ? (
        <Link className={LINK_CLASS} params={{ locationId: String(parentId) }} to="/storage/locations/$locationId">
          {label}
        </Link>
      ) : (
        plain
      );
    case 'expense':
      return (
        <Link className={LINK_CLASS} to="/expenses/monthly-expenses">
          {label}
        </Link>
      );
    case 'expense_category':
      return (
        <Link className={LINK_CLASS} to="/expenses/monthly-expenses/categories">
          {label}
        </Link>
      );
    case 'ingredient':
      return (
        <Link className={LINK_CLASS} to="/food/ingredients">
          {label}
        </Link>
      );
    case 'store':
      return (
        <Link className={LINK_CLASS} to="/food/ingredients/stores">
          {label}
        </Link>
      );
    case 'recipe_tag':
      return (
        <Link className={LINK_CLASS} to="/food/recipes">
          {label}
        </Link>
      );
    case 'meal_plan':
      return (
        <Link className={LINK_CLASS} to="/food/meal-plan">
          {label}
        </Link>
      );
    case 'household':
      return (
        <Link className={LINK_CLASS} to="/manage/settings">
          {label}
        </Link>
      );
    case 'household_invite':
    case 'household_member':
      return (
        <Link className={LINK_CLASS} to="/manage/household-members">
          {label}
        </Link>
      );
    // A dictionary entry's parent is the dictionary, and the route is keyed by the profile — two
    // different ids, so there is nothing here to link to.
    case 'child_dictionary_entry':
    // A medical record is a tab on a profile the event doesn't name.
    case 'medical_info':
      return plain;
  }
}

/**
 * One logged change as a sentence: "Žiga added the contact **Ana Novak**". Layout-free on purpose —
 * the feed hangs an avatar and a timestamp around it, the dashboard card only a timestamp.
 */
export function ActivityEntryLine({
  entry,
  showActor = true,
}: {
  entry: ActivityEntry;
  showActor?: boolean;
}): ReactNode {
  return (
    <span className="min-w-0">
      {showActor ? <span className="font-medium">{entry.actorName}</span> : null}
      {showActor ? ' ' : ''}
      {activityAction(entry.entity, entry.operation, entry.count)} <EntryLabel entry={entry} />
    </span>
  );
}
