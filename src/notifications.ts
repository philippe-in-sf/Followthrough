import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client";

type NotificationStatus = "unsupported" | "disabled" | "enabled";

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function canNotify() {
  return "Notification" in window;
}

export function useTaskAssignmentNotifications(enabled: boolean) {
  const [status, setStatus] = useState<NotificationStatus>(() =>
    canNotify() ? "disabled" : "unsupported",
  );
  const lastNotificationId = useRef(0);

  const enableNotifications = useCallback(async () => {
    if (!canNotify()) {
      setStatus("unsupported");
      return;
    }

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus("disabled");
      return;
    }

    setStatus("enabled");

    if ("serviceWorker" in navigator && "PushManager" in window) {
      const { publicVapidKey } = await api.notifications.config();
      if (!publicVapidKey) return;

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        }));
      await api.notifications.savePushSubscription(subscription.toJSON());
    }
  }, []);

  useEffect(() => {
    if (!enabled || !canNotify()) return;
    setStatus(Notification.permission === "granted" ? "enabled" : "disabled");
  }, [enabled]);

  useEffect(() => {
    if (!enabled || status !== "enabled") return;
    let active = true;

    async function pollAssignments() {
      const result = await api.notifications.taskAssignments(lastNotificationId.current);
      if (!active) return;

      for (const notification of result.notifications) {
        lastNotificationId.current = Math.max(lastNotificationId.current, notification.id);
        new Notification(`Task ${notification.taskPublicId} assigned to you`, {
          body: notification.taskDescription,
          tag: `task-assignment-${notification.taskPublicId}`,
        });
        await api.notifications.markTaskAssignmentRead(notification.id).catch(() => undefined);
      }
    }

    void pollAssignments();
    const timer = window.setInterval(() => {
      void pollAssignments();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, status]);

  return { notificationStatus: status, enableNotifications };
}
