// Trois variantes de l'appli, choisies par la variable NOEMIA_VARIANTE au moment du build :
// - « standard » : l'appli et son widget ;
// - « complet »  : en plus, « Partager › NOÉMIA » (groupe d'applis) ;
// - « montre »   : en plus, l'appli Apple Watch. Avec un identifiant Apple gratuit, l'installeur
//                  renomme l'appli avec le code d'équipe : le build corrige la montre en conséquence
//                  (voir l'étape « Montre » de .github/workflows/ios-ipa.yml).
module.exports = ({ config }) => {
  const variante = process.env.NOEMIA_VARIANTE ?? "standard";
  const match = { standard: "widget", complet: "@(widget|share)", montre: "*" }[variante] ?? "widget";

  const plugins = config.plugins.map(p =>
    (Array.isArray(p) ? p[0] : p) === "@bacons/apple-targets" ? ["@bacons/apple-targets", { match }] : p);

  const entitlements = { ...(config.ios?.entitlements ?? {}) };
  if (variante !== "standard") entitlements["com.apple.security.application-groups"] = ["group.fr.noem.noemia"];
  return { ...config, plugins, ios: { ...config.ios, entitlements } };
};
