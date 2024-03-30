import {
  Client
} from "../chunks/chunk-J6D2DG7T.js";
import "../chunks/chunk-BFXLU5VG.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/CreateOfferingPage.js
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
var pageName = "CreateOfferingPage";
window.MHR.register(pageName, class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    console.log("AuthStore is valid:", pb.authStore.isValid);
    console.log(pb.authStore.model);
    if (!pb.authStore.isValid || !pb.authStore.model.verified) {
      myerror(`${pageName}: user not verified`);
      gotoPage("ErrorPage", { title: "User not verified" });
      return;
    }
    var theHtml;
    theHtml = mandateForm();
    this.render(theHtml, false);
  }
});
function mandateForm() {
  var model = pb.authStore.model;
  return html`
<ion-card>
    <ion-card-header>
        <ion-card-title>Create a Mandate as a Verifiable Credential</ion-card-title>
    </ion-card-header>

    <ion-card-content>

        <ion-grid>
            <ion-row>
                <ion-col size="12" size-md="6">

                    <ion-item-group>

                        <ion-item-divider>
                            <ion-label> Mandator (Signer) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                            <ion-input id="OrganizationIdentifier" label="OrganizationIdentifier:" label-placement="stacked"
                            value="${model.organizationIdentifier}" ?readonly=${model.organizationIdentifier}></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="Organization" label="Organization:" label-placement="stacked"
                            value="${model.organization}" ?readonly=${model.organization}></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="CommonName" label="CommonName:" label-placement="stacked"
                            value="${model.commonName}" ?readonly=${model.commonName}></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="EmailAddress" label="EmailAddress:" label-placement="stacked"
                            value="${model.email}" ?readonly=${model.email}></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="SerialNumber" label="SerialNumber:" label-placement="stacked"
                            value="${model.serialNumber}" ?readonly=${model.serialNumber}></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="Country" label="Country:" label-placement="stacked"
                            value="${model.country}" ?readonly=${model.country}></ion-input>
                        </ion-item>

                    </ion-item-group>

                </ion-col>

                <ion-col size="12" size-md="6">

                    <ion-item-group>

                        <ion-item-divider>
                            <ion-label> Mandatee (Holder and Subject) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                            <ion-input id="first_name" label="First name:" label-placement="stacked"></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="last_name" label="Last name:" label-placement="stacked"></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="gender" label="Gender:" label-placement="stacked"></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="email" label="Email:" label-placement="stacked"></ion-input>
                        </ion-item>
                        <ion-item>
                            <ion-input id="mobile_phone" label="Mobile phone:" label-placement="stacked"></ion-input>
                        </ion-item>

                    </ion-item-group>

                </ion-col>
            </ion-row>

            <ion-row>
                <ion-col size="12" size-md="6">

                    <ion-item-group>

                        <ion-item-divider>
                            <ion-label> Powers (1 of 2) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                            <ion-input id="tmf_domain1" label="Domain:" label-placement="stacked" value="DOME" readonly="true"></ion-input>
                        </ion-item>

                        <ion-item>
                            <ion-select id="tmf_function1" label="Function:" label-placement="stacked" justify="start" placeholder="Select the function">
                                <ion-select-option value="Onboarding">Onboarding</ion-select-option>
                                <ion-select-option value="ProductOffering">Product Offering</ion-select-option>
                            </ion-select>
                        </ion-item>

                        <ion-item>
                            <ion-label position="stacked">Allowed actions:</ion-label>
                            <ion-toggle id="Execute1" name="Execute" label-placement="end" justify="start">Execute</ion-toggle>
                            <ion-toggle id="Create1" name="Create" label-placement="end" justify="start">Create</ion-toggle>
                            <ion-toggle id="Update1" name="Update" label-placement="end" justify="start">Update</ion-toggle>
                            <ion-toggle id="Delete1" name="Delete" label-placement="end" justify="start">Delete</ion-toggle>
                        </ion-item>

                    </ion-item-group>
                </ion-col>
                <ion-col size="12" size-md="6">

                    <ion-item-group>

                        <ion-item-divider>
                            <ion-label> Powers (2 of 2) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                            <ion-input id="tmf_domain2" label="Domain:" label-placement="stacked" value="DOME" readonly="true"></ion-input>
                        </ion-item>

                        <ion-item>
                            <ion-select id="tmf_function2" label="Function:" label-placement="stacked" justify="start" placeholder="Select the function">
                                <ion-select-option value="Onboarding">Onboarding</ion-select-option>
                                <ion-select-option value="ProductOffering">Product Offering</ion-select-option>
                            </ion-select>
                        </ion-item>

                        <ion-item>
                            <ion-label position="stacked">Action:</ion-label>
                            <ion-toggle id="Execute2" name="Execute" label-placement="end" justify="start">Execute</ion-toggle>
                            <ion-toggle id="Create2" name="Create" label-placement="end" justify="start">Create</ion-toggle>
                            <ion-toggle id="Update2" name="Update" label-placement="end" justify="start">Update</ion-toggle>
                            <ion-toggle id="Delete2" name="Delete" label-placement="end" justify="start">Delete</ion-toggle>
                        </ion-item>

                    </ion-item-group>
                </ion-col>
            </ion-row>

        </ion-grid>

    </ion-card-content>

    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${() => createCredentialOffer()}>
            ${T("Create")}
        </ion-button>
        <ion-button @click=${() => window.MHR.cleanReload()}>
            ${T("Cancel")}
        </ion-button>
    </div>


</ion-card>
`;
}
async function createCredentialOffer() {
  const mandator = {
    OrganizationIdentifier: document.getElementById("OrganizationIdentifier").value,
    Organization: document.getElementById("Organization").value,
    CommonName: document.getElementById("CommonName").value,
    EmailAddress: document.getElementById("EmailAddress").value,
    SerialNumber: document.getElementById("SerialNumber").value,
    Country: document.getElementById("Country").value
  };
  const mandatee = {
    first_name: document.getElementById("first_name").value,
    last_name: document.getElementById("last_name").value,
    gender: document.getElementById("gender").value,
    email: document.getElementById("email").value,
    mobile_phone: document.getElementById("mobile_phone").value
  };
  var action1 = [];
  if (document.getElementById("Execute1").checked) {
    action1.push("Execute");
  }
  if (document.getElementById("Create1").checked) {
    action1.push("Create");
  }
  if (document.getElementById("Update1").checked) {
    action1.push("Update");
  }
  if (document.getElementById("Delete1").checked) {
    action1.push("Delete");
  }
  const power1 = {
    tmf_type: "Domain",
    tmf_domain: [document.getElementById("tmf_domain1").value],
    tmf_function: document.getElementById("tmf_function1").value,
    tmf_action: action1
  };
  var action2 = [];
  if (document.getElementById("Execute2").checked) {
    action2.push("Execute");
  }
  if (document.getElementById("Create2").checked) {
    action2.push("Create");
  }
  if (document.getElementById("Update2").checked) {
    action2.push("Update");
  }
  if (document.getElementById("Delete2").checked) {
    action2.push("Delete");
  }
  const power2 = {
    tmf_type: "Domain",
    tmf_domain: [document.getElementById("tmf_domain2").value],
    tmf_function: document.getElementById("tmf_function2").value,
    tmf_action: action2
  };
  var powers = [];
  if (document.getElementById("tmf_function1").value) {
    powers.push(power1);
  }
  if (document.getElementById("tmf_function2").value) {
    powers.push(power2);
  }
  var errorMessages = [];
  if (!document.getElementById("email").value) {
    errorMessages.push(html`The email field of the Mandatee can not be empty.<br>`);
  }
  if (!power1.tmf_function || action1.length == 0) {
    errorMessages.push(html`At least one power should be specified.`);
  }
  if (errorMessages.length > 0) {
    gotoPage("ErrorPage", { title: "The form is invalid", msg: errorMessages, back: true });
    return;
  }
  const data = {
    Mandator: mandator,
    Mandatee: mandatee,
    Power: powers
  };
  try {
    var tempCredential = await pb.send(
      "/apiadmin/createcredential",
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    console.log(tempCredential);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error creating credential", msg: error.message });
    return;
  }
  gotoPage("DisplayOfferingPage", tempCredential);
}
window.MHR.register("DisplayOfferingPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter(tempCredential) {
    const learcred = JSON.stringify(tempCredential, null, "  ");
    console.log("AuthStore is valid:", pb.authStore.isValid);
    console.log(pb.authStore.model);
    if (!pb.authStore.isValid || !pb.authStore.model.verified) {
      gotoPage("ErrorPage", { title: "User not verified" });
      return;
    }
    const theHtml = html`
        <div id="theVC" class="half-centered">
            <p>Review the proposed LEARCredential offer and confirm to send to server: </p>
        
<pre><code class="language-json">${learcred}</code></pre>
        
        </div>
        
        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => storeOfferingInServer(tempCredential)}>
                <ion-icon slot="start" name="home"></ion-icon>
                ${T("Save Credential Offer")}
            </ion-button>
            <ion-button @click=${() => history.back()}>
                <ion-icon slot="start" name="chevron-back"></ion-icon>
                ${T("Back")}
            </ion-button>
        </div>
        `;
    this.render(theHtml, false);
    Prism.highlightAll();
  }
});
async function storeOfferingInServer(tempCredential) {
  const userEmail = tempCredential.credentialSubject.mandate.mandatee.email;
  const learcred = JSON.stringify(tempCredential);
  var model = pb.authStore.model;
  debugger;
  try {
    var result = await fetch(
      "http://127.0.0.1/signcredential",
      {
        method: "POST",
        body: learcred,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
    var signedCredential = result.signed;
    console.log(signedCredential);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error creating credential", msg: error.message });
    return;
  }
  var data = {
    status: "offered",
    email: userEmail,
    type: "jwt_vc",
    raw: signedCredential,
    creator_email: model.email,
    signer_email: model.email
  };
  try {
    var tobesignedRecord = await pb.collection("credentials").create(data);
    console.log(tobesignedRecord);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error saving credential", msg: error.message });
    return;
  }
  alert("Credential saved!!");
  goHome();
}
