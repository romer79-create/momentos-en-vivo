// Retire the old offline cache so sensitive pages/photos are not retained.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys()) if(key.startsWith('momentos-')) await caches.delete(key);
 await self.clients.claim(); await self.registration.unregister();
})()));
