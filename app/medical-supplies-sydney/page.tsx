import {
  createMedicalSuppliesLocationPage,
  generateMedicalSuppliesLocationMetadata,
  type MedicalSuppliesLocationConfig,
} from "@/lib/medical-supplies-location";

const config: MedicalSuppliesLocationConfig = {
  wpSlug: "medical-supplies-sydney",
  fallbackTitle: "Medical Supplies Sydney",
};

export const dynamic = "force-dynamic";

export const generateMetadata = () => generateMedicalSuppliesLocationMetadata(config);

export default createMedicalSuppliesLocationPage(config);
