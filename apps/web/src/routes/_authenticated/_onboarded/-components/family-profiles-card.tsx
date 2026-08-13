import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage, Button, ButtonGroup, Skeleton } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { dictionaryLabel, listChildProfilesQueryOptions } from '@/modules/child-profiles';
import { listPetProfilesQueryOptions, typeAndBreed } from '@/modules/pet-profiles';
import { ageLabel } from '@/modules/shared';

import { DashboardCard, DashboardCardEmpty, type DashboardCardFrame } from './dashboard-card';

/** The frame, shared with the skeleton so a renamed card can't say two things at once. */
const CARD = {
  // Two links rather than one "View all": the card holds two lists, and neither owns the other.
  action: (
    <ButtonGroup>
      <Button asChild size="sm" variant="ghost">
        <Link to="/family/kids">Kids</Link>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link to="/family/pets">Pets</Link>
      </Button>
    </ButtonGroup>
  ),
  icon: UsersIcon,
  title: 'Family profiles',
} satisfies DashboardCardFrame;

/** One per row: the card shares its row with the activity feed, and a tile needs the width to read. */
const TILE_GRID = 'grid gap-2';

type Profile = {
  dateOfBirth: string | null;
  detail: string;
  id: number;
  kind: 'child' | 'pet';
  name: string;
  picture: string | null;
};

/** A `switch` rather than a computed `to`: the router types each route's params separately. */
function ProfileTile({ dateOfBirth, detail, id, kind, name, picture }: Profile) {
  const className = 'flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50';

  const body = (
    <>
      <Avatar className="size-8 shrink-0">
        <AvatarImage alt={name} src={picture || undefined} />
        <AvatarFallback>{name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium text-sm">{name}</p>
        <p className="truncate text-muted-foreground text-xs">{ageLabel(dateOfBirth)}</p>
        <p className="truncate text-muted-foreground text-xs">{detail}</p>
      </div>
    </>
  );

  if (kind === 'child') {
    return (
      <Link className={className} params={{ profileId: String(id) }} to="/family/kids/$profileId">
        {body}
      </Link>
    );
  }

  return (
    <Link className={className} params={{ profileId: String(id) }} to="/family/pets/$profileId">
      {body}
    </Link>
  );
}

/** Spelled as each list page spells it, so the card and the page it links to share one cache entry. */
export const dashboardChildProfilesQueryOptions = () => listChildProfilesQueryOptions();

export const dashboardPetProfilesQueryOptions = () => listPetProfilesQueryOptions();

/** Uneven, so the placeholder reads as a list of names. Also the tile keys. */
const TILE_WIDTHS = ['w-24', 'w-16', 'w-20'];

function FamilyProfilesCardSkeleton() {
  return (
    <DashboardCard {...CARD}>
      <div className={TILE_GRID}>
        {TILE_WIDTHS.map((width) => (
          <div className="flex items-center gap-3 rounded-lg border p-3" key={width}>
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className={cn('h-4 max-w-full', width)} />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

export function FamilyProfilesCard() {
  const { data: children } = useSuspenseQuery(dashboardChildProfilesQueryOptions());
  const { data: pets } = useSuspenseQuery(dashboardPetProfilesQueryOptions());

  // Kids first, then pets, each in the order its endpoint returns. Never sliced: a household has a
  // handful, and a roster that stops short is one that lies about who is in it.
  const profiles = [
    ...children.map((profile) => ({
      dateOfBirth: profile.dateOfBirth,
      detail: dictionaryLabel(profile.dictionary?.entryCount ?? 0),
      id: profile.id,
      kind: 'child' as const,
      name: profile.child.displayName,
      picture: profile.profilePicture,
    })),
    ...pets.map((profile) => ({
      dateOfBirth: profile.dateOfBirth,
      detail: typeAndBreed(profile.type, profile.breed) ?? 'Type not set',
      id: profile.id,
      kind: 'pet' as const,
      name: profile.pet.displayName,
      picture: profile.profilePicture,
    })),
  ];

  return (
    <DashboardCard {...CARD}>
      {profiles.length === 0 ? (
        <DashboardCardEmpty>No kid or pet profiles yet.</DashboardCardEmpty>
      ) : (
        <div className={TILE_GRID}>
          {profiles.map((profile) => (
            <ProfileTile key={`${profile.kind}-${profile.id}`} {...profile} />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

FamilyProfilesCard.Skeleton = FamilyProfilesCardSkeleton;
