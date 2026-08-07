import { db } from './src/client';
import { messages } from './src/schema/messages';

async function main() {
  await db.delete(messages);
  console.log('Cleared all messages from the database.');
}

main().catch(console.error);
