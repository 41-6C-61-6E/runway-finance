import webpush from 'web-push';

console.log('Generating VAPID keys...');
const vapidKeys = webpush.generateVAPIDKeys();

console.log('\n--- VAPID Keys for your .env file ---\n');
process.stdout.write(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"\n`);
process.stdout.write(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"\n`);
process.stdout.write(`VAPID_SUBJECT="mailto:admin@example.com"\n`);
console.log('\n-------------------------------------\n');
console.log('Copy these lines and add them to your local .env file.');
