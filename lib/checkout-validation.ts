import * as yup from "yup";

export const billingSchema = yup.object().shape({
  first_name: yup.string().required("First name is required"),
  last_name: yup.string().required("Last name is required"),
  company: yup.string(),
  address_1: yup.string().required("Address is required"),
  address_2: yup.string(),
  city: yup.string().required("City is required"),
  state: yup.string().required("State is required"),
  postcode: yup.string().required("Postcode is required"),
  country: yup.string().required("Country is required"),
  email: yup.string().email("Invalid email address").required("Email is required"),
  phone: yup.string().required("Phone is required"),
});

export const shippingSchema = yup.object().shape({
  first_name: yup.string().required("First name is required"),
  last_name: yup.string().required("Last name is required"),
  company: yup.string(),
  address_1: yup.string().required("Address is required"),
  address_2: yup.string(),
  city: yup.string().required("City is required"),
  state: yup.string().required("State is required"),
  postcode: yup.string().required("Postcode is required"),
  country: yup.string().required("Country is required"),
});

export const checkoutSchema = yup.object().shape({
  billing: billingSchema,
  shipping: shippingSchema,
  shippingMethod: yup.object().nullable().required("Please select a shipping method"),
  paymentMethod: yup.string().required("Please select a payment method"),
  termsAccepted: yup.boolean().oneOf([true], "You must accept the terms and conditions"),
  shipToDifferentAddress: yup.boolean(),
  coupon: yup.string(),
  deliveryAuthority: yup.string(),
  deliveryInstructions: yup.string(),
  subscribeNewsletter: yup.boolean(),
});

export type CheckoutFormData = yup.InferType<typeof checkoutSchema>;

