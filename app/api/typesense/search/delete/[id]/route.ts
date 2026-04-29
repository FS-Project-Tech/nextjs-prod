import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = encodeURIComponent(params.id || "");
  return NextResponse.json(
    {
      error: "Deprecated endpoint",
      code: "ENDPOINT_DEPRECATED",
      message:
        "Use DELETE /api/typesense/search/delete?id=<id> with Authorization: Bearer <TYPESENSE_DELETE_SECRET>.",
      secureEndpoint: `/api/typesense/search/delete?id=${id}`,
    },
    { status: 410 }
  );
}