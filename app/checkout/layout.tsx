import QueryProvider from "@/components/QueryProvider";

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
