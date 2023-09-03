import "../chunks/chunk-BFXLU5VG.js";
import "../chunks/chunk-KRYK5JSZ.js";

// front/src/pages/MicroWallet.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
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
      var response_type = params.get("response_type");
      var response_mode = params.get("response_mode");
      var client_id = params.get("client_id");
      var redirect_uri = params.get("redirect_uri");
      var state = params.get("state");
      var nonce = params.get("nonce");
      let theHtml = html`
            <div class="w3-container">
                <p>Welcome to the application</p>
                <p>location: ${window.location.origin}</p>

                <p>scope: ${scope}</p>
                <p>response_type: ${response_type}</p>
                <p>response_mode: ${response_mode}</p>
                <p>client_id: ${client_id}</p>
                <p>redirect_uri: ${redirect_uri}</p>
                <p>state: ${state}</p>
                <p>nonce: ${nonce}</p>
            </div>
            `;
      this.render(theHtml);
      return;
    }
    if (command !== null) {
      switch (command) {
        case "getvc":
          var vc_id = params.get("vcid");
          var vc_path = window.location.origin + "/issuer/api/v1/credential/" + vc_id;
          await window.MHR.gotoPage("LoadAndSaveQRVC", vc_path);
          return;
        default:
          break;
      }
    }
    let total = 0;
    if (!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
      total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"));
    }
    console.log("Certificates found in storage");
    const theDivs = [];
    for (let i = 0; i < total; i++) {
      const currentId = "W3C_VC_LD_" + i;
      if (!!window.localStorage.getItem(currentId)) {
        const vcraw = window.localStorage.getItem(currentId);
        const vc = JSON.parse(vcraw);
        const vcs = vc.credentialSubject;
        const pos = vcs.position;
        const div = html`<div class="w3-half w3-container w3-margin-bottom">
                        <div class="w3-card-4">
                            <div class="w3-padding-left w3-margin-bottom color-primary">
                                <h4>Employee</h4>
                            </div>

                            <div class="w3-container">
                                <img src="https://www.w3schools.com/w3css/img_avatar3.png" alt="Avatar" class="w3-left w3-circle w3-margin-right" style="width:60px">
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
    }
    if (theDivs.length > 0) {
      this.render(html`
                <p></p>
                <div class="w3-row">
                    
                    <div class="w3-half w3-container w3-margin-bottom">
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
  async deleteVC(currentId) {
    window.localStorage.removeItem(currentId);
    await goHome();
    return;
  }
});
