// // import { NextRequest, NextResponse } from "next/server";
// // import Typesense from "typesense";
// // import { z } from "zod";
// // import { constantTimeEqualString, readBearerToken } from "@/lib/constant-time-node";
// // import { parseJsonBody } from "@/lib/api-validation";
// // import { logInvalidAuth } from "@/lib/api-logging";
// // import { getClientIp } from "@/lib/rate-limit";

// // export const runtime = "nodejs";

// // const client = new Typesense.Client({
// //   nodes: [
// //     {
// //       host: process.env.NEXT_PUBLIC_TYPESENSE_HOST!,
// //       port: 443,
// //       protocol: "https",
// //     },
// //   ],
// //   apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!,
// // });

// // const syncBodySchema = z
// //   .array(
// //     z
// //       .object({
// //         id: z.union([z.string(), z.number()]),
// //       })
// //       .passthrough()
// //   )
// //   .min(1)
// //   .max(50_000);

// // export async function POST(req: NextRequest) {
// //   const secret = process.env.TYPESENSE_SYNC_SECRET?.trim() || process.env.SYNC_SECRET?.trim();
// //   if (!secret) {
// //     return NextResponse.json(
// //       { error: "Sync is not configured", code: "NOT_CONFIGURED" },
// //       { status: 503 }
// //     );
// //   }

// //   const presented = readBearerToken(req);
// //   if (!presented || !constantTimeEqualString(secret, presented)) {
// //     logInvalidAuth("/api/typesense/search/sync", getClientIp(req), "invalid_bearer");
// //     return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
// //   }

// //   const parsed = await parseJsonBody(req, syncBodySchema);
// //   if (parsed.ok === false) return parsed.response;

// //   const body = parsed.data;

// //   try {
// //     await client.collections("products_updated").documents().import(body, {
// //       action: "upsert",
// //     });

// //     const existingDocs = await client.collections("products_updated").documents().search({
// //       q: "*",
// //       query_by: "name",
// //       per_page: 250,
// //     });

// //     const typesenseIds =
// //       existingDocs.hits
// //         ?.map((hit: { document?: { id?: unknown } }) =>
// //           hit.document?.id != null ? String(hit.document.id) : ""
// //         )
// //         .filter((id: string) => id.length > 0) || [];

// //     const apiIds = body.map((p) => String(p.id));

// //     const idsToDelete = typesenseIds.filter((id: string) => !apiIds.includes(id));

// //     if (idsToDelete.length > 0) {
// //       await client
// //         .collections("products_updated")
// //         .documents()
// //         .delete({
// //           filter_by: `id:=[${idsToDelete.join(",")}]`,
// //         });
// //     }

// //     return NextResponse.json({
// //       success: true,
// //       upserted: body.length,
// //       deleted: idsToDelete.length,
// //     });
// //   } catch (err) {
// //     console.error("[typesense/sync]", err);
// //     return NextResponse.json({ error: "Sync failed", code: "SYNC_FAILED" }, { status: 500 });
// //   }
// // }

// import { NextRequest, NextResponse } from "next/server";
// import Typesense from "typesense";
// import { z } from "zod";
// import { constantTimeEqualString, readBearerToken } from "@/lib/constant-time-node";
// import { parseJsonBody } from "@/lib/api-validation";
// import { logInvalidAuth } from "@/lib/api-logging";
// import { getClientIp } from "@/lib/rate-limit";
 
// export const runtime = "nodejs";
 
// const client = new Typesense.Client({
//   nodes: [
//     {
//       host: process.env.NEXT_PUBLIC_TYPESENSE_HOST!,
//       port: 443,
//       protocol: "https",
//     },
//   ],
//   apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!,
// });
 
// const syncBodySchema = z
//   .array(
//     z
//       .object({
//         id: z.union([z.string(), z.number()]),
//       })
//       .passthrough()
//   )
//   .min(1)
//   .max(50_000);
 
// export async function POST(req: NextRequest) {
//   const secret = process.env.TYPESENSE_SYNC_SECRET?.trim() || process.env.SYNC_SECRET?.trim();
//   if (!secret) {
//     return NextResponse.json(
//       { error: "Sync is not configured", code: "NOT_CONFIGURED" },
//       { status: 503 }
//     );
//   }
 
//   const presented = readBearerToken(req);
//   if (!presented || !constantTimeEqualString(secret, presented)) {
//     logInvalidAuth("/api/typesense/search/sync", getClientIp(req), "invalid_bearer");
//     return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
//   }
 
//   const parsed = await parseJsonBody(req, syncBodySchema);
//   if (parsed.ok === false) return parsed.response;
 
//   const body = parsed.data;
 
//   try {
//     await client.collections("products_updated").documents().import(body, {
//       action: "upsert",
//     });
 
//     const existingDocs = await client.collections("products_updated").documents().search({
//       q: "*",
//       query_by: "name",
//       per_page: 250,
//     });
 
//     const typesenseIds =
//       existingDocs.hits
//         ?.map((hit: { document?: { id?: unknown } }) =>
//           hit.document?.id != null ? String(hit.document.id) : ""
//         )
//         .filter((id: string) => id.length > 0) || [];
 
//     const apiIds = body.map((p) => String(p.id));
 
//     const idsToDelete = typesenseIds.filter((id: string) => !apiIds.includes(id));
 
//     if (idsToDelete.length > 0) {
//       await client
//         .collections("products_updated")
//         .documents()
//         .delete({
//           filter_by: `id:=[${idsToDelete.join(",")}]`,
//         });
//     }
 
//     return NextResponse.json({
//       success: true,
//       upserted: body.length,
//       deleted: idsToDelete.length,
//     });
//   } catch (err) {
//     console.error("[typesense/sync]", err);
//     return NextResponse.json({ error: "Sync failed", code: "SYNC_FAILED" }, { status: 500 });
//   }
// }



import { NextRequest, NextResponse } from "next/server";

const TYPESENSE_HOST = process.env.NEXT_PUBLIC_TYPESENSE_HOST!;
const TYPESENSE_API_KEY = process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { product_id } = await req.json();

    // 1. Fetch product from WP API
    const res = await fetch(
      `${process.env.WP_URL}/wp-json/custom/v1/typesense-products`
    );

    const products = await res.json();

    const product = products.find((p: any) => p.id == product_id);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 2. Send to Typesense
    const typesenseRes = await fetch(
      `${TYPESENSE_HOST}/collections/products_updated/documents`,
      {
        method: "POST",
        headers: {
          "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(product),
      }
    );

    const data = await typesenseRes.json();

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}



