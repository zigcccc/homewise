import { MapPinOffIcon } from 'lucide-react';
import { type ComponentProps } from 'react';

import {
  Button,
  MapCenter,
  MapControlContainer,
  MapEvents,
  MapMarker,
  MapSearchControl,
  MapTileLayer,
  MapView,
  MapZoomControl,
} from '@homewise/ui/core';

/** Where the map opens when a location has no pin yet: Ljubljana, close enough to pan from. */
const FALLBACK_CENTER = { latitude: 46.056946, longitude: 14.505751 };

export type MapPin = { latitude: number; longitude: number };

/**
 * Picks a location's map pin: search for a place, or click the map. Selecting a search result also
 * offers back the address it resolved to, so the two fields agree without anyone retyping one.
 *
 * It carries **no `id` of its own** and forwards the one `FormControl` clones onto it — a control
 * that declares its own wins the Slot merge and detaches the `<label>` pointing at it.
 */
export function LocationMapField({
  onAddressResolved,
  onChange,
  value,
  ...props
}: Omit<ComponentProps<'div'>, 'onChange'> & {
  /** The address Photon resolved for a picked place. Ignored when the user clicks the map instead. */
  onAddressResolved?: (address: string) => void;
  onChange: (pin: MapPin | null) => void;
  value: MapPin | null;
}) {
  const center = value ?? FALLBACK_CENTER;

  return (
    <div className="relative overflow-hidden rounded-md border" {...props}>
      <MapView
        // Leaflet reads `center` once, on mount; `MapCenter` is what moves it afterwards.
        center={[center.latitude, center.longitude]}
        className="min-h-64"
        zoom={value ? 15 : 11}
      >
        <MapTileLayer />
        <MapCenter latitude={center.latitude} longitude={center.longitude} />
        <MapEvents onClick={onChange} />
        <MapSearchControl
          aria-label="Search for a place"
          onChange={(address) => onAddressResolved?.(address)}
          onPlaceSelect={(feature) => {
            const [longitude, latitude] = feature.geometry.coordinates;

            if (latitude !== undefined && longitude !== undefined) {
              onChange({ latitude, longitude });
            }
          }}
        />
        <MapZoomControl />
        {value && (
          <>
            <MapMarker
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = event.target.getLatLng();
                  onChange({ latitude: lat, longitude: lng });
                },
              }}
              position={[value.latitude, value.longitude]}
            />
            <MapControlContainer className="top-1 right-1">
              <Button className="border" onClick={() => onChange(null)} size="sm" type="button" variant="secondary">
                <MapPinOffIcon />
                Clear pin
              </Button>
            </MapControlContainer>
          </>
        )}
      </MapView>
    </div>
  );
}

/**
 * A location's pin as it sits on a detail page — no controls, nothing to click. Renders nothing when
 * there is no pin, so a caller can drop it in unconditionally.
 */
export function LocationMap({ name, value }: { name: string; value: MapPin | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <MapView center={[value.latitude, value.longitude]} className="min-h-56" dragging={false} scrollWheelZoom={false}>
        <MapTileLayer />
        <MapCenter latitude={value.latitude} longitude={value.longitude} />
        <MapMarker position={[value.latitude, value.longitude]} title={name} />
        <MapZoomControl />
      </MapView>
    </div>
  );
}

/** Opens the pin in whatever maps app the device has. */
export const directionsUrl = ({ latitude, longitude }: MapPin) =>
  `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
