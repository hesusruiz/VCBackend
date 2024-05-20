import {
  getOrCreateDidKey
} from "../chunks/chunk-5HFYYPY6.js";
import {
  renderLEARCredentialCard
} from "../chunks/chunk-PI7RY6L6.js";
import "../chunks/chunk-U2D4LOFI.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/MicroWallet.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
window.MHR.register("MicroWallet", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    const mydid = await getOrCreateDidKey();
    console.log("My DID", mydid.did);
    let html = this.html;
    let params = new URL(document.location).searchParams;
    console.log("MicroWallet", document.location);
    if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
      console.log("MicroWallet ************Redirected with state**************");
      gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    if (document.URL.includes("code=")) {
      console.log("MicroWallet ************Redirected with code**************");
      gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    let scope = params.get("scope");
    if (scope !== null) {
      console.log("detected scope");
      gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let request_uri = params.get("request_uri");
    if (request_uri !== null) {
      request_uri = decodeURIComponent(request_uri);
      console.log("MicroWallet request_uri", request_uri);
      console.log("Going to SIOPSelectCredential with", document.URL);
      gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let credential_offer_uri = params.get("credential_offer_uri");
    if (credential_offer_uri) {
      console.log("MicroWallet", credential_offer_uri);
      await gotoPage("LoadAndSaveQRVC", document.location.href);
      return;
    }
    let command = params.get("command");
    if (command !== null) {
      switch (command) {
        case "getvc":
          var vc_id = params.get("vcid");
          await gotoPage("LoadAndSaveQRVC", vc_id);
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
      if (vcraw.type == "jwt_vc") {
        const currentId = vcraw.hash;
        const vc = vcraw.decoded;
        const status = vcraw.status;
        const div = html`
            <ion-card>
            
                ${renderLEARCredentialCard(vc, vcraw.status)}
    
                <div class="ion-margin-start ion-margin-bottom">
                    <ion-button @click=${() => gotoPage("DisplayVC", vcraw)}>
                        <ion-icon slot="start" name="construct"></ion-icon>
                        ${T("Details")}
                    </ion-button>

                    <ion-button color="danger" @click=${() => this.presentActionSheet(currentId)}>
                        <ion-icon slot="start" name="trash"></ion-icon>
                        ${T("Delete")}
                    </ion-button>
                </div>
            </ion-card>
            `;
        theDivs.push(div);
      }
    }
    var theHtml;
    if (theDivs.length > 0) {
      theHtml = html`
                <ion-card>
                    <ion-card-content>
                        <h2>Click here to scan a QR code</h2>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan QR")}
                        </ion-button>
                    </div>

                </ion-card>

                ${theDivs}

                <ion-action-sheet id="mw_actionSheet" @ionActionSheetDidDismiss=${(ev) => this.deleteVC(ev)}>
                </ion-action-sheet>

            `;
    } else {
      mylog("No credentials");
      theHtml = html`
                <ion-card>
                    <ion-card-header>
                        <ion-card-title>The wallet is empty</ion-card-title>
                    </ion-card-header>

                    <ion-card-content>
                    <div class="text-medium">You need to obtain a Verifiable Credential from an Issuer, by scanning the QR in the screen of the Issuer page</div>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan a QR")}
                        </ion-button>
                    </div>

                </ion-card>
            `;
    }
    this.render(theHtml, false);
  }
  async presentActionSheet(currentId) {
    const actionSheet = document.getElementById("mw_actionSheet");
    actionSheet.header = "Confirm to delete credential";
    actionSheet.buttons = [
      {
        text: "Delete",
        role: "destructive",
        data: {
          action: "delete"
        }
      },
      {
        text: "Cancel",
        role: "cancel",
        data: {
          action: "cancel"
        }
      }
    ];
    this.credentialIdToDelete = currentId;
    await actionSheet.present();
  }
  async deleteVC(ev) {
    if (ev.detail.data) {
      if (ev.detail.data.action == "delete") {
        const currentId = this.credentialIdToDelete;
        mylog("deleting credential", currentId);
        await storage.credentialsDelete(currentId);
        goHome();
        return;
      }
    }
  }
});
