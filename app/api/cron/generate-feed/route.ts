import generate from "@/scripts/generate-google-feed";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (token !== process.env.GOOGLE_FEED_GENERATE_SECURITY_TOKEN!) {
      return new Response("Unauthorized", { status: 401 });
    }

    console.log("Generating feed...");
    await generate();

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ success: false, error: String(e) });
  }
}