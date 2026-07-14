self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? {};
  const title = payload.title ?? "Followthrough";
  const body = payload.body ?? "You have a new update.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/brand/followthrough-icon.svg",
      tag: payload.tag,
      data: payload.url ? { url: payload.url } : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(clients.openWindow(url));
});
