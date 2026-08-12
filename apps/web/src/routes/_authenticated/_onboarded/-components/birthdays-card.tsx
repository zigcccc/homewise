import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BabyIcon, BookUserIcon, CakeIcon, PawPrintIcon } from 'lucide-react';

import { Badge } from '@homewise/ui/core';

import { listChildProfilesQueryOptions } from '@/modules/child-profiles';
import { listContactsQueryOptions } from '@/modules/contacts';
import { listPetProfilesQueryOptions } from '@/modules/pet-profiles';
import { nextBirthday } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty, DashboardCardRow } from './dashboard-card';

/** How far ahead is still worth a card. Past this a birthday is a diary entry, not a heads-up. */
const HORIZON_DAYS = 60;

/** How many fit before the card outgrows the one beside it. */
const SHOWN = 5;

type Kind = 'child' | 'contact' | 'pet';

const ICONS = { child: BabyIcon, contact: BookUserIcon, pet: PawPrintIcon } as const;

/** "Today" and "Tomorrow" earn their own words — "in 0 days" is not how anyone says it. */
function countdown(inDays: number) {
  if (inDays === 0) {
    return 'Today';
  }

  return inDays === 1 ? 'Tomorrow' : `in ${inDays} days`;
}

/**
 * The name, linked to whichever record it came from. A `switch` rather than a computed `to`, because
 * the router types each route's params separately and there is no shared shape to hand it.
 */
function BirthdayName({ id, kind, name }: { id: number; kind: Kind; name: string }) {
  const className = 'truncate hover:underline';

  if (kind === 'contact') {
    return (
      <Link className={className} params={{ contactId: String(id) }} to="/family/contacts/$contactId">
        {name}
      </Link>
    );
  }

  if (kind === 'child') {
    return (
      <Link className={className} params={{ profileId: String(id) }} to="/family/kids/$profileId">
        {name}
      </Link>
    );
  }

  return (
    <Link className={className} params={{ profileId: String(id) }} to="/family/pets/$profileId">
      {name}
    </Link>
  );
}

export function BirthdaysCard() {
  // Three sources, because a birth date is a column on three tables. Contacts can be sorted by
  // "whose is next" server-side, but that ordering only ranks contacts against each other — merged
  // with kids and pets it would have to be redone here anyway, so all three arrive unsorted.
  const { data: contacts } = useSuspenseQuery(listContactsQueryOptions());
  const { data: children } = useSuspenseQuery(listChildProfilesQueryOptions());
  const { data: pets } = useSuspenseQuery(listPetProfilesQueryOptions());

  const everyone: { dateOfBirth: string | null; id: number; kind: Kind; name: string }[] = [
    ...contacts.map((contact) => ({
      dateOfBirth: contact.dateOfBirth,
      id: contact.id,
      kind: 'contact' as const,
      name: contact.name,
    })),
    ...children.map((profile) => ({
      dateOfBirth: profile.dateOfBirth,
      id: profile.id,
      kind: 'child' as const,
      name: profile.child.displayName,
    })),
    ...pets.map((profile) => ({
      dateOfBirth: profile.dateOfBirth,
      id: profile.id,
      kind: 'pet' as const,
      name: profile.pet.displayName,
    })),
  ];

  const upcoming = everyone
    .flatMap((person) => {
      const next = nextBirthday(person.dateOfBirth);

      // Drops anyone with no birth date, and anyone far enough off to be noise rather than notice.
      return next && next.inDays <= HORIZON_DAYS ? [{ ...person, next }] : [];
    })
    .sort((a, b) => a.next.inDays - b.next.inDays)
    .slice(0, SHOWN);

  return (
    <DashboardCard icon={CakeIcon} title="Upcoming birthdays">
      {upcoming.length === 0 ? (
        <DashboardCardEmpty>No birthdays in the next two months.</DashboardCardEmpty>
      ) : (
        <div className="divide-y">
          {upcoming.map((person) => {
            const Icon = ICONS[person.kind];

            return (
              <DashboardCardRow key={`${person.kind}-${person.id}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <BirthdayName id={person.id} kind={person.kind} name={person.name} />
                  {person.next.turning > 0 ? (
                    <span className="shrink-0 text-muted-foreground text-xs">turning {person.next.turning}</span>
                  ) : null}
                </span>
                <Badge variant={person.next.inDays <= 1 ? 'default' : 'muted'}>{countdown(person.next.inDays)}</Badge>
              </DashboardCardRow>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
