import fs from 'fs/promises';
import path from 'path';

// Use /tmp for Docker compatibility since process.cwd() may not be writable
const USERS_FILE = process.env.USERS_FILE || path.join('/tmp', 'users.json');

export interface User {
  username: string;
  password: string;
  email?: string;
}

export async function getUsers(): Promise<User[]> {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function addUser(user: User) {
  const users = await getUsers();
  users.push(user);
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

export async function findUser(username: string) {
  const users = await getUsers();
  return users.find(u => u.username === username);
}
