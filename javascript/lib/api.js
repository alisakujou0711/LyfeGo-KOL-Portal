// Frontend-only stub. Replace the body of `submitRegistration` with a real
// request once the backend exists — the pages only depend on the promise.
//
// payload shape:
// {
//   opportunityId: string,
//   sessionId: string | null,        // null for campaigns without sessions (e.g. Paid)
//   fullName: string,
//   instagram: string,               // without leading "@"
//   tiktok: string,                  // optional, without leading "@"
//   email: string,
//   phone: string,
//   note: string,                    // optional
// }

export async function submitRegistration(payload) {
  await new Promise((resolve) => setTimeout(resolve, 900))
  if (import.meta.env.DEV) console.info('[stub] submitRegistration', payload)
  return { ok: true, id: `reg_${Date.now().toString(36)}` }
}
