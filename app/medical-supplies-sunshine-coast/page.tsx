import {
  createMedicalSuppliesLocationPage,
  generateMedicalSuppliesLocationMetadata,
  type MedicalSuppliesLocationConfig,
} from "@/lib/medical-supplies-location";

const config: MedicalSuppliesLocationConfig = {
  wpSlug: "medical-supplies-sunshine-coast",
  fallbackTitle: "Medical Supplies Sunshine Coast",
};

export const dynamic = "force-dynamic";

export const generateMetadata = () => generateMedicalSuppliesLocationMetadata(config);

export default createMedicalSuppliesLocationPage(config);
