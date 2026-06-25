import webpush from 'web-push';

console.log('Generating VAPID keys...');
const vapidKeys = webpush.generateVAPIDKeys();

console.log('\n--- VAPID Keys for your .env file ---\n');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:admin@example.com"`);
console.log('\n-------------------------------------\n');
console.log('Copy these lines and add them to your local .env file.');
