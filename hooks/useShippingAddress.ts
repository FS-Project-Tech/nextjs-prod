/**
 * Shipping Address Hook
 * Manages shipping address state from localStorage with event listeners
 */

import { useEffect, useState, useCallback } from "react";

interface ShippingAddress {
  country?: string;
  zone?: string;
  postcode?: string;
  state?: string;
  city?: string;
  address_1?: string;
  address_2?: string;
  first_name?: string;
  last_name?: string;
}

interface UseShippingAddressReturn {
  country: string;
  zone: string;
  address: ShippingAddress | null;
  updateAddress: (address: ShippingAddress) => void;
}

/**
 * Hook to manage shipping address from localStorage
 * Listens for changes from checkout page and other sources
 */
export function useShippingAddress(): UseShippingAddressReturn {
  const [country, setCountry] = useState<string>("AU");
  const [zone, setZone] = useState<string>("Australia");
  const [address, setAddress] = useState<ShippingAddress | null>(null);

  const updateShippingAddress = useCallback((addressData: ShippingAddress | null) => {
    if (addressData?.country) {
      setCountry(addressData.country);
      const newZone = addressData.country === 'AU' || addressData.country === 'Australia' 
        ? 'Australia' 
        : '';
      setZone(newZone);
      setAddress(addressData);
    } else {
      setCountry("AU");
      setZone("Australia");
      setAddress(null);
    }
  }, []);

  const updateAddress = useCallback((addressData: ShippingAddress) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('checkout:shipping', JSON.stringify(addressData));
        updateShippingAddress(addressData);
        // Dispatch custom event for other components
        window.dispatchEvent(new CustomEvent('shippingAddressChanged'));
      }
    } catch (error) {
      console.error('Failed to save shipping address:', error);
    }
  }, [updateShippingAddress]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load initial address
    try {
      const saved = localStorage.getItem('checkout:shipping');
      if (saved) {
        updateShippingAddress(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load shipping address:', error);
    }

    // Listen for storage changes (from other tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'checkout:shipping') {
        try {
          updateShippingAddress(e.newValue ? JSON.parse(e.newValue) : null);
        } catch (error) {
          console.error('Failed to parse shipping address from storage:', error);
        }
      }
    };

    // Listen for custom events (from same tab)
    const handleAddressChange = () => {
      try {
        const saved = localStorage.getItem('checkout:shipping');
        if (saved) {
          updateShippingAddress(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Failed to load shipping address from event:', error);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('shippingAddressChanged', handleAddressChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('shippingAddressChanged', handleAddressChange);
    };
  }, [updateShippingAddress]);

  return {
    country,
    zone,
    address,
    updateAddress,
  };
}

