import { NextResponse } from 'next/server';
import { addUser, findUser, createUserEncryptionKeys } from '@/lib/users';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';
import { seedUserCategories } from '@/lib/db/seed-categories';
import { seedUserDefaultRules } from '@/lib/db/seed-default-rules';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, email, pin } = body;

    logger.debug('Register API: request received', { username, email })

    if (!username || !password) {
      logger.warn('Register API: missing username or password')
      return NextResponse.json({ message: 'Username and password are required' }, { status: 400 });
    }

    if (process.env.ALLOW_REGISTRATION === 'false') {
      logger.warn('Register API: registration is disabled')
      return NextResponse.json({ message: 'Registration is currently disabled' }, { status: 403 });
    }

    const requiredPin = process.env.REGISTRATION_PIN;
    if (requiredPin && requiredPin.length > 0) {
      if (!pin) {
        logger.warn('Register API: missing registration PIN')
        return NextResponse.json({ message: 'Registration PIN is required' }, { status: 403 });
      }
      const pinBuffer = Buffer.from(pin);
      const requiredPinBuffer = Buffer.from(requiredPin);
      if (pinBuffer.length !== requiredPinBuffer.length || !timingSafeEqual(pinBuffer, requiredPinBuffer)) {
        logger.warn('Register API: invalid registration PIN')
        return NextResponse.json({ message: 'Invalid registration PIN' }, { status: 403 });
      }
    }

    const existingUser = await findUser(username);
    if (existingUser) {
      logger.warn('Register API: user already exists', { username })
      return NextResponse.json({ message: 'User already exists' }, { status: 409 });
    }

    await addUser({ username, password, email });
    await createUserEncryptionKeys(username, password);
    await seedUserCategories(username);
    await seedUserDefaultRules(username);
    logger.info('Register API: user created', { username })
    return NextResponse.json({ message: 'User created successfully' }, { status: 201 });
  } catch (error) {
    logger.error('Register API: error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
