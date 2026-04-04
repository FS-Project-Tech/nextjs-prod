// next-auth.d.ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;
      name?: string | null;
      email?: string | null;
      roles?: string[];
      hasWpToken?: boolean;
    };
  }

  interface User {
    roles?: string[];
    wpToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    wpToken?: string;
    roles?: string[];
  }
}
