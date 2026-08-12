export type RuntimeKind = "browser" | "electron" | "android";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
  inkwellDesktop?: unknown;
};

export function getRuntimeKind(): RuntimeKind {
  if (typeof window === "undefined") return "browser";

  const runtimeWindow = window as CapacitorWindow;
  if (runtimeWindow.inkwellDesktop) return "electron";

  const capacitor = runtimeWindow.Capacitor;
  if (capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === "android") {
    return "android";
  }

  return "browser";
}

export const isAndroidRuntime = () => getRuntimeKind() === "android";
