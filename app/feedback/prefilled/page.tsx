//D:\stage-joya\nextjs-prod-main\app\feedback\prefilled\page.tsx

import { redirect } from "next/navigation";

/** Legacy URL — feedback lives on `/feedback` with in-page switching. */
export default function FeedbackPrefilledRedirectPage() {
  redirect("/feedback");
}
