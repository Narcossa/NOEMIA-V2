/** NOÉMIA sur l'Apple Watch : lui parler depuis le poignet. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "NoemiaWatch",
  displayName: "NOÉMIA",
  bundleIdentifier: ".watchkitapp",
  deploymentTarget: "10.0",
  icon: "../../assets/icon.png",
  images: { noemia: "./noemia.png" },
  colors: {
    halo: "#4E92FF",
  },
};
