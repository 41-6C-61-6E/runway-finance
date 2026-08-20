export const auth = () => Promise.resolve({ user: { id: 'test-user-id' } });
export const handlers = { GET: () => {}, POST: () => {} };
export const signIn = () => {};
export const signOut = () => {};
export default function NextAuth() {
  return { handlers, signIn, signOut, auth };
}
