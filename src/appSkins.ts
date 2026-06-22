export const appSkinStorageKey = "followthrough.appSkin";

export const appSkins = [
  {
    id: "graphite",
    name: "Graphite",
    swatches: ["#0b1017", "#1f2937", "#38bdf8"],
  },
  {
    id: "harbor",
    name: "Harbor",
    swatches: ["#061a20", "#164e63", "#2dd4bf"],
  },
  {
    id: "cedar",
    name: "Cedar",
    swatches: ["#0f1a12", "#365314", "#a3e635"],
  },
  {
    id: "cinder",
    name: "Cinder",
    swatches: ["#1c1412", "#7c2d12", "#fb7185"],
  },
  {
    id: "daylight",
    name: "Daylight",
    swatches: ["#f0f4f8", "#ffffff", "#2563eb"],
  },
  {
    id: "parchment",
    name: "Parchment",
    swatches: ["#faf7f2", "#ffffff", "#d97706"],
  },
] as const;

export type AppSkinId = (typeof appSkins)[number]["id"];

type SkinStorage = Pick<Storage, "getItem" | "setItem">;

export const defaultAppSkinId: AppSkinId = "graphite";

export function isAppSkinId(value: string | null | undefined): value is AppSkinId {
  return appSkins.some((skin) => skin.id === value);
}

export function normalizeAppSkinId(value: string | null | undefined): AppSkinId {
  return isAppSkinId(value) ? value : defaultAppSkinId;
}

function browserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readStoredAppSkin(storage: SkinStorage | null = browserStorage()): AppSkinId {
  try {
    return normalizeAppSkinId(storage?.getItem(appSkinStorageKey));
  } catch {
    return defaultAppSkinId;
  }
}

export function storeAppSkin(skinId: AppSkinId, storage: SkinStorage | null = browserStorage()) {
  try {
    storage?.setItem(appSkinStorageKey, skinId);
  } catch {
    // A blocked storage write should not break the shell.
  }
}
