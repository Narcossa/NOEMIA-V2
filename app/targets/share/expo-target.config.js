/** « Partager › NOÉMIA » : un texte, un lien, une photo ou un PDF envoyé depuis n'importe quelle appli. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "share",
  name: "NoemiaShare",
  displayName: "NOÉMIA",
  bundleIdentifier: ".share",
  deploymentTarget: "17.0",
  entitlements: {
    "com.apple.security.application-groups": ["group.fr.noem.noemia"],
  },
  colors: {
    halo: { color: "#1F6FFF", darkColor: "#4E92FF" },
  },
};
