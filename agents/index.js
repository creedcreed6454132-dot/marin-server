// All 10 agents. Each one is independent: require only the one you need, or this index.
"use strict";
module.exports = {
  onboarder: require("./onboarder"),
  offerBuilder: require("./offer-builder"),
  copywriter: require("./copywriter"),
  creativeDirector: require("./creative-director"),
  pageWriter: require("./page-writer"),
  mediaBuyer: require("./media-buyer"),
  speedToLead: require("./speed-to-lead"),
  analyst: require("./analyst"),
  accountManager: require("./account-manager"),
  renewalRep: require("./renewal-rep")
};
