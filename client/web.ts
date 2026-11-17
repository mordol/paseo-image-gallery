import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface KeyEvent {
  key: string;
  preventDefault(): void;
}
declare const window: {
  addEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
};

/**
 * Calls `handler` for each key press on web and desktop. Return true to consume the key.
 * Native platforms have no hardware keyboard events here, so this is a no-op there.
 */
export function onKeyDown(handler: (key: string) => boolean): () => void {
  if (Platform.OS !== "web") return () => {};
  const listener = (event: KeyEvent) => {
    if (handler(event.key)) event.preventDefault();
  };
  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}
