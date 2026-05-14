//D:\stage-joya\nextjs-prod-main\app\feedback\write-your-own\page.tsx

import { redirect } from "next/navigation";

/** Legacy URL — opens hub with free-form tab selected. */
export default function FeedbackWriteYourOwnRedirectPage() {
  redirect("/feedback?mode=freeform");
}
