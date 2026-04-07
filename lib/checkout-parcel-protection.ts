/** WooCommerce checkout field key — must match backend PHP */
export const INSURANCE_OPTION_META_KEY = "insurance_option" as const;

export type InsuranceOption = "yes" | "no";

export const CHECKOUT_INSURANCE_STORAGE_KEY = "checkout:insurance_option";

/** AUD — keep in sync with WooCommerce fee rules */
export const PARCEL_PROTECTION_FEE_AUD = 6;

export const PARCEL_PROTECTION_ICON_URL =
  "https://live.joyamedicalsupplies.com.au/wp-content/uploads/2024/08/Package-Safe.svg";
