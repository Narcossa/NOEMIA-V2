// Ajoute native/NoemiaIntents.swift à la cible principale de l'appli iOS.
// Siri ne découvre les actions (App Intents) que si elles sont compilées dans l'appli elle-même.
const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject, IOSConfig } = require("expo/config-plugins");

const FILE = "NoemiaIntents.swift";

module.exports = function withAppIntents(config) {
  config = withDangerousMod(config, ["ios", async mod => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const dest = path.join(mod.modRequest.platformProjectRoot, projectName, FILE);
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, "native", FILE), dest);
    return mod;
  }]);
  return withXcodeProject(config, mod => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const project = mod.modResults;
    if (!project.hasFile(`${projectName}/${FILE}`)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: `${projectName}/${FILE}`, groupName: projectName, project });
    }
    return mod;
  });
};
