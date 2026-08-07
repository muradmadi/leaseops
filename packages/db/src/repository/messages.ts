import { eq, desc } from 'drizzle-orm';
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

export async function updateMessage(id: string, text: string): Promise<Message | undefined> {
  const [updated] = await db
    .update(messages)
    .set({ text, updatedAt: new Date() })
    .where(eq(messages.id, id))
    .returning();
  return updated;
}

export async function removeMessage(id: string): Promise<Message | undefined> {
  const [deleted] = await db.delete(messages).where(eq(messages.id, id)).returning();
  return deleted;
}
