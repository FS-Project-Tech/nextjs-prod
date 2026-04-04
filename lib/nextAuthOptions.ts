// lib/nextAuthOptions.ts
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

interface WPJwtResponse {
  token: string;
  user_email?: string;
  user_nicename?: string;
  user_display_name?: string;
}

async function loginWithWordPress(username: string, password: string) {
  const base = process.env.NEXT_PUBLIC_WP_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_WP_URL is not configured.");
  }

  const res = await fetch(`${base}/wp-json/jwt-auth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const data = (await res.json().catch(() => ({}))) as WPJwtResponse & {
    message?: string;
  };

  if (!res.ok || !data.token) {
    throw new Error(data.message || "Invalid username or password");
  }

  // Optional: fetch full user from /wp/v2/users/me to get roles, etc.
  let roles: string[] = [];
  try {
    const me = await fetch(`${base}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${data.token}`,
        Accept: "application/json",
      },
    });
    if (me.ok) {
      const userData = (await me.json()) as {
        id: number;
        name: string;
        email?: string;
        roles?: string[];
      };
      roles = Array.isArray(userData.roles) ? userData.roles : [];
      return {
        id: String(userData.id),
        name: userData.name || data.user_display_name || data.user_nicename || "",
        email: userData.email || data.user_email || "",
        roles,
        wpToken: data.token,
      };
    }
  } catch {
    // Fallback if /users/me fails: still log in with basic info
  }

  return {
    id: data.user_email || username,
    name: data.user_display_name || data.user_nicename || username,
    email: data.user_email || "",
    roles,
    wpToken: data.token,
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt", // NextAuth manages its own JWT; WP JWT is stored inside it
  },
  providers: [
    Credentials({
      name: "WordPress",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim() || "";
        const password = credentials?.password || "";

        if (!username || !password) {
          throw new Error("Username and password are required.");
        }

        // Call WordPress JWT plugin
        const user = await loginWithWordPress(username, password);
        return user; // anything returned here becomes `user` in the JWT callback
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is defined only on initial login
      if (user) {
        token.wpToken = (user as any).wpToken;
        token.roles = (user as any).roles || [];
        token.name = user.name;
        token.email = user.email;
        token.sub = user.id as string;
      }
      return token;
    },
    // async session({ session, token }) {
    //   // Expose basic user info + roles + a flag that we have a WP token
    //   if (session.user) {
    //     session.user.name = token.name ?? session.user.name;
    //     session.user.email = token.email ?? session.user.email;
    //     (session.user as any).roles = token.roles ?? [];
    //     (session.user as any).hasWpToken = Boolean(token.wpToken);
    //   }
    //   // Do NOT expose the actual WP JWT to the browser if you want max security.
    //   // If you need it on the client, you could also add: (session as any).wpToken = token.wpToken;
    //   return session;
    // },
    async session({ session, token }) {
      // Expose basic user info + roles + a flag that we have a WP token
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        (session.user as any).id = token.sub ?? undefined;
        (session.user as any).roles = token.roles ?? [];
        (session.user as any).hasWpToken = Boolean(token.wpToken);
      }

      // Expose the WP JWT on the session object so server routes can use it
      (session as any).wpToken = token.wpToken;

      return session;
    },
  },
  pages: {
    // You can keep your custom /login page and call NextAuth's signIn there
    signIn: "/login",
  },
};
