import {
  Client
} from "../chunks/chunk-J6D2DG7T.js";
import "../chunks/chunk-BFXLU5VG.js";
import "../chunks/chunk-66PNVI35.js";

// front/src/pages/ListOfferingsPage.js
console.log("Wallet served from:", window.location.origin);
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
window.MHR.register("ListOfferingsPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    console.log("AuthStore is valid:", pb.authStore.isValid);
    console.log(pb.authStore.model);
    if (!pb.authStore.isValid || !pb.authStore.model.verified) {
      gotoPage("ErrorPage", { title: "User not verified" });
      return;
    }
    const records = await pb.collection("credentials").getFullList({
      sort: "-created"
    });
    var theHtml;
    theHtml = listCredentialOffers(records);
    this.render(theHtml, false);
  }
});
function listCredentialOffers(records) {
  return html`
<ion-card>
    <ion-card-header>
        <ion-card-title>List of Offers</ion-card-title>
    </ion-card-header>

    <ion-card-content>

        ${records.length == 0 ? html`<h1>No records</h1>` : html`
            
            <ion-list>

                ${records.map((cred) => {
    console.log(cred.email);
    return html`
                <ion-item>
                    <ion-button slot="start" @click=${() => gotoPage("DisplayOfferingQRCode", cred.id)}> View </ion-button>
                    <ion-label>
                        ${cred.id}
                    </ion-col>
    
                    <ion-note>
                        ${cred.email}
                    </ionnote>
                </ion-item>`;
  })}
            </ion-list>
                
        `}

    </ion-card-content>

    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${() => gotoPage("CreateOfferingPage")}>
            ${T("Create New Credential Offer")}
        </ion-button>
    </div>


</ion-card>
`;
}
window.MHR.register("DisplayOfferingQRCode", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter(id) {
    try {
      var record = await pb.send("/eidasapi/createqrcode/" + id);
      console.log(record);
    } catch (error) {
      gotoPage("ErrorPage", { title: "Error retrieving credential " + id, msg: error.message });
      return;
    }
    var credentialHref = "https://wallet.mycredential.eu/?command=getvc&vcid=https://issuersec.mycredential.eu/eidasapi/retrievecredential/" + id;
    var linkToCredential = "https://issuersec.mycredential.eu/eidasapi/retrievecredential/" + id;
    const theHtml = html`
<ion-card>
    <ion-card-header>
        <ion-card-title>Scan this QR code to load credential in wallet</ion-card-title>
    </ion-card-header>

    <ion-card-content>

        <img src="${record.image}" alt="QR code">

        <h1><a href=${credentialHref} target="_blank">Or click here to use same-device wallet</a></h1>
        <h2><a href=${linkToCredential} target="_blank">Direct link to credential</a></h2>

    </ion-card-content>

    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${() => window.MHR.cleanReload()}>
            ${T("Home")}
        </ion-button>
    </div>

</ion-card>

        `;
    this.render(theHtml, false);
    Prism.highlightAll();
  }
});
