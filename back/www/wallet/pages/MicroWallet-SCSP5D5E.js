import {
  photo_man_default,
  photo_woman_default
} from "../chunks/chunk-EMILS377.js";
import "../chunks/chunk-66PNVI35.js";

// front/src/pages/MicroWallet.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
window.MHR.register("MicroWallet", class MicroWallet extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    let html = this.html;
    let params = new URL(document.location).searchParams;
    let scope = params.get("scope");
    let command = params.get("command");
    if (scope !== null) {
      gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    if (command !== null) {
      switch (command) {
        case "getvc":
          var vc_id = params.get("vcid");
          var vc_path = window.location.origin + "/issuer/api/v1/credential/" + vc_id;
          await gotoPage("LoadAndSaveQRVC", vc_path);
          return;
        default:
          break;
      }
    }
    var credentials = await storage.credentialsGetAllRecent();
    if (!credentials) {
      gotoPage("ErrorPage", { "title": "Error", "msg": "Error getting recent credentials" });
      return;
    }
    const theDivs = [];
    for (const vcraw of credentials) {
      const currentId = vcraw.hash;
      const vc = JSON.parse(vcraw.encoded);
      const vcs = vc.credentialSubject;
      const pos = vcs.position;
      var avatar = photo_man_default;
      if (vcs.gender == "f") {
        avatar = photo_woman_default;
      }
      const div = html`<div class="w3-half w3-container w3-margin-bottom">
                <div class="w3-card-4">
                    <div class="w3-padding-left w3-margin-bottom color-primary">
                        <h4>Employee</h4>
                    </div>

                    <div class="w3-container">
                        <img src=${avatar} alt="Avatar" class="w3-left w3-circle w3-margin-right" style="width:60px">
                        <p class="w3-large">${vcs.name}</p>
                        <hr>
                    <div class="w3-row-padding">

                    <div class=" w3-container">
                        <p class="w3-margin-bottom5">${pos.department}</p>
                        <p class="w3-margin-bottom5">${pos.secretariat}</p>
                        <p class="w3-margin-bottom5">${pos.directorate}</p>
                        <p class="w3-margin-bottom5">${pos.subdirectorate}</p>
                        <p class="w3-margin-bottom5">${pos.service}</p>
                        <p class="w3-margin-bottom5">${pos.section}</p>
                    </div>
        
                    <div class="w3-padding-16">
                        <btn-primary @click=${() => gotoPage("DisplayVC", currentId)}>${T("Details")}</btn-primary>
                        <btn-danger @click=${() => gotoPage("ConfirmDelete", currentId)}>${T("Delete")}</btn-danger>
                    </div>
        
                </div>
            </div>`;
      theDivs.push(div);
    }
    if (theDivs.length > 0) {
      this.render(html`
                <p></p>
                <div class="w3-row">
                    
                    <div class="w3-container w3-margin-bottom">
                        <div class="w3-card-4">
                            <div class=" w3-center w3-margin-bottom color-primary">
                                <h4>Authentication</h4>
                            </div>

                            <div class="w3-container w3-padding-16 w3-center">
                                <btn-primary @click=${() => gotoPage("ScanQrPage")}>${T("Scan QR")}</btn-primary>
                            </div>
                
                        </div>
                    </div>

                    ${theDivs}

                </div>
            `);
      return;
    } else {
      this.render(html`
                <div class="w3-container">
                    <h2>${T("There is no certificate.")}</h2>
                    <p>You need to obtain one from an Issuer, by scanning the QR in the screen of the Issuer page</p>
                    <btn-primary @click=${() => gotoPage("ScanQrPage")}>${T("Scan a QR")}</btn-primary>
                </div>
            `);
      return;
    }
  }
});
