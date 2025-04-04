import {
  decodeUnsafeJWT
} from "../chunks/chunk-3475HZHE.js";
import {
  Client
} from "../chunks/chunk-K6L5OUL6.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/ListOfferingsPage.js
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
var pageName = "ListOfferingsPage";
window.MHR.register(
  pageName,
  class extends window.MHR.AbstractPage {
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
      this.loginData = pb.authStore.model.commonName;
      try {
        var records = await pb.collection("credentials").getFullList({
          sort: "-created"
        });
      } catch (error) {
        pb.authStore.clear();
        console.log(error);
        gotoPage("ErrorPage", { title: "Error accessing credentials", msg: error.message });
        return;
      }
      var theHtml;
      theHtml = listCredentialOffers(records);
      this.render(theHtml, false);
    }
  }
);
function listCredentialOffers(records) {
  const user = pb.authStore.model.commonName;
  return html`
      <ion-card>
         <ion-card-header>
            <ion-card-title>List of Credentials</ion-card-title>
         </ion-card-header>

         <ion-card-content>
            ${records.length == 0 ? html`<h1>No records</h1>` : html`
                    <div class="w3-responsive">
                       <table class="w3-table w3-table-all">
                          <tr>
                             <th></th>
                             <th>Created</th>
                             <th>Status</th>
                             <th>Holder</th>
                             <th>Creator</th>
                             <th>Signer</th>
                          </tr>

                          ${records.map((cred) => {
    return html` <tr>
                                <td>
                                   <ion-button
                                      size="small"
                                      @click=${() => gotoPage("DisplayOfferingQRCode", cred)}
                                   >
                                      View
                                   </ion-button>
                                </td>
                                <td>${cred.created}</td>
                                <td>${cred.status}</td>
                                <td>${cred.email}</td>
                                <td>${cred.creator_email}</td>
                                <td>${cred.signer_email}</td>
                             </tr>`;
  })}
                       </table>
                    </div>
                 `}
         </ion-card-content>

         <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => gotoPage("CreateOfferingPage")}>
               ${T("Create New Credential")}
            </ion-button>
         </div>
      </ion-card>
   `;
}
window.MHR.register(
  "DisplayOfferingQRCode",
  class extends window.MHR.AbstractPage {
    constructor(id) {
      super(id);
    }
    async enter(cred) {
      const theHtml = renderMandateReadOnly(cred);
      this.render(theHtml, false);
    }
  }
);
function renderMandateReadOnly(cred) {
  console.log("Status", cred.status);
  var decoded = decodeUnsafeJWT(cred.raw);
  const mandate = decoded.body.credentialSubject.mandate;
  const mandator = mandate.mandator;
  console.log(mandator);
  const mandatee = mandate.mandatee;
  console.log(mandatee);
  const powers = mandate.power;
  console.log(powers);
  var theHtml = html`
      <ion-card>
         <ion-card-header>
            <ion-card-title>Credential Offer</ion-card-title>
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
                           <ion-input
                              id="OrganizationIdentifier"
                              label="OrganizationIdentifier:"
                              label-placement="stacked"
                              value="${mandator.organizationIdentifier}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="Organization"
                              label="Organization:"
                              label-placement="stacked"
                              value="${mandator.organization}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="CommonName"
                              label="CommonName:"
                              label-placement="stacked"
                              value="${mandator.commonName}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="EmailAddress"
                              label="EmailAddress:"
                              label-placement="stacked"
                              value="${mandator.emailAddress}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="SerialNumber"
                              label="SerialNumber:"
                              label-placement="stacked"
                              value="${mandator.serialNumber}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="Country"
                              label="Country:"
                              label-placement="stacked"
                              value="${mandator.country}"
                              readonly
                           ></ion-input>
                        </ion-item>
                     </ion-item-group>
                  </ion-col>

                  <ion-col size="12" size-md="6">
                     <ion-item-group>
                        <ion-item-divider>
                           <ion-label> Mandatee (Holder and Subject) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                           <ion-input
                              id="first_name"
                              label="First name:"
                              label-placement="stacked"
                              value="${mandatee.firstName}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="last_name"
                              label="Last name:"
                              label-placement="stacked"
                              value="${mandatee.lastName}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="gender"
                              label="Gender:"
                              label-placement="stacked"
                              value="${mandatee.gender}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="email"
                              label="Email:"
                              label-placement="stacked"
                              value="${mandatee.email}"
                              readonly
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="mobile_phone"
                              label="Mobile phone:"
                              label-placement="stacked"
                              value="${mandatee.mobile_phone}"
                              readonly
                           ></ion-input>
                        </ion-item>
                     </ion-item-group>
                  </ion-col>
               </ion-row>

               <ion-row>
                  ${powers.map((pow, index) => {
    return html`
                        <ion-col size="12" size-md="6">
                           <ion-item-group>
                              <ion-item-divider>
                                 <ion-label> Powers (${index + 1} of ${powers.length}) </ion-label>
                              </ion-item-divider>

                              <ion-item>
                                 <ion-input
                                    label="Domain:"
                                    label-placement="stacked"
                                    value="DOME"
                                    readonly="true"
                                 ></ion-input>
                              </ion-item>

                              <ion-item>
                                 <ion-input
                                    label="Function:"
                                    label-placement="stacked"
                                    value="${pow.function}"
                                    readonly
                                 ></ion-input>
                              </ion-item>

                              <ion-item>
                                 <ion-input
                                    label="Allowed actions:"
                                    label-placement="stacked"
                                    value="${pow.action}"
                                    readonly
                                 ></ion-input>
                              </ion-item>
                           </ion-item-group>
                        </ion-col>
                     `;
  })}
               </ion-row>
            </ion-grid>
         </ion-card-content>

         <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => history.back()}> ${T("Back")} </ion-button>

            ${cred.status == "tobesigned" ? html`
                    <ion-button @click=${() => signCredentialOfferingLocal(cred)}>
                       ${T("Sign in Local")}
                    </ion-button>
                 ` : null}

            <ion-button @click=${() => sendReminder(cred.id)}> ${T("Send reminder")} </ion-button>
         </div>
      </ion-card>
   `;
  return theHtml;
}
async function sendReminder(id) {
  try {
    var record = await pb.send("/apisigner/sendreminder/" + id);
    console.log(record);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error sending reminder " + id, msg: error.message });
    return;
  }
  alert("Reminder sent");
}
async function signCredentialOfferingLocal(record) {
  window.location = "elsigner:";
  return;
  var learcred = decodeUnsafeJWT(record.raw).body;
  if (!learcred.credentialSubject) {
    gotoPage("ErrorPage", {
      title: "Invalid credential",
      msg: "signCredentialOfferingLocal: Invalid credential received"
    });
    return;
  }
  try {
    var result = await fetch("http://127.0.0.1/signcredential", {
      method: "POST",
      body: learcred,
      headers: {
        "Content-Type": "application/json"
      }
    });
    var signedCredential = result.signed;
    console.log(signedCredential);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error creating credential", msg: error.message });
    return;
  }
  record.status = "signed";
  record.raw = signedCredential;
  record.signer_email = pb.authStore.model.email;
  try {
    console.log("Storing signed credential in Record", record.id);
    const result2 = await pb.collection("credentials").update(record.id, record);
    console.log(result2);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error saving credential", msg: error.message });
    return;
  }
  alert("Credential signed!!");
  goHome();
  return;
}
