import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BabyIcon, BookUserIcon, CakeIcon, PawPrintIcon } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@homewise/ui/core';

import { listChildProfilesQueryOptions } from '@/modules/child-profiles';
import { listContactsQueryOptions } from '@/modules/contacts';
import { listPetProfilesQueryOptions } from '@/modules/pet-profiles';
import { countdownLabel, nextBirthday } from '@/modules/shared';

import {
  DashboardCard,
  DashboardCardEmpty,
  type DashboardCardFrame,
  DashboardCardRow,
  DashboardCardRowsSkeleton,
} from './dashboard-card';

/** Past this a birthday is a diary entry, not a heads-up. */
const HORIZON_DAYS = 60;

/** How many fit before the card outgrows the one beside it. */
const SHOWN = 5;

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = { icon: CakeIcon, title: 'Upcoming birthdays' } satisfies DashboardCardFrame;

/**
 * Safe to cut server-side even though the ranking below spans three tables: every contact left off
 * this page is further out than all `SHOWN` on it, so none could displace one after the merge.
 */
export const dashboardBirthdayContactsQueryOptions = () =>
  listContactsQueryOptions({ pageSize: SHOWN, sortDirection: 'asc', sortKey: 'birthday' });

type Kind = 'child' | 'contact' | 'pet';

type Person = { dateOfBirth: string | null; id: number; kind: Kind; name: string };

const ICONS = { child: BabyIcon, contact: BookUserIcon, pet: PawPrintIcon } as const;

/** A `switch` rather than a computed `to`: the router types each route's params separately. */
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

function BirthdaysCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <DashboardCardRowsSkeleton rows={SHOWN} />
    </DashboardCard>
  );
}

export function BirthdaysCard() {
  // A birth date is a column on three tables, and merging them means redoing the server's ordering.
  const { data: contacts } = useSuspenseQuery(dashboardBirthdayContactsQueryOptions());
  const { data: children } = useSuspenseQuery(listChildProfilesQueryOptions());
  const { data: pets } = useSuspenseQuery(listPetProfilesQueryOptions());

  const upcoming = useMemo(() => {
    const everyone: Person[] = [
      ...contacts.items.map((contact) => ({
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

    return everyone
      .flatMap((person) => {
        const next = nextBirthday(person.dateOfBirth);

        // Drops anyone with no birth date, and anyone far enough off to be noise rather than notice.
        return next && next.inDays <= HORIZON_DAYS ? [{ ...person, next }] : [];
      })
      .toSorted((a, b) => a.next.inDays - b.next.inDays)
      .slice(0, SHOWN);
  }, [children, contacts, pets]);

  return (
    <DashboardCard {...CARD}>
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
                <Badge variant={person.next.inDays <= 1 ? 'default' : 'muted'}>
                  {countdownLabel(person.next.inDays)}
                </Badge>
              </DashboardCardRow>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

BirthdaysCard.Skeleton = BirthdaysCardSkeleton;
