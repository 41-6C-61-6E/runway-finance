import { NextResponse } from 'next/server';
import { addUser, findUser } from '@/lib/users';
import { debugLog, debugInfo, debugWarn, debugError } from '@/lib/debug';

export async function POST(request: Request) {
  try {
    debugLog('Register API: POST request received')
    const body = await request.json();
    const { username, password, email } = body;

    debugLog('Register API: received username:', username, 'email:', email)

    if (!username || !password) {
      debugWarn('Register API: missing username or password')
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await findUser(username);
    if (existingUser) {
      debugWarn('Register API: user already exists:', username)
      return NextResponse.json({ message: 'User already exists' }, { status: 409 });
    }

    await addUser({ username, password, email });
    debugInfo('Register API: user created successfully:', username)
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    debugError('Register API: error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
