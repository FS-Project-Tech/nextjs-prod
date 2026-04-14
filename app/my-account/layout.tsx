import QueryProvider from "@/components/QueryProvider";

export default function MyAccountLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
