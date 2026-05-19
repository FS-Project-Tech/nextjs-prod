import * as yup from "yup";

export const priceMatchFormSchema = yup.object({
  billing_email: yup.string().email("Enter a valid email").required("Email is required"),
  billing_phone: yup
    .string()
    .matches(/^\d{10}$/, "Enter a 10-digit phone number")
    .required("Phone is required"),
  billing_first_name: yup.string().trim().required("First name is required"),
  billing_last_name: yup.string().trim().required("Last name is required"),
  ask_price: yup
    .string()
    .trim()
    .required("Ask price is required")
    .test("positive", "Enter a valid price", (v) => {
      const n = parseFloat(String(v || "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) && n > 0;
    }),
  price_includes_gst: yup.boolean().default(false),
  evidence_mode: yup
    .mixed<"link" | "file" | "photo">()
    .oneOf(["link", "file", "photo"])
    .required(),
  competitor_link: yup.string().when("evidence_mode", {
    is: "link",
    then: (s) => s.trim().url("Enter a valid URL").required("Competitor link is required"),
    otherwise: (s) => s.optional(),
  }),
  notes: yup.string().optional(),
});

export type PriceMatchFormData = yup.InferType<typeof priceMatchFormSchema>;

export const PRICE_MATCH_FORM_DEFAULTS: PriceMatchFormData = {
  billing_email: "",
  billing_phone: "",
  billing_first_name: "",
  billing_last_name: "",
  ask_price: "",
  price_includes_gst: false,
  evidence_mode: "link",
  competitor_link: "",
  notes: "",
};
