import { NextResponse } from 'next/server';
import { addUser, findUser } from '@/lib/users';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, email } = body;

    if (!username || !password) {
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await findUser(username);
    if (existingUser) {
      return NextResponse.json({ message: 'User already exists' }, { status: 409 });
    }

    await addUser({ username, password, email });
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
