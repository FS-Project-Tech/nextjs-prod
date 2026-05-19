"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  CHECKOUT_PLACING_MESSAGE_INTERVAL_MS,
  getCheckoutPlacingMessages,
  type CheckoutPlacingPaymentMethod,
} from "@/lib/checkout/placingMessages";

export type CheckoutPlacingOverlayProps = {
  paymentMethod: CheckoutPlacingPaymentMethod;
};

export default function CheckoutPlacingOverlay({
  paymentMethod,
}: CheckoutPlacingOverlayProps) {
  const messages = useMemo(() => getCheckoutPlacingMessages(paymentMethod), [paymentMethod]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [paymentMethod]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, messages.length - 1));
    }, CHECKOUT_PLACING_MESSAGE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [messages.length]);

  const message = messages[index] ?? messages[0];

  return (
    <motion.div
      className="w-full max-w-md rounded-lg bg-white/90 px-6 py-5 text-center shadow-lg ring-1 ring-gray-200"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <motion.div
        className="mx-auto mb-4 h-1 w-full overflow-hidden rounded-full bg-gray-200"
        aria-hidden
      >
        <motion.div
          className="h-full rounded-full bg-teal-600"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{
            duration: (messages.length * CHECKOUT_PLACING_MESSAGE_INTERVAL_MS) / 1000,
            ease: "linear",
          }}
        />
      </motion.div>

      <div className="min-h-[3.25rem] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            role="status"
            aria-live="polite"
            className="text-base font-medium leading-snug text-gray-900"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="mt-2 text-xs text-gray-600">Please do not refresh or close this page.</p>
    </motion.div>
  );
}
