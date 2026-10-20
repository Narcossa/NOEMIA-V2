/** Widget NOÉMIA : écran d'accueil, écran verrouillé et bouton du Centre de contrôle. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "NoemiaWidget",
  displayName: "NOÉMIA",
  bundleIdentifier: ".widget",
  deploymentTarget: "18.0",
  images: { noemia: "./noemia.png" },
  colors: {
    halo: { color: "#1F6FFF", darkColor: "#4E92FF" },
    fond: { color: "#E7EBF0", darkColor: "#0B0E14" },
    encre: { color: "#141922", darkColor: "#E8ECF2" },
  },
};
