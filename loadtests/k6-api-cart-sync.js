import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    cart_sync: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 100 },
        { duration: "1m", target: 250 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const PRODUCT_ID = Number(__ENV.PRODUCT_ID || "0");

export default function () {
  if (!PRODUCT_ID) {
    // Require explicit product id so we don't spam invalid products.
    sleep(1);
    return;
  }

  const url = `${BASE_URL}/api/cart`;
  const payload = JSON.stringify({
    items: [
      {
        id: String(PRODUCT_ID),
        productId: PRODUCT_ID,
        variationId: null,
        name: "LoadTest",
        slug: "loadtest",
        price: "0",
        qty: 1,
        sku: null,
      },
    ],
  });

  const res = http.post(url, payload, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    tags: { name: "POST /api/cart" },
  });

  check(res, {
    "status is 200 or 400": (r) => r.status === 200 || r.status === 400,
  });

  sleep(1);
}
