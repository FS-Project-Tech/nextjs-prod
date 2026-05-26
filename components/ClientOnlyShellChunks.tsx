"use client";

import dynamic from "next/dynamic";

const NavigationProgress = dynamic(() => import("@/components/NavigationProgress"), {
  ssr: false,
});
const MiniCartDrawer = dynamic(() => import("@/components/MiniCartDrawer"), { ssr: false });
const QuoteDrawer = dynamic(() => import("@/components/quote/QuoteDrawer"), { ssr: false });
const PriceMatchDrawer = dynamic(() => import("@/components/price-match/PriceMatchDrawer"), {
  ssr: false,
});
const BottomNav = dynamic(() => import("@/components/BottomNav"), { ssr: false });
const PWARegister = dynamic(() => import("@/components/PWARegister"), { ssr: false });
const AIOrderAssistant = dynamic(() => import("@/components/AIOrderAssistant"), { ssr: false });

export function ClientNavigationProgress() {
  return <NavigationProgress />;
}

export function ClientCartNavPWA() {
  return (
    <>
      <MiniCartDrawer />
      <QuoteDrawer />
      <PriceMatchDrawer />
      <BottomNav />
      <PWARegister />
      <AIOrderAssistant />
    </>
  );
}
