import { useQuery } from '@tanstack/react-query';
import { type BBox, type Feature, type FeatureCollection, type Point } from 'geojson';
import { MapPinIcon, SearchIcon } from 'lucide-react';
import { type ComponentProps, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './command';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';
import { Spinner } from './spinner';

/**
 * Address search over **Photon** (https://photon.komoot.io), komoot's open geocoder for
 * OpenStreetMap. Keyless and free, which is the whole reason it's here — no tile bill, no token to
 * rotate, nothing to configure. It also has no SLA: treat a failed lookup as "type the address
 * yourself", never as a blocked flow.
 *
 * Adapted from https://shadcn-place-autocomplete.vercel.app.
 */

type PlaceFeatureProperties = {
  osm_id: number;
  osm_type: 'N' | 'W' | 'R';
  osm_key: string;
  osm_value: string;
  type: string;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  postcode?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  extent?: [number, number, number, number];
  extra?: Record<string, string>;
};

export type PlaceFeature = Feature<Point, PlaceFeatureProperties>;
type PlaceFeatureCollection = FeatureCollection<Point, PlaceFeatureProperties>;

/**
 * Photon's query parameters.
 * @see https://github.com/komoot/photon#photon-api
 */
type PlaceSearchOptions = {
  /** Search text (address, place name, or POI). */
  query: string;
  /** Preferred language for results (e.g. `en`, `de`, `sl`). */
  lang?: string;
  limit?: number;
  /** Restricts results. `[minLongitude, minLatitude, maxLongitude, maxLatitude]`. */
  bbox?: BBox;
  /** Biases results towards a point, with `lon`. */
  lat?: number;
  lon?: number;
  /** Higher values make the bias more local. */
  zoom?: number;
  locationBiasScale?: number;
};

export type PlaceAutocompleteProps = Omit<PlaceSearchOptions, 'query'> &
  Omit<ComponentProps<'input'>, 'onChange' | 'value'> & {
    debounceMs?: number;
    defaultValue?: string;
    /** Every keystroke, as an input's `onChange` is. Picking a place is `onPlaceSelect`. */
    onChange?: (value: string) => void;
    /** The picked place, plus the one-line address the list rendered for it. */
    onPlaceSelect?: (feature: PlaceFeature, address: string) => void;
    value?: string;
  };

/**
 * One line of address out of Photon's parts, skipping the ones it didn't return.
 *
 * The street line is **street first, then number** — "Slovenska cesta 1a" — which is how most of
 * Europe writes one and, more to the point, how this app's users do. The number-first order the
 * upstream component shipped is the Anglosphere's. Neither is universal, and nothing here is
 * localized yet; when that changes, this line is what has to learn the country code Photon already
 * returns as `countrycode`.
 */
function formatAddress(properties: PlaceFeatureProperties) {
  const parts = [];

  if (properties.name) {
    parts.push(properties.name);
  }

  if (properties.street && properties.housenumber) {
    parts.push(`${properties.street} ${properties.housenumber}`);
  } else if (properties.street) {
    parts.push(properties.street);
  }

  if (properties.city) {
    parts.push(properties.city);
  } else if (properties.locality) {
    parts.push(properties.locality);
  }

  if (properties.state && properties.state !== properties.city) {
    parts.push(properties.state);
  }

  if (properties.country) {
    parts.push(properties.country);
  }

  return [...new Set(parts)].join(', ');
}

function buildSearchUrl({ query, bbox, lang, lat, limit, locationBiasScale, lon, zoom }: PlaceSearchOptions) {
  const url = new URL('https://photon.komoot.io/api');
  url.searchParams.set('q', query);

  if (lang) {
    url.searchParams.set('lang', lang);
  }

  if (limit) {
    url.searchParams.set('limit', String(limit));
  }

  if (bbox) {
    url.searchParams.set('bbox', bbox.join(','));
  }

  if (lat !== undefined && lon !== undefined) {
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
  }

  if (zoom !== undefined) {
    url.searchParams.set('zoom', String(zoom));
  }

  if (locationBiasScale !== undefined) {
    url.searchParams.set('location_bias_scale', String(locationBiasScale));
  }

  return String(url);
}

function useDebounce<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * The lookup, as a query rather than an effect. TanStack owns the parts that were hand-rolled here:
 * the abort signal that stops a slow answer landing on top of a newer one, the in-flight flag, and —
 * the one that had already shipped as a bug — discarding the previous error, which now happens
 * because the state belongs to the query key rather than to the component.
 *
 * The debounce stays: it decides which strings become keys at all, and without it every keystroke
 * would be its own cache entry and its own request to somebody else's free service.
 */
function usePlaceSearch({ debounceMs, query, ...options }: { debounceMs: number } & PlaceSearchOptions) {
  const debouncedQuery = useDebounce(query.trim(), debounceMs);
  const { bbox, lang, lat, limit, locationBiasScale, lon, zoom } = options;

  const { data, error, isFetching, isSuccess } = useQuery({
    queryKey: ['place-autocomplete', { bbox, debouncedQuery, lang, lat, limit, locationBiasScale, lon, zoom }],
    async queryFn({ signal }) {
      const url = buildSearchUrl({ bbox, lang, lat, limit, locationBiasScale, lon, query: debouncedQuery, zoom });
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error(`Photon API error: ${response.status} ${response.statusText}`);
      }

      const collection: PlaceFeatureCollection = await response.json();
      // Photon returns the same OSM object once per matched name, so the raw list repeats places.
      const seen = new Set<number>();

      return collection.features.filter((feature) => {
        if (seen.has(feature.properties.osm_id)) {
          return false;
        }

        seen.add(feature.properties.osm_id);

        return true;
      });
    },
    enabled: Boolean(debouncedQuery),
    // Places do not move, and backspacing over a word to try another is the commonest thing anyone
    // does in this box — so retyping one should cost nothing.
    staleTime: 5 * 60 * 1000,
    // Photon is keyless and free and has no SLA. One failure is the answer, and the UI's answer to it
    // is "type the address yourself"; three more attempts only make that verdict slower to arrive.
    retry: false,
    // Says the same thing to the app's error reporting: a geocoder being down is not a bug here.
    meta: { expectedFailure: true },
  });

  return { error, hasSearched: isSuccess, isLoading: isFetching, results: data ?? [] };
}

function PlaceAutocomplete({
  bbox,
  className,
  debounceMs = 300,
  defaultValue = '',
  lang,
  lat,
  limit = 5,
  locationBiasScale,
  lon,
  onChange,
  onPlaceSelect,
  value,
  zoom,
  ...props
}: PlaceAutocompleteProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [searchQuery, setSearchQuery] = useState('');

  const isControlled = value !== undefined;
  const displayValue = isControlled ? value : internalValue;

  const { error, hasSearched, isLoading, results } = usePlaceSearch({
    bbox,
    debounceMs,
    lang,
    lat,
    limit,
    locationBiasScale,
    lon,
    query: searchQuery,
    zoom,
  });

  const hasNoResults = hasSearched && !isLoading && !error && results.length === 0;
  const showResults = Boolean(error) || hasNoResults || results.length > 0;

  const commit = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  return (
    <Command className={cn('h-fit overflow-visible', className)} loop shouldFilter={false}>
      <div className="relative">
        <InputGroup className={cn('border-input! bg-popover! ring-0!', showResults && 'rounded-b-none')}>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            onChange={(event) => {
              commit(event.target.value);
              setSearchQuery(event.target.value);
            }}
            placeholder="Search for a place"
            value={displayValue}
            {...props}
          />
          {isLoading && (
            <InputGroupAddon align="inline-end">
              <Spinner label="" />
            </InputGroupAddon>
          )}
        </InputGroup>
        {showResults && (
          <CommandList
            className={cn(
              'absolute top-full right-0 left-0 z-1001 rounded-b-md border border-input border-t-0 bg-popover shadow-md',
              'fade-in-0 zoom-in-95 slide-in-from-top-2 animate-in'
            )}
          >
            {error && <CommandEmpty>Couldn't search for places right now.</CommandEmpty>}
            {hasNoResults && <CommandEmpty>No places match "{displayValue}".</CommandEmpty>}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((feature) => {
                  const address = formatAddress(feature.properties);

                  return (
                    <CommandItem
                      key={feature.properties.osm_id}
                      onSelect={() => {
                        commit(address);
                        setSearchQuery('');
                        onPlaceSelect?.(feature, address);
                      }}
                      value={String(feature.properties.osm_id)}
                    >
                      <MapPinIcon />
                      <div className="flex flex-col items-start text-start">
                        <span className="font-medium">
                          {feature.properties.name || feature.properties.street || 'Unknown'}
                        </span>
                        <span className="text-muted-foreground text-xs">{address}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </div>
    </Command>
  );
}

export { PlaceAutocomplete };
