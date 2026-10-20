// Deux variantes de l'appli, choisies par la variable NOEMIA_VARIANTE au moment du build :
// - « standard » : l'appli et son widget (ce que SideStore installe sans difficulté) ;
// - « complet »  : en plus, « Partager › NOÉMIA » et l'appli Apple Watch (groupe d'applis requis).
module.exports = ({ config }) => {
  const complet = process.env.NOEMIA_VARIANTE === "complet";
  const plugins = config.plugins.map(p =>
    (Array.isArray(p) ? p[0] : p) === "@bacons/apple-targets"
      ? ["@bacons/apple-targets", { match: complet ? "*" : "widget" }]
      : p);
  const entitlements = { ...(config.ios?.entitlements ?? {}) };
  if (complet) entitlements["com.apple.security.application-groups"] = ["group.fr.noem.noemia"];
  return { ...config, plugins, ios: { ...config.ios, entitlements } };
};
