"use client";

interface HomePageClientProps {
  children: React.ReactNode;
  continenceSlug: string;
}

export default function HomePageClient({ children }: HomePageClientProps) {
  // This component is just a wrapper - search handling is done in the server component
  return <>{children}</>;
}

