import "server-only";

import axios, { AxiosRequestHeaders } from "axios";
import { validateEnvironmentVariables } from "../env-validation";
import {
  normalizeError,
  getErrorMessage,
  hasAxiosResponse,
  getAxiosErrorDetails,
  isTimeoutError,
} from "@/lib/utils/errors";

if (typeof window === "undefined") {
  const envCheck = validateEnvironmentVariables();
  if (!envCheck.valid) {
    if (envCheck.missing.length > 0) {
      console.error("❌ Missing required environment variables:", envCheck.missing.join(", "));
    }
    if (envCheck.invalid.length > 0) {
      console.error("❌ Invalid environment variables:");
      envCheck.invalid.forEach(({ name, reason }) => {
        console.error(`  - ${name}: ${reason}`);
      });
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Environment variable validation failed. Please check your .env.local file.");
    }
  }
}

const API_URL = process.env.WC_API_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

/** Default 45s — slow shared Woo hosts often exceed 30s on order writes; override with WOOCOMMERCE_API_TIMEOUT. */
const WOOCOMMERCE_TIMEOUT = parseInt(process.env.WOOCOMMERCE_API_TIMEOUT || "45000", 10);

const wcAPI = axios.create({
  baseURL: API_URL,
  auth: {
    username: CONSUMER_KEY || "",
    password: CONSUMER_SECRET || "",
  },
  timeout: WOOCOMMERCE_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

wcAPI.defaults.params = {
  ...(wcAPI.defaults.params || {}),
  consumer_key: CONSUMER_KEY || "",
  consumer_secret: CONSUMER_SECRET || "",
};

if (typeof window === "undefined") {
  try {
    const { fetchMonitor } = require("../monitoring/fetch-instrumentation");

    wcAPI.interceptors.request.use(
      async (config) => {
        (config as { __startTime?: number }).__startTime = Date.now();

        try {
          const { getWCSessionHeaders } = await import("../woocommerce-session");
          const sessionHeaders = await getWCSessionHeaders();
          if (sessionHeaders["X-WC-Session"]) {
            if (!config.headers) {
              config.headers = {} as AxiosRequestHeaders;
            }
            config.headers["X-WC-Session"] = sessionHeaders["X-WC-Session"];
          }
        } catch {
          /* session optional */
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    wcAPI.interceptors.response.use(
      (response) => {
        const config = response.config as { __startTime?: number; url?: string };
        if (config.__startTime) {
          const duration = Date.now() - config.__startTime;
          const url = `${wcAPI.defaults.baseURL}${config.url || ""}`;
          fetchMonitor.track(
            url,
            response.config.method?.toUpperCase() || "GET",
            duration,
            response.status,
            (config as { __route?: string }).__route,
            false,
            undefined
          );
        }
        return response;
      },
      (error: unknown) => {
        const normalized = normalizeError(error);

        if (hasAxiosResponse(error)) {
          const details = getAxiosErrorDetails(error);
          const config = error.config as {
            __startTime?: number;
            url?: string;
            method?: string;
            __route?: string;
          };

          if (config?.__startTime) {
            const duration = Date.now() - config.__startTime;
            const url = `${wcAPI.defaults.baseURL}${details.url || ""}`;
            fetchMonitor.track(
              url,
              details.method?.toUpperCase() || "GET",
              duration,
              normalized.status,
              config.__route,
              false,
              normalized.message
            );
          }
        }

        return Promise.reject(error);
      }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Performance monitoring not available:", error);
    }
  }
}

wcAPI.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeError(error);
    if (hasAxiosResponse(error)) {
      const details = getAxiosErrorDetails(error);
      const status = details.status;
      const data = details.data;
      const url = details.url || "Unknown URL";

      if (status === 401 || status === 403) {
        console.error("WooCommerce API Authentication Error:", {
          status,
          message:
            (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
            "Invalid API credentials",
          code: data && typeof data === "object" && "code" in data ? data.code : undefined,
          url,
        });
      } else if (status === 500) {
        const errorMessage =
          (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
          getErrorMessage(error) ||
          "";
        const isKnownBackendIssue =
          typeof errorMessage === "string" &&
          (errorMessage.includes("Redis") ||
            errorMessage.includes("object-cache") ||
            errorMessage.includes("wp_die"));

        if (isKnownBackendIssue) {
          if (process.env.NODE_ENV === "development") {
            console.warn("WooCommerce Backend Issue (handled gracefully):", {
              status,
              message:
                typeof errorMessage === "string"
                  ? errorMessage.substring(0, 150)
                  : "Backend configuration issue",
              url,
              code: data && typeof data === "object" && "code" in data ? data.code : undefined,
            });
          }
          return Promise.reject(error);
        }

        const errorDetails: Record<string, unknown> = {
          status: status || "Unknown",
          statusText: details.statusText || "Internal Server Error",
          url: url,
          message:
            (data &&
            typeof data === "object" &&
            "message" in data &&
            typeof data.message === "string"
              ? data.message
              : undefined) ||
            getErrorMessage(error) ||
            "Internal server error",
        };

        if (data && typeof data === "object" && "code" in data) {
          errorDetails.code = data.code;
        }

        if (error.config?.params && Object.keys(error.config.params).length > 0) {
          errorDetails.params = error.config.params;
        }

        if (data !== undefined && data !== null) {
          if (typeof data === "string" && data.trim().length > 0) {
            errorDetails.responseBody = data;
          } else if (typeof data === "object") {
            const dataKeys = Object.keys(data);
            if (dataKeys.length > 0) {
              errorDetails.responseData = data;
            } else {
              errorDetails.note = "Server returned empty object response";
            }
          } else if (data !== "") {
            errorDetails.responseData = String(data);
          }
        }

        console.error("WooCommerce API Server Error:", JSON.stringify(errorDetails, null, 2));
      } else {
        const code =
          data && typeof data === "object" && "code" in data
            ? (data as { code?: string }).code
            : undefined;
        const isRecoverable404 =
          status === 404 &&
          (code === "rest_no_route" || code === "woocommerce_rest_product_invalid_id");
        if (isRecoverable404) {
          if (process.env.NODE_ENV === "development") {
            const label =
              code === "woocommerce_rest_product_invalid_id"
                ? "WooCommerce product not found (likely stale cart item)"
                : "WooCommerce API route not found (fallback may be used)";
            console.warn(`${label}:`, url);
          }
          return Promise.reject(error);
        }
        const errorInfo: Record<string, unknown> = {
          status: normalized.status || "Unknown",
          statusText: details.statusText || "Error",
          url: url,
          message: normalized.message || `HTTP ${normalized.status} error`,
        };
        if (code !== undefined) {
          errorInfo.code = code;
        }
        if (data !== undefined && data !== null) {
          if (typeof data === "string" && data.trim().length > 0) {
            errorInfo.responseBody = data;
          } else if (typeof data === "object" && Object.keys(data).length > 0) {
            errorInfo.responseData = data;
          } else if (typeof data === "object" && Object.keys(data).length === 0) {
            errorInfo.note = "Server returned empty object response";
          }
        }
        console.error("WooCommerce API Error:", JSON.stringify(errorInfo, null, 2));
      }
    } else if (hasAxiosResponse(error)) {
      const isTimeout =
        isTimeoutError(error) ||
        (hasAxiosResponse(error) &&
          ["ECONNABORTED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(
            getAxiosErrorDetails(error).code || ""
          ));

      if (process.env.NODE_ENV === "development" && !isTimeout) {
        const errorInfo: Record<string, unknown> = {
          message: getErrorMessage(error) || "No response from server",
          url: error.config?.url || "Unknown URL",
        };

        if (error.code) {
          errorInfo.code = error.code;
        }
        if (error.config?.method) {
          errorInfo.method = error.config.method;
        }

        if (errorInfo.message && errorInfo.url) {
          console.warn("WooCommerce API Network Error (handled gracefully):", errorInfo);
        }
      }
    } else {
      console.error(
        "WooCommerce API Request Setup Error:",
        getErrorMessage(error) || "Unknown error"
      );
    }
    return Promise.reject(error);
  }
);

export default wcAPI;
