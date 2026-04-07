// "use client";

// import { useEffect, useRef, useState } from "react";

// export interface AddressParts {
//   address_1: string;
//   address_2?: string;
//   city: string;
//   state: string;
//   postcode: string;
//   country: string;
// }

// declare global {
//   interface Window {
//     google?: typeof google;
//     initAddressAutocomplete?: () => void;
//   }
// }

// interface AddressAutocompleteProps {
//   value: string;
//   onChange: (value: string) => void;
//   onPlaceSelect?: (address: AddressParts) => void;
//   disabled?: boolean;
//   error?: boolean;
//   placeholder?: string;
//   id?: string;
//   className?: string;
//   "aria-label"?: string;
//   "aria-invalid"?: boolean | "true" | "false";
//   "aria-describedby"?: string;
//   "aria-required"?: boolean | "true" | "false";
//   autoComplete?: string;
// }

// const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

// function loadGoogleMapsScript(apiKey: string): Promise<void> {
//   return new Promise((resolve, reject) => {
//     if (typeof window === "undefined") {
//       reject(new Error("Window is not defined"));
//       return;
//     }
//     if (window.google?.maps?.places) {
//       resolve();
//       return;
//     }
//     const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
//     if (existing) {
//       if (window.google?.maps?.places) {
//         resolve();
//       } else {
//         existing.addEventListener("load", () => resolve());
//         existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
//       }
//       return;
//     }
//     const script = document.createElement("script");
//     script.id = GOOGLE_MAPS_SCRIPT_ID;
//     script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
//     script.async = true;
//     script.defer = true;
//     script.onload = () => resolve();
//     script.onerror = () => reject(new Error("Failed to load Google Maps"));
//     document.head.appendChild(script);
//   });
// }

// function parseAddressComponents(place: google.maps.places.PlaceResult): AddressParts {
//   const components = place.address_components || [];
//   const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name || "";
//   const getShort = (type: string) =>
//     components.find((c) => c.types.includes(type))?.short_name || "";

//   const streetNumber = get("street_number");
//   const route = get("route");
//   const subpremise = get("subpremise");
//   const address1 =
//     [streetNumber, route].filter(Boolean).join(" ") ||
//     place.name ||
//     place.formatted_address?.split(",")[0] ||
//     "";
//   const address2 = subpremise || undefined;
//   const city =
//     get("locality") ||
//     get("sublocality_level_1") ||
//     get("sublocality") ||
//     get("postal_town") ||
//     get("administrative_area_level_2");

//   const state = getShort("administrative_area_level_1") || get("administrative_area_level_1");

//   const postcode = get("postal_code");

//   const country = getShort("country") || "AU";
//   return {
//     address_1: address1.trim(),
//     address_2: address2?.trim() || undefined,
//     city: city.trim(),
//     state: state.trim(),
//     postcode: postcode.trim(),
//     country: country.trim() || "AU",
//   };
// }

// export default function AddressAutocomplete({
//   value,
//   onChange,
//   onPlaceSelect,
//   disabled = false,
//   error = false,
//   placeholder = "Start typing your address...",
//   id,
//   className = "",
//   "aria-label": ariaLabel = "Address",
//   "aria-invalid": ariaInvalid,
//   "aria-describedby": ariaDescribedBy,
//   "aria-required": ariaRequired,
//   autoComplete = "street-address",
// }: AddressAutocompleteProps) {
//   const inputRef = useRef<HTMLInputElement>(null);
//   const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
//   const [scriptLoaded, setScriptLoaded] = useState(false);
//   const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
//   const onChangeRef = useRef(onChange);
//   const onPlaceSelectRef = useRef(onPlaceSelect);
//   onChangeRef.current = onChange;
//   onPlaceSelectRef.current = onPlaceSelect;

//   useEffect(() => {
//     if (!apiKey || disabled) return;
//     loadGoogleMapsScript(apiKey)
//       .then(() => setScriptLoaded(true))
//       .catch((err) => console.warn("[AddressAutocomplete] Google Maps load failed:", err));
//   }, [apiKey, disabled]);

//   useEffect(() => {
//     if (!scriptLoaded || !inputRef.current || !window.google?.maps?.places) return;

//     const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
//       types: ["address"],
//       fields: ["address_components", "formatted_address", "place_id"],
//       componentRestrictions: { country: "au" },
//     });

//     autocompleteRef.current = autocomplete;

//     const listener = autocomplete.addListener("place_changed", () => {
//       setTimeout(() => {
//         const place = autocomplete.getPlace();

//         const applyParsed = (p: google.maps.places.PlaceResult) => {
//           if (p.address_components && p.address_components.length > 0) {
//             const parsed = parseAddressComponents(p);
//             onChangeRef.current(parsed.address_1);
//             onPlaceSelectRef.current?.(parsed);
//           }
//         };

//         if (place.address_components && place.address_components.length > 0) {
//           applyParsed(place);
//           return;
//         }

//         if (place.place_id) {
//           const service = new google.maps.places.PlacesService(document.createElement("div"));
//           service.getDetails(
//             {
//               placeId: place.place_id,
//               fields: ["address_components", "formatted_address", "name"],
//             },
//             (detailPlace, status) => {
//               if (status === google.maps.places.PlacesServiceStatus.OK && detailPlace) {
//                 applyParsed(detailPlace);
//               } else {
//                 const addr1 = place.formatted_address?.split(",")[0]?.trim() || place.name || "";
//                 if (addr1) onChangeRef.current(addr1);
//               }
//             }
//           );
//         } else {
//           const addr1 = place.formatted_address?.split(",")[0]?.trim() || place.name || "";
//           if (addr1) onChangeRef.current(addr1);
//         }
//       }, 10);
//     });

//     return () => {
//       if (listener) google.maps.event.removeListener(listener);
//       autocompleteRef.current = null;
//     };
//   }, [scriptLoaded]);

//   if (!apiKey) {
//     return (
//       <input
//         ref={inputRef}
//         type="text"
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         disabled={disabled}
//         placeholder={placeholder}
//         id={id}
//         aria-label={ariaLabel}
//         aria-invalid={ariaInvalid}
//         aria-describedby={ariaDescribedBy}
//         aria-required={ariaRequired}
//         autoComplete={autoComplete}
//         className={className}
//       />
//     );
//   }

//   return (
//     <input
//       ref={inputRef}
//       type="text"
//       value={value}
//       onChange={(e) => onChange(e.target.value)}
//       disabled={disabled}
//       placeholder={placeholder}
//       id={id}
//       aria-label={ariaLabel}
//       aria-invalid={ariaInvalid}
//       aria-describedby={ariaDescribedBy}
//       aria-required={ariaRequired}
//       autoComplete="off"
//       className={className}
//     />
//   );
// }


"use client";

import { useEffect, useRef, useState } from "react";

export interface AddressParts {
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

declare global {
  interface Window {
    google?: typeof google;
    initAddressAutocomplete?: () => void;
  }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (address: AddressParts) => void;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  "aria-required"?: boolean | "true" | "false";
  autoComplete?: string;
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Window is not defined"));
      return;
    }
    if (window.google?.maps?.places) {
      resolve();
      return;
    }
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existing) {
      if (window.google?.maps?.places) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")));
      }
      return;
    }
    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
}

function parseAddressComponents(place: google.maps.places.PlaceResult): AddressParts {
  const components = place.address_components || [];
  const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name || "";
  const getShort = (type: string) =>
    components.find((c) => c.types.includes(type))?.short_name || "";

  const streetNumber = get("street_number");
  const route = get("route");
  const subpremise = get("subpremise");
  const address1 =
    [streetNumber, route].filter(Boolean).join(" ") ||
    place.name ||
    place.formatted_address?.split(",")[0] ||
    "";
  const address2 = subpremise || undefined;
  const city =
    get("locality") ||
    get("sublocality_level_1") ||
    get("sublocality") ||
    get("postal_town") ||
    get("administrative_area_level_2");

  const state = getShort("administrative_area_level_1") || get("administrative_area_level_1");

  const postcode = get("postal_code");

  const country = getShort("country") || "AU";
  return {
    address_1: address1.trim(),
    address_2: address2?.trim() || undefined,
    city: city.trim(),
    state: state.trim(),
    postcode: postcode.trim(),
    country: country.trim() || "AU",
  };
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  disabled = false,
  error = false,
  placeholder = "Start typing your address...",
  id,
  className = "",
  "aria-label": ariaLabel = "Address",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  autoComplete = "street-address",
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  useEffect(() => {
    if (!apiKey || disabled) return;
    loadGoogleMapsScript(apiKey)
      .then(() => setScriptLoaded(true))
      .catch((err) => console.warn("[AddressAutocomplete] Google Maps load failed:", err));
  }, [apiKey, disabled]);

  useEffect(() => {
    if (!scriptLoaded || !inputRef.current || !window.google?.maps?.places) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      fields: ["address_components", "formatted_address", "place_id"],
      componentRestrictions: { country: "au" },
    });

    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener("place_changed", () => {
      setTimeout(() => {
        const place = autocomplete.getPlace();

        const applyParsed = (p: google.maps.places.PlaceResult) => {
          if (p.address_components && p.address_components.length > 0) {
            const parsed = parseAddressComponents(p);
            onChangeRef.current(parsed.address_1);
            onPlaceSelectRef.current?.(parsed);
          }
        };

        if (place.address_components && place.address_components.length > 0) {
          applyParsed(place);
          return;
        }

        if (place.place_id) {
          const service = new google.maps.places.PlacesService(document.createElement("div"));
          service.getDetails(
            {
              placeId: place.place_id,
              fields: ["address_components", "formatted_address", "name"],
            },
            (detailPlace, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && detailPlace) {
                applyParsed(detailPlace);
              } else {
                const addr1 = place.formatted_address?.split(",")[0]?.trim() || place.name || "";
                if (addr1) onChangeRef.current(addr1);
              }
            }
          );
        } else {
          const addr1 = place.formatted_address?.split(",")[0]?.trim() || place.name || "";
          if (addr1) onChangeRef.current(addr1);
        }
      }, 10);
    });

    return () => {
      if (listener) google.maps.event.removeListener(listener);
      autocompleteRef.current = null;
    };
  }, [scriptLoaded]);

  if (!apiKey) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        autoComplete={autoComplete}
        className={className}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      id={id}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-required={ariaRequired}
      autoComplete="off"
      className={className}
    />
  );
}
