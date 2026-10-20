// Un identifiant Apple gratuit (SideStore / AltStore) ne peut pas signer une appli qui demande
// les notifications « poussées ». NOÉMIA n'utilise que des notifications locales : on retire ce droit.
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withoutPush(config) {
  return withEntitlementsPlist(config, mod => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
};
