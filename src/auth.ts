import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google" || !user.email) {
        return false;
      }

      const googleId = account.providerAccountId;

      let dbUser = await prisma.users.findFirst({
        where: {
          google_id: googleId,
          deleted_at: null,
        },
      });

      // First-login claim: el seed crea los usuarios autorizados por email
      // sin google_id. La primera vez que logueás con Google, emparejamos por
      // email y tomamos el slot escribiendo el google_id en la fila. Logins
      // posteriores ya entran por la rama de google_id de arriba.
      if (!dbUser) {
        const byEmail = await prisma.users.findFirst({
          where: {
            email: user.email,
            deleted_at: null,
            google_id: null,
          },
        });
        if (byEmail) {
          dbUser = await prisma.users.update({
            where: { id: byEmail.id },
            data: {
              google_id: googleId,
              image_url: user.image,
              last_login_at: new Date(),
            },
          });
          return true;
        }
      }

      if (!dbUser) {
        // En dev permitimos cualquier cuenta para no tener que sembrar
        // usuarios al toquetear local. En prod rechazamos: si no estás en la
        // tabla users, no entrás.
        if (process.env.NODE_ENV === "development") {
          return true;
        }
        return false; // 🚫 403 → AccessDenied
      }

      await prisma.users.update({
        where: { id: dbUser.id },
        data: {
          image_url: user.image,
          last_login_at: new Date(),
        },
      });

      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        // First login, fetch user to get role_id
        const dbUser = await prisma.users.findUnique({
          where: { email: token.email! },
        });
        if (dbUser) {
          token.role_id = dbUser.role_id;
          token.google_id = dbUser.google_id || "";
          token.db_id = dbUser.id.toString(); // Store DB ID
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role_id = token.role_id as number;
        // Use token.sub as id if available (standard), or token.id if we set it manually.
        // Google provider usually sets "sub" in token.
        // However, we want the DB id (Int), not the Google ID string.
        // We need to pass dbUser.id to token.
        // But wait, token.sub is usually string.
        // Let's attach our db id to token as "db_id" or similar to avoid conflict if needed, or just "id".
        session.user.id = (token.db_id as string) || session.user.id;
      }
      return session;
    },
  },
});
