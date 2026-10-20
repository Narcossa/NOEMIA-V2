// NOÉMIA à l'écran : le moteur d'animation de l'étape 0 tourne dans une WebView plein écran.
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { AVATAR_HTML } from "./avatarHtml";

// Les types de react-native-webview ne suivent pas encore React 19.3 : on les contourne ici
const WebViewView = WebView as any;

export type Halo = "repos" | "ecoute" | "reflexion" | "parole" | "action" | "probleme";
export type AvatarMsg =
  | { type: "halo"; state: Halo }
  | { type: "emotion"; name: string }
  | { type: "speak"; text: string; rate?: number }
  | { type: "word"; word: string; rate?: number }
  | { type: "silence" }
  | { type: "theme"; value: "jour" | "nuit" };

export type AvatarHandle = { send: (m: AvatarMsg) => void };

export const Avatar = forwardRef<AvatarHandle, { onReady?: () => void }>(({ onReady }, ref) => {
  const web = useRef<{ injectJavaScript: (js: string) => void } | null>(null);
  useImperativeHandle(ref, () => ({
    send: m => web.current?.injectJavaScript(`window.noemia && window.noemia(${JSON.stringify(m)}); true;`),
  }));
  return (
    <WebViewView
      ref={web}
      style={StyleSheet.absoluteFill}
      source={{ html: AVATAR_HTML }}
      originWhitelist={["*"]}
      scrollEnabled={false}
      bounces={false}
      javaScriptEnabled
      allowsInlineMediaPlayback
      onMessage={(e: { nativeEvent: { data: string } }) => { try { if (JSON.parse(e.nativeEvent.data).type === "ready") onReady?.(); } catch {} }}
      accessible
      accessibilityLabel="NOÉMIA"
    />
  );
});
