import { AtSignIcon, CakeIcon, GlobeIcon, LinkIcon, MailIcon, MapPinIcon, PhoneIcon } from 'lucide-react';

import { type ContactLinkType } from '@homewise/server/contacts';

import { ageInYears, ExternalLink, formatDate } from '@/modules/shared';

/**
 * Icon per link type — a website, a social profile, or anything else. Typed against the enum rather
 * than inferred from its own keys, so a link type added on the server fails the build here instead
 * of rendering `undefined` as a component.
 */
const linkIcons: Record<ContactLinkType, typeof GlobeIcon> = {
  web: GlobeIcon,
  social: AtSignIcon,
  other: LinkIcon,
};

type ContactLink = { id: number; name: string; type: ContactLinkType; url: string };

/**
 * A contact's ways of being reached, as one wrapping row of icon + value. Shown on the contact's own
 * page and wherever a contact is attached to something else, so the two can't drift apart.
 */
export function ContactFacts({
  address,
  className,
  dateOfBirth,
  email,
  phone,
}: {
  address: string | null;
  className?: string;
  /** Omitted where a birthday isn't part of the picture — a doctor attached to a medical record. */
  dateOfBirth?: string | null;
  email: string | null;
  phone: string | null;
}) {
  const age = ageInYears(dateOfBirth);

  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm ${className ?? ''}`}>
      {email ? (
        <span className="flex items-center gap-1">
          <MailIcon className="size-3.5" />
          {email}
        </span>
      ) : null}
      {phone ? (
        <span className="flex items-center gap-1">
          <PhoneIcon className="size-3.5" />
          {phone}
        </span>
      ) : null}
      {address ? (
        <span className="flex items-center gap-1">
          <MapPinIcon className="size-3.5" />
          {address}
        </span>
      ) : null}
      {dateOfBirth ? (
        <span className="flex items-center gap-1">
          <CakeIcon className="size-3.5" />
          {formatDate(dateOfBirth)}
          {age === null ? null : ` · ${age} ${age === 1 ? 'year' : 'years'}`}
        </span>
      ) : null}
    </div>
  );
}

/** A contact's external links, as chips. */
export function ContactLinkChips({ links }: { links: ContactLink[] }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {links.map((link) => {
        const Icon = linkIcons[link.type];

        return (
          <ExternalLink
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
            href={link.url}
            key={link.id}
          >
            <Icon className="size-3" />
            {link.name}
          </ExternalLink>
        );
      })}
    </div>
  );
}
