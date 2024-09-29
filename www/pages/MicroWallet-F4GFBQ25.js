import {
  getOrCreateDidKey
} from "../chunks/chunk-5HFYYPY6.js";
import {
  renderAnyCredentialCard
} from "../chunks/chunk-XAXA3SJF.js";
import "../chunks/chunk-CJ4ZD2TO.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/MicroWallet.js
MHR.register("MicroWallet", class extends MHR.AbstractPage {
  /**
   * @param {string} id
   */
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
      MHR.gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    if (document.URL.includes("code=")) {
      console.log("MicroWallet ************Redirected with code**************");
      MHR.gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    let scope = params.get("scope");
    if (scope !== null) {
      console.log("detected scope");
      MHR.gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let request_uri = params.get("request_uri");
    if (request_uri !== null) {
      request_uri = decodeURIComponent(request_uri);
      console.log("MicroWallet request_uri", request_uri);
      console.log("Going to SIOPSelectCredential with", document.URL);
      MHR.gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let credential_offer_uri = params.get("credential_offer_uri");
    if (credential_offer_uri) {
      console.log("MicroWallet", credential_offer_uri);
      await MHR.gotoPage("LoadAndSaveQRVC", document.location.href);
      return;
    }
    let command = params.get("command");
    if (command !== null) {
      switch (command) {
        case "getvc":
          var vc_id = params.get("vcid");
          await MHR.gotoPage("LoadAndSaveQRVC", vc_id);
          return;
        default:
          break;
      }
    }
    var credentials = await MHR.storage.credentialsGetAllRecent();
    if (!credentials) {
      MHR.gotoPage("ErrorPage", { "title": "Error", "msg": "Error getting recent credentials" });
      return;
    }
    console.log(credentials);
    const theDivs = [];
    for (const vcraw of credentials) {
      if (vcraw.type == "jwt_vc") {
        console.log(vcraw);
        const currentId = vcraw.hash;
        const vc = vcraw.decoded;
        const status = vcraw.status;
        const div = html`
                <ion-card>
                
                    ${renderAnyCredentialCard(vc, vcraw.status)}
        
                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => MHR.gotoPage("DisplayVC", vcraw)}>
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
                        <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
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
                        <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan a QR")}
                        </ion-button>
                    </div>

                </ion-card>
            `;
    }
    this.render(theHtml, false);
  }
  /**
   * @param {string} currentId
   */
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
        await MHR.storage.credentialsDelete(currentId);
        MHR.goHome();
        return;
      }
    }
  }
});
var in2Credential = {
  "id": "urn:entities:credential:0fac8eef-2665-4815-94b4-4bc3c2809224",
  "type": [
    "LEARCredentialEmployee",
    "VerifiableCredential"
  ],
  "status": "VALID",
  "available_formats": [
    "json_vc",
    "jwt_vc"
  ],
  "credentialSubject": {
    "mandate": {
      "id": "87aea695-83ba-4619-ba3a-b3d541d9c106",
      "life_span": {
        "end_date_time": "2025-04-02 0923:22.637345122 +0000 UTC",
        "start_date_time": "2024-04-02 09:23:22.637345122 +0000 UTC"
      },
      "mandatee": {
        "id": "did:key:zDnaefxkXMFSqitTWgrV5D9HmwfLe2sB6Wqenw2FedU5TF1Q5",
        "email": "jesus.ruiz@in2.es",
        "first_name": "Jesus",
        "gender": "M",
        "last_name": "Ruiz",
        "mobile_phone": "+34676477104"
      },
      "mandator": {
        "commonName": "RUIZ JESUS - 87654321K",
        "country": "ES",
        "emailAddress": "jesus.ruiz@in2.es",
        "organization": "IN2, Ingeniería de la Información, S.L.",
        "organizationIdentifier": "VATES-B60645900",
        "serialNumber": "IDCES-87654321K"
      },
      "power": [
        {
          "id": "6b8f3137-a57a-46a5-97e7-1117a20142fb",
          "tmf_action": "Execute",
          "tmf_domain": "DOME",
          "tmf_function": "Onboarding",
          "tmf_type": "Domain"
        },
        {
          "id": "ad9b1509-60ea-47d4-9878-18b581d8e19b",
          "tmf_action": [
            "Create",
            "Update"
          ],
          "tmf_domain": "DOME",
          "tmf_function": "ProductOffering",
          "tmf_type": "Domain"
        }
      ],
      "signer": {
        "commonName": "IN2",
        "country": "ES",
        "emailAddress": "rrhh@in2.es",
        "organization": "IN2, Ingeniería de la Información, S.L.",
        "organizationIdentifier": "VATES-B60645900",
        "serialNumber": "B60645900"
      }
    }
  },
  "expirationDate": "2025-04-02T09:23:22Z"
};
MHR.register("SaveIN2Credential", class extends MHR.AbstractPage {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(id);
  }
  async enter() {
    var credStruct = {
      type: "jwt_vc",
      status: "signed",
      encoded: "",
      decoded: in2Credential
    };
    var saved = await MHR.storage.credentialsSave(credStruct);
    if (!saved) {
      return;
    }
    MHR.cleanReload();
  }
});
