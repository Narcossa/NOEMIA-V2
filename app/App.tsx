// NOÉMIA : choix de l'écran selon la connexion (première rencontre ou compagnon).
import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getToken } from "./src/api";
import { Welcome } from "./src/screens/Welcome";
import { Companion } from "./src/screens/Companion";
import "./src/notifications"; // déclare la tâche d'arrière-plan au démarrage

type State = { screen: "loading" } | { screen: "welcome" } | { screen: "companion"; greeting?: string };

export default function App() {
  const [state, setState] = useState<State>({ screen: "loading" });

  useEffect(() => { getToken().then(t => setState(t ? { screen: "companion" } : { screen: "welcome" })); }, []);

  const signedOut = useCallback(() => setState({ screen: "welcome" }), []);
  const signedIn = useCallback((name: string) => setState({
    screen: "companion",
    greeting: `Enchantée${name ? " " + name : ""}. J'ai maintenant accès à ton agenda, tes tâches et tes emails. Touche le bouton quand tu veux me parler.`,
  }), []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {state.screen === "welcome" && <Welcome onSignedIn={signedIn} />}
      {state.screen === "companion" && <Companion greeting={state.greeting} onSignedOut={signedOut} />}
    </SafeAreaProvider>
  );
}
