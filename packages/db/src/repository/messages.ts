import { eq } from 'drizzle-orm';
import { db } from '../client';
import { messages, type Message, type NewMessage } from '../schema/messages';

export async function findMessagesByApartmentId(apartmentId: string): Promise<Message[]> {
  return db.select().from(messages).where(eq(messages.apartmentId, apartmentId)).orderBy(messages.createdAt);
}

export async function createMessage(data: NewMessage): Promise<Message> {
  const result = await db.insert(messages).values(data).returning();
  return result[0];
}

export async function removeMessagesByApartmentId(apartmentId: string): Promise<void> {
  await db.delete(messages).where(eq(messages.apartmentId, apartmentId));
}

/**
 * Patches a message's text, its status, or both.
 *
 * `status` is what separates an AI draft you actually sent (`'sent'`) from one
 * still sitting on screen (`'ready'`). That distinction is load-bearing: the
 * reply prompt builds the tenant's stated position out of sent messages only, so
 * a draft that was never used must not be able to become a fact about them.
 * It rides the existing column rather than a new one — no migration, and the
 * chat already renders it as a badge.
 */
export async function updateMessage(
  id: string,
  patch: { text?: string; status?: string }
): Promise<Message | undefined> {
  const changes: Partial<Message> = { updatedAt: new Date() };
  if (patch.text !== undefined) changes.text = patch.text;
  if (patch.status !== undefined) changes.status = patch.status;

  const [updated] = await db.update(messages).set(changes).where(eq(messages.id, id)).returning();
  return updated;
}

export async function removeMessage(id: string): Promise<Message | undefined> {
  const [deleted] = await db.delete(messages).where(eq(messages.id, id)).returning();
  return deleted;
}
