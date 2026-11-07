self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Present so the page can be installed. Requests stay on the network.
self.addEventListener("fetch", () => {});
