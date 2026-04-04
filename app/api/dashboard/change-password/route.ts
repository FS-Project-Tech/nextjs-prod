// import { NextRequest, NextResponse } from 'next/server';
// import { getWpBaseUrl } from '@/lib/auth';
// import { getAuthToken } from '@/lib/auth-server';

// /**
//  * POST /api/dashboard/change-password
//  * Change authenticated user's password.
//  * Requires WordPress to expose a password-change endpoint (e.g. custom or plugin);
//  * otherwise returns 501.
//  */
// export async function POST(req: NextRequest) {
//   try {
//     const token = await getAuthToken();
//     if (!token) {
//       return NextResponse.json(
//         { error: 'Not authenticated' },
//         { status: 401 }
//       );
//     }

//     const body = await req.json();
//     const { current_password, new_password } = body;

//     if (!current_password || !new_password) {
//       return NextResponse.json(
//         { error: 'Current password and new password are required' },
//         { status: 400 }
//       );
//     }

//     if (new_password.length < 6) {
//       return NextResponse.json(
//         { error: 'New password must be at least 6 characters' },
//         { status: 400 }
//       );
//     }

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       return NextResponse.json(
//         { error: 'WordPress URL not configured' },
//         { status: 500 }
//       );
//     }

//     // Get current user to verify and then update
//     const meRes = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       cache: 'no-store',
//     });

//     if (!meRes.ok) {
//       return NextResponse.json(
//         { error: 'Failed to get user' },
//         { status: 401 }
//       );
//     }

//     const user = await meRes.json();

//     // Try custom WordPress endpoint if your site exposes one, e.g.:
//     // POST /wp-json/custom-auth/v1/change-password
//     // Body: { current_password, new_password }
//     const changeRes = await fetch(`${wpBase}/wp-json/custom-auth/v1/change-password`, {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         current_password,
//         new_password,
//         user_id: user.id,
//       }),
//       cache: 'no-store',
//     });

//     if (changeRes.ok) {
//       return NextResponse.json({ message: 'Password updated successfully' });
//     }

//     // If no custom endpoint or it failed, return 501 so frontend can show a message
//     const errBody = await changeRes.json().catch(() => ({}));
//     const errMessage = (errBody as { message?: string; error?: string }).message ?? (errBody as { message?: string; error?: string }).error;
//     const message =
//       changeRes.status === 404
//         ? 'Password change is not configured. Add the WordPress endpoint from docs/wordpress-change-password-endpoint.php to your theme, or use the "Forgot password" link on the login page.'
//         : errMessage || 'Failed to update password';

//     return NextResponse.json(
//       { error: message },
//       { status: changeRes.status === 404 ? 501 : changeRes.status }
//     );
//   } catch (error) {
//     console.error('Change password error:', error);
//     return NextResponse.json(
//       { error: 'An error occurred while changing password' },
//       { status: 500 }
//     );
//   }
// }
import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { getToken } from "next-auth/jwt";

// POST /api/dashboard/change-password
export async function POST(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const meRes = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!meRes.ok) {
      return NextResponse.json({ error: "Failed to get user" }, { status: 401 });
    }

    const user = await meRes.json();

    const changeRes = await fetch(`${wpBase}/wp-json/custom-auth/v1/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        current_password,
        new_password,
        user_id: user.id,
      }),
      cache: "no-store",
    });

    if (changeRes.ok) {
      return NextResponse.json({ message: "Password updated successfully" });
    }

    const errBody = await changeRes.json().catch(() => ({}));
    const errMessage =
      (errBody as { message?: string; error?: string }).message ??
      (errBody as { message?: string; error?: string }).error;
    const message =
      changeRes.status === 404
        ? "Password change is not configured. Add the WordPress endpoint from docs/wordpress-change-password-endpoint.php to your theme, or use the 'Forgot password' link on the login page."
        : errMessage || "Failed to update password";

    return NextResponse.json(
      { error: message },
      { status: changeRes.status === 404 ? 501 : changeRes.status }
    );
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "An error occurred while changing password" },
      { status: 500 }
    );
  }
}
