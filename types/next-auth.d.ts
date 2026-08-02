import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    dek?: string;
    dataUserId?: string;
  }

  interface Session {
    user: {
      id: string;
      dek?: string;
      dataUserId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    dek?: string;
    dataUserId?: string;
  }
}
