import {
  createMedicalSuppliesLocationPage,
  generateMedicalSuppliesLocationMetadata,
  type MedicalSuppliesLocationConfig,
} from "@/lib/medical-supplies-location";

const config: MedicalSuppliesLocationConfig = {
  wpSlug: "medical-supplies-newcastle",
  fallbackTitle: "Medical Supplies Newcastle",
};

export const dynamic = "force-dynamic";

export const generateMetadata = () => generateMedicalSuppliesLocationMetadata(config);

export default createMedicalSuppliesLocationPage(config);
