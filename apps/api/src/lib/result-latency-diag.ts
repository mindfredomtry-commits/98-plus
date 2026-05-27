/** Result latency diagnostics only — no business logic. */

export function banParticipantRole(
  userId: string,
  senderId: string,
  receiverId: string,
): 'sender' | 'receiver' {
  return userId === senderId ? 'sender' : 'receiver';
}

export function logResultLatency(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.log(event, fields);
}
