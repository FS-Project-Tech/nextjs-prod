import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    products_api: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "1m", target: 200 },
        { duration: "1m", target: 500 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const url = `${BASE_URL}/api/products?page=1&per_page=24`;
  const res = http.get(url, {
    headers: { Accept: "application/json" },
    tags: { name: "GET /api/products" },
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
    json: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
