const CACHE='piano-alimentare-v6',ASSETS=['./','./index.html','./styles.css','./app.js','./diary.css','./diary.js','./diary-backup.css','./diary-backup.js','./food-search.css','./food-search.js','./mobile-v5.css','./mobile-v6.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request))));

