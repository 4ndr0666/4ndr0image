/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { openDB, IDBPDatabase } from 'idb';
import { SessionData } from '../types';

const DB_NAME = '4ndr0image-session';
const STORE_NAME = 'session';
const KEY = 'current-session';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });
  }
  return dbPromise;
};

export const saveSession = async (session: SessionData | null): Promise<void> => {
  try {
    const db = await getDb();
    if (session && session.history.length > 0) {
      await db.put(STORE_NAME, session, KEY);
      // console.log('Session saved successfully.');
    } else {
      await db.delete(STORE_NAME, KEY);
      // console.log('Session cleared.');
    }
  } catch (error) {
    console.error('Failed to save session:', error);
  }
};

export const loadSession = async (): Promise<SessionData | null> => {
  try {
    const db = await getDb();
    const session = await db.get(STORE_NAME, KEY);
    if (session) {
      console.log('Session loaded successfully.');
      return session as SessionData;
    }
    return null;
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
};

export const clearSession = async (): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, KEY);
    console.log('Session cleared from IndexedDB.');
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
};
