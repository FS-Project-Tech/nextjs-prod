// "use client";

// import type { Dispatch, SetStateAction } from "react";
// import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
// import type { Address } from "@/hooks/useAddresses";
// import type { CheckoutFormData } from "@/lib/checkout/schema";
// import BillingSection from "@/components/checkout/BillingSection";
// import NdisSection from "@/components/checkout/NdisSection";
// import ShippingSection from "@/components/checkout/ShippingSection";
// import AdditionalSection from "@/components/checkout/AdditionalSection";

// export type CheckoutFormProps = {
//   user: { id?: string } | null;
//   billingAddresses: Address[];
//   shippingAddresses: Address[];
//   selectedBillingAddressId: string;
//   setSelectedBillingAddressId: (id: string) => void;
//   selectedShippingAddressId: string;
//   setSelectedShippingAddressId: (id: string) => void;
//   openNdisSection: boolean;
//   setOpenNdisSection: Dispatch<SetStateAction<boolean>>;
//   openHcpSection: boolean;
//   setOpenHcpSection: Dispatch<SetStateAction<boolean>>;
//   control: Control<CheckoutFormData>;
//   register: UseFormRegister<CheckoutFormData>;
//   errors: FieldErrors<CheckoutFormData>;
//   setValue: UseFormSetValue<CheckoutFormData>;
// };

// export default function CheckoutForm({
//   user,
//   billingAddresses,
//   shippingAddresses,
//   selectedBillingAddressId,
//   setSelectedBillingAddressId,
//   selectedShippingAddressId,
//   setSelectedShippingAddressId,
//   openNdisSection,
//   setOpenNdisSection,
//   openHcpSection,
//   setOpenHcpSection,
//   control,
//   register,
//   errors,
//   setValue,
// }: CheckoutFormProps) {
//   return (
//           <div className="lg:col-span-2 space-y-6">
//       <BillingSection
//         user={user}
//         billingAddresses={billingAddresses}
//         selectedBillingAddressId={selectedBillingAddressId}
//         setSelectedBillingAddressId={setSelectedBillingAddressId}
//                     control={control}
//         register={register}
//         errors={errors}
//         setValue={setValue}
//       />
//       <NdisSection
//         openNdisSection={openNdisSection}
//         setOpenNdisSection={setOpenNdisSection}
//         openHcpSection={openHcpSection}
//         setOpenHcpSection={setOpenHcpSection}
//                     control={control}
//         selectedBillingAddressId={selectedBillingAddressId}
//       />
//       <ShippingSection
//         user={user}
//         shippingAddresses={shippingAddresses}
//         selectedShippingAddressId={selectedShippingAddressId}
//         setSelectedShippingAddressId={setSelectedShippingAddressId}
//                     control={control}
//         setValue={setValue}
//       />
//       <AdditionalSection control={control} />
//           </div>
//   );
// }

"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { Address } from "@/hooks/useAddresses";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import BillingSection from "@/components/checkout/BillingSection";
import NdisSection from "@/components/checkout/NdisSection";
import ShippingSection from "@/components/checkout/ShippingSection";
import AdditionalSection from "@/components/checkout/AdditionalSection";

export type CheckoutFormProps = {
  user: { id?: string } | null;
  billingAddresses: Address[];
  shippingAddresses: Address[];
  selectedBillingAddressId: string;
  setSelectedBillingAddressId: (id: string) => void;
  selectedShippingAddressId: string;
  setSelectedShippingAddressId: (id: string) => void;
  openNdisSection: boolean;
  setOpenNdisSection: Dispatch<SetStateAction<boolean>>;
  openHcpSection: boolean;
  setOpenHcpSection: Dispatch<SetStateAction<boolean>>;
  control: Control<CheckoutFormData>;
  register: UseFormRegister<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  setValue: UseFormSetValue<CheckoutFormData>;
};

export default function CheckoutForm({
  user,
  billingAddresses,
  shippingAddresses,
  selectedBillingAddressId,
  setSelectedBillingAddressId,
  selectedShippingAddressId,
  setSelectedShippingAddressId,
  openNdisSection,
  setOpenNdisSection,
  openHcpSection,
  setOpenHcpSection,
  control,
  register,
  errors,
  setValue,
}: CheckoutFormProps) {
  return (
          <div className="lg:col-span-2 space-y-6">
      <BillingSection
        user={user}
        billingAddresses={billingAddresses}
        selectedBillingAddressId={selectedBillingAddressId}
        setSelectedBillingAddressId={setSelectedBillingAddressId}
                    control={control}
        register={register}
        errors={errors}
        setValue={setValue}
      />
      <NdisSection
        openNdisSection={openNdisSection}
        setOpenNdisSection={setOpenNdisSection}
        openHcpSection={openHcpSection}
        setOpenHcpSection={setOpenHcpSection}
                    control={control}
        selectedBillingAddressId={selectedBillingAddressId}
      />
      <ShippingSection
        user={user}
        shippingAddresses={shippingAddresses}
        selectedShippingAddressId={selectedShippingAddressId}
        setSelectedShippingAddressId={setSelectedShippingAddressId}
                    control={control}
        setValue={setValue}
      />
      <AdditionalSection control={control} />
          </div>
  );
}
