// Fil de la conversation : on glisse vers le haut pour relire, copier un numéro ou réécouter.
import { useEffect, useRef } from "react";
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Palette } from "../theme";

export type ThreadItem = { id: string; who: "toi" | "noemia" | "action"; text: string; image?: string; at: number };

export function Thread({ visible, items, c, onClose, onReplay }: {
  visible: boolean; items: ThreadItem[]; c: Palette; onClose: () => void; onReplay: (text: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ThreadItem>>(null);
  useEffect(() => { if (visible) setTimeout(() => list.current?.scrollToEnd({ animated: false }), 50); }, [visible, items.length]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[st.root, { backgroundColor: c.panel }]}>
        <View style={[st.head, { borderColor: c.line }]}>
          <Text style={[st.title, { color: c.ink }]}>Conversation</Text>
          <Pressable onPress={onClose} accessibilityRole="button"><Text style={{ color: c.halo, fontSize: 16, fontWeight: "600" }}>Fermer</Text></Pressable>
        </View>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={<Text style={{ color: c.muted, textAlign: "center", marginTop: 40 }}>Rien pour l'instant. Parle à NOÉMIA, vos échanges apparaîtront ici.</Text>}
          renderItem={({ item }) => {
            if (item.who === "action") return <Text style={[st.action, { color: c.muted }]}>✓ {item.text}</Text>;
            const mine = item.who === "toi";
            return (
              <View style={[st.bubble, mine ? st.mine : st.hers, { backgroundColor: mine ? c.halo : c.bg, borderColor: c.line }]}>
                {item.image ? <Image source={{ uri: item.image }} style={st.photo} /> : null}
                <Text selectable style={{ color: mine ? "#fff" : c.ink, fontSize: 15, lineHeight: 21 }}>{item.text}</Text>
                <View style={st.meta}>
                  <Text style={{ color: mine ? "rgba(255,255,255,0.75)" : c.muted, fontSize: 11 }}>
                    {new Date(item.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  {!mine ? (
                    <View style={st.tools}>
                      <Pressable onPress={() => Clipboard.setStringAsync(item.text)} hitSlop={8} accessibilityLabel="Copier">
                        <Text style={{ color: c.halo, fontSize: 12, fontWeight: "600" }}>Copier</Text>
                      </Pressable>
                      <Pressable onPress={() => onReplay(item.text)} hitSlop={8} accessibilityLabel="Réécouter">
                        <Text style={{ color: c.halo, fontSize: 12, fontWeight: "600" }}>Réécouter</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, letterSpacing: 0.4 },
  bubble: { maxWidth: "86%", borderRadius: 16, padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  hers: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  tools: { flexDirection: "row", gap: 14 },
  action: { fontSize: 13, textAlign: "center" },
  photo: { width: 200, height: 140, borderRadius: 10 },
});
