import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}
export const globalEvents = new AppEventEmitter();
