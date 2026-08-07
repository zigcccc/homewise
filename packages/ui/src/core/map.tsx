import 'leaflet/dist/leaflet.css';

import {
  type DivIconOptions,
  type LatLngExpression,
  type Map as LeafletMapInstance,
  type Marker,
  type Popup,
  type TileLayer,
} from 'leaflet';
import { MapPinIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  type ComponentProps,
  type ComponentType,
  lazy,
  type ReactNode,
  type Ref,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import { renderToString } from 'react-dom/server';
import {
  type MapContainerProps,
  type MarkerProps,
  type PopupProps,
  type TileLayerProps,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { cn } from '../lib/utils';
import { Button } from './button';
import { ButtonGroup } from './button-group';
import { PlaceAutocomplete, type PlaceAutocompleteProps } from './place-autocomplete';

/**
 * A Leaflet map, styled to match the kit. Adapted from https://shadcn-map.vercel.app — with the
 * drawing tools, marker clustering, fullscreen control and multi-layer switcher removed, because
 * nothing here uses them and each one drags in its own npm package and stylesheet. Re-adding one
 * means taking it from the registry again, not reinventing it.
 *
 * Tiles come from CARTO and geocoding from Photon, both free and keyless. The tile URL is the light
 * basemap outright: the app has no dark mode, and the upstream component reached for `next-themes`
 * to choose. `DEFAULT_TILE_URL` below is the one line a theme toggle would have to touch.
 *
 * Leaflet measures the DOM as it mounts, so every piece of it is loaded lazily and only after the
 * first client render — `createLazyComponent` is what enforces that.
 *
 * The root is `MapView`, not `Map` as upstream calls it: a component named `Map` shadows the global
 * of that name everywhere it's imported.
 */

const DEFAULT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>';

// biome-ignore lint/suspicious/noExplicitAny: the constraint is "any component", and its own props are recovered by ComponentProps<T> below.
function createLazyComponent<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  const LazyComponent = lazy(factory);

  return function Lazy(props: ComponentProps<T>) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
      setIsMounted(true);
    }, []);

    if (!isMounted) {
      return null;
    }

    return (
      <Suspense>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

const LeafletMapContainer = createLazyComponent(() =>
  import('react-leaflet').then((mod) => ({ default: mod.MapContainer }))
);
const LeafletTileLayer = createLazyComponent(() => import('react-leaflet').then((mod) => ({ default: mod.TileLayer })));
const LeafletMarker = createLazyComponent(() => import('react-leaflet').then((mod) => ({ default: mod.Marker })));
const LeafletPopup = createLazyComponent(() => import('react-leaflet').then((mod) => ({ default: mod.Popup })));

/** Leaflet itself, once the browser has it. `null` until then — every consumer must handle that. */
function useLeaflet() {
  const [L, setL] = useState<typeof import('leaflet') | null>(null);

  useEffect(() => {
    if (L || typeof window === 'undefined') {
      return;
    }

    void import('leaflet').then((leaflet) => setL(leaflet.default));
  }, [L]);

  return L;
}

/**
 * Leaflet measures its container once, as it mounts, and never again — so a map that opens inside
 * something still animating (a dialog) or that later changes size (the sidebar collapsing) draws
 * grey where the tiles should be until something forces a re-measure. Watching the container is what
 * does, and it is mounted by `MapView` itself so no caller has to remember.
 */
function MapAutoResize() {
  const map = useMap();

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [map]);

  return null;
}

function MapView({
  children,
  className,
  maxZoom = 18,
  zoom = 15,
  ...props
}: Omit<MapContainerProps, 'attributionControl' | 'zoomControl'> & {
  center: LatLngExpression;
  ref?: Ref<LeafletMapInstance>;
}) {
  return (
    <LeafletMapContainer
      // Left on deliberately: CARTO's and OpenStreetMap's terms both ask for visible credit, and
      // `MapTileLayer` is what fills it in. `zoomControl` below is ours (`MapZoomControl`); this
      // one has no replacement, so switching it off would just drop the attribution on the floor.
      className={cn('size-full min-h-96 flex-1 rounded-md', className)}
      maxZoom={maxZoom}
      zoom={zoom}
      zoomControl={false}
      {...props}
    >
      <MapAutoResize />
      {children}
    </LeafletMapContainer>
  );
}

/**
 * Moves the view when something outside the map does — a search result, a pin dropped elsewhere.
 * Takes the coordinates apart rather than a `LatLngExpression`, because an array literal is a new
 * value on every render and would re-centre the map forever.
 */
function MapCenter({ latitude, longitude, zoom }: { latitude: number; longitude: number; zoom?: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], zoom ?? map.getZoom());
  }, [map, latitude, longitude, zoom]);

  return null;
}

/** Map interactions, which Leaflet only exposes from inside the map's own context. */
function MapEvents({ onClick }: { onClick?: (position: { latitude: number; longitude: number }) => void }) {
  useMapEvents({
    click: (event) => onClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });

  return null;
}

function MapTileLayer({
  attribution = DEFAULT_ATTRIBUTION,
  url = DEFAULT_TILE_URL,
  ...props
}: Partial<TileLayerProps> & { ref?: Ref<TileLayer> }) {
  const map = useMap();

  // Drops Leaflet's "Leaflet | " credit, leaving the tile provider's. In an effect because it
  // mutates the map: React may run a render twice or throw one away, and neither may reach the DOM.
  useEffect(() => {
    map.attributionControl?.setPrefix('');
  }, [map]);

  return <LeafletTileLayer attribution={attribution} url={url} {...props} />;
}

/**
 * A pin. The icon is rendered to HTML rather than mounted, because Leaflet takes a markup string —
 * so it gets no React context and no state of its own; keep it to plain SVG and classes.
 */
function MapMarker({
  bgPos,
  icon = <MapPinIcon className="size-6 fill-primary stroke-primary-foreground" />,
  iconAnchor = [12, 24],
  popupAnchor = [0, -24],
  tooltipAnchor,
  ...props
}: Omit<MarkerProps, 'icon'> &
  Pick<DivIconOptions, 'bgPos' | 'iconAnchor' | 'popupAnchor' | 'tooltipAnchor'> & {
    icon?: ReactNode;
    ref?: Ref<Marker>;
  }) {
  const L = useLeaflet();

  if (!L) {
    return null;
  }

  return (
    <LeafletMarker
      icon={L.divIcon({
        html: renderToString(icon),
        iconAnchor,
        ...(bgPos ? { bgPos } : {}),
        ...(popupAnchor ? { popupAnchor } : {}),
        ...(tooltipAnchor ? { tooltipAnchor } : {}),
      })}
      riseOnHover
      {...props}
    />
  );
}

function MapPopup({ className, ...props }: Omit<PopupProps, 'content'> & { ref?: Ref<Popup> }) {
  return (
    <LeafletPopup
      className={cn(
        'z-50 w-72 rounded-md border bg-popover p-4 font-sans text-popover-foreground shadow-md outline-hidden',
        className
      )}
      {...props}
    />
  );
}

/**
 * Anchors a control over the map. Leaflet listens on the container, so a click on a button inside it
 * would otherwise also pan or zoom the map underneath — `disableClickPropagation` is what stops that.
 */
function MapControlContainer({ className, ...props }: ComponentProps<'div'>) {
  const L = useLeaflet();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;

    if (!L || !element) {
      return;
    }

    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, [L]);

  return <div className={cn('absolute z-1000 size-fit cursor-default', className)} ref={containerRef} {...props} />;
}

function MapZoomControl({
  className,
  position = 'bottom-1 right-1',
  ...props
}: ComponentProps<'div'> & { position?: string }) {
  const map = useMap();
  const [zoomLevel, setZoomLevel] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoomLevel(map.getZoom()),
  });

  return (
    <MapControlContainer className={cn(position, className)}>
      <ButtonGroup aria-label="Zoom controls" orientation="vertical" {...props}>
        <Button
          aria-label="Zoom in"
          className="border"
          disabled={zoomLevel >= map.getMaxZoom()}
          onClick={() => map.zoomIn()}
          size="icon-sm"
          title="Zoom in"
          type="button"
          variant="secondary"
        >
          <PlusIcon />
        </Button>
        <Button
          aria-label="Zoom out"
          className="border"
          disabled={zoomLevel <= map.getMinZoom()}
          onClick={() => map.zoomOut()}
          size="icon-sm"
          title="Zoom out"
          type="button"
          variant="secondary"
        >
          <MinusIcon />
        </Button>
      </ButtonGroup>
    </MapControlContainer>
  );
}

function MapSearchControl({
  className,
  position = 'top-1 left-1',
  ...props
}: PlaceAutocompleteProps & { position?: string }) {
  return (
    <MapControlContainer className={cn('w-64', position, className)}>
      <PlaceAutocomplete {...props} />
    </MapControlContainer>
  );
}

export {
  MapCenter,
  MapControlContainer,
  MapEvents,
  MapMarker,
  MapPopup,
  MapSearchControl,
  MapTileLayer,
  MapView,
  MapZoomControl,
  useLeaflet,
};
