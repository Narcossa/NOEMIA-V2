// Écrire au lieu de parler (réunion, transports, chantier bruyant).
// Une question tapée reçoit une réponse écrite, sans voix : discrétion assurée.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Palette } from "../theme";

export function Composer({ c, onSend, onClose }: { c: Palette; onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const send = () => { const t = text.trim(); if (!t) return; onSend(t); setText(""); };
  return (
    <View style={[st.bar, { backgroundColor: c.panel, borderColor: c.line }]}>
      <TextInput value={text} onChangeText={setText} placeholder="Écris à NOÉMIA…" placeholderTextColor={c.muted}
        style={[st.input, { color: c.ink }]} autoFocus multiline maxLength={2000}
        returnKeyType="send" submitBehavior="submit" onSubmitEditing={send} accessibilityLabel="Message à NOÉMIA" />
      <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Envoyer"
        style={[st.send, { backgroundColor: text.trim() ? c.halo : c.line }]}>
        <Text style={st.sendText}>↑</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer le clavier">
        <Text style={{ color: c.muted, fontSize: 15 }}>Fermer</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginHorizontal: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 12, paddingVertical: 8 },
  input: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 6, paddingBottom: 6 },
  send: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 18, fontWeight: "800" },
});
