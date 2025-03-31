// @ts-check
import PocketBase from "../components/pocketbase.es.mjs";

const pb = new PocketBase(window.location.origin);

let gotoPage = window.MHR.gotoPage;
let goHome = window.MHR.goHome;
let storage = window.MHR.storage;
let myerror = window.MHR.storage.myerror;
let mylog = window.MHR.storage.mylog;
let html = window.MHR.html;

var pageName = "CreateOfferingPage";
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

         var theHtml;
         theHtml = mandateForm();
         this.render(theHtml, false);
      }
   }
);

// mandateForm presents the form for the Mandate
function mandateForm() {
   // Retrieve the user information from the local AuthStore
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
                           <ion-input
                              id="OrganizationIdentifier"
                              label="OrganizationIdentifier:"
                              label-placement="stacked"
                              value="${model.organizationIdentifier}"
                              ?readonly=${model.organizationIdentifier}
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="Organization"
                              label="Organization:"
                              label-placement="stacked"
                              value="${model.organization}"
                              ?readonly=${model.organization}
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="CommonName"
                              label="CommonName:"
                              label-placement="stacked"
                              value="${model.commonName}"
                              ?readonly=${model.commonName}
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="EmailAddress"
                              label="EmailAddress:"
                              label-placement="stacked"
                              value="${model.email}"
                              ?readonly=${model.email}
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="SerialNumber"
                              label="SerialNumber:"
                              label-placement="stacked"
                              value="${model.serialNumber}"
                              ?readonly=${model.serialNumber}
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="Country"
                              label="Country:"
                              label-placement="stacked"
                              value="${model.country}"
                              ?readonly=${model.country}
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
                              id="firstName"
                              label="First name:"
                              label-placement="stacked"
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="lastName"
                              label="Last name:"
                              label-placement="stacked"
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="gender"
                              label="Gender:"
                              label-placement="stacked"
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="email"
                              label="Email:"
                              label-placement="stacked"
                           ></ion-input>
                        </ion-item>
                        <ion-item>
                           <ion-input
                              id="mobile_phone"
                              label="Mobile phone:"
                              label-placement="stacked"
                           ></ion-input>
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
                           <ion-input
                              id="domain1"
                              label="Domain:"
                              label-placement="stacked"
                              value="DOME"
                              readonly="true"
                           ></ion-input>
                        </ion-item>

                        <ion-item>
                           <ion-select
                              id="function1"
                              label="Function:"
                              label-placement="stacked"
                              justify="start"
                              placeholder="Select the function"
                           >
                              <ion-select-option value="Onboarding">Onboarding</ion-select-option>
                              <ion-select-option value="ProductOffering"
                                 >Product Offering</ion-select-option
                              >
                           </ion-select>
                        </ion-item>

                        <ion-item>
                           <ion-label position="stacked">Allowed actions:</ion-label>
                           <ion-toggle
                              id="Execute1"
                              name="Execute"
                              label-placement="end"
                              justify="start"
                              >Execute</ion-toggle
                           >
                           <ion-toggle
                              id="Create1"
                              name="Create"
                              label-placement="end"
                              justify="start"
                              >Create</ion-toggle
                           >
                           <ion-toggle
                              id="Update1"
                              name="Update"
                              label-placement="end"
                              justify="start"
                              >Update</ion-toggle
                           >
                           <ion-toggle
                              id="Delete1"
                              name="Delete"
                              label-placement="end"
                              justify="start"
                              >Delete</ion-toggle
                           >
                        </ion-item>
                     </ion-item-group>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                     <ion-item-group>
                        <ion-item-divider>
                           <ion-label> Powers (2 of 2) </ion-label>
                        </ion-item-divider>

                        <ion-item>
                           <ion-input
                              id="domain2"
                              label="Domain:"
                              label-placement="stacked"
                              value="DOME"
                              readonly="true"
                           ></ion-input>
                        </ion-item>

                        <ion-item>
                           <ion-select
                              id="function2"
                              label="Function:"
                              label-placement="stacked"
                              justify="start"
                              placeholder="Select the function"
                           >
                              <ion-select-option value="Onboarding">Onboarding</ion-select-option>
                              <ion-select-option value="ProductOffering"
                                 >Product Offering</ion-select-option
                              >
                           </ion-select>
                        </ion-item>

                        <ion-item>
                           <ion-label position="stacked">Action:</ion-label>
                           <ion-toggle
                              id="Execute2"
                              name="Execute"
                              label-placement="end"
                              justify="start"
                              >Execute</ion-toggle
                           >
                           <ion-toggle
                              id="Create2"
                              name="Create"
                              label-placement="end"
                              justify="start"
                              >Create</ion-toggle
                           >
                           <ion-toggle
                              id="Update2"
                              name="Update"
                              label-placement="end"
                              justify="start"
                              >Update</ion-toggle
                           >
                           <ion-toggle
                              id="Delete2"
                              name="Delete"
                              label-placement="end"
                              justify="start"
                              >Delete</ion-toggle
                           >
                        </ion-item>
                     </ion-item-group>
                  </ion-col>
               </ion-row>
            </ion-grid>
         </ion-card-content>

         <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => createCredentialOffer()}> ${T("Create")} </ion-button>
            <ion-button @click=${() => window.MHR.cleanReload()}> ${T("Cancel")} </ion-button>
         </div>
      </ion-card>
   `;
}

async function createCredentialOffer() {
   debugger;
   const mandator = {
      OrganizationIdentifier: me("#OrganizationIdentifier").value,
      Organization: me("#Organization").value,
      CommonName: me("#CommonName").value,
      EmailAddress: me("#EmailAddress").value,
      SerialNumber: me("#SerialNumber").value,
      Country: me("#Country").value,
   };

   const mandatee = {
      firstName: me("#firstName").value,
      lastName: me("#lastName").value,
      gender: me("#gender").value,
      email: me("#email").value,
      mobile_phone: me("#mobile_phone").value,
   };

   var action1 = [];
   if (me("#Execute1").checked) {
      action1.push("execute");
   }
   if (me("#Create1").checked) {
      action1.push("create");
   }
   if (me("#Update1").checked) {
      action1.push("update");
   }
   if (me("#Delete1").checked) {
      action1.push("delete");
   }

   const power1 = {
      type: "Domain",
      domain: [me("#domain1").value],
      function: me("#function1").value,
      action: action1,
   };

   var action2 = [];
   if (me("#Execute2").checked) {
      action2.push("execute");
   }
   if (me("#Create2").checked) {
      action2.push("create");
   }
   if (me("#Update2").checked) {
      action2.push("update");
   }
   if (me("#Delete2").checked) {
      action2.push("delete");
   }

   const power2 = {
      type: "Domain",
      domain: [me("#domain2").value],
      function: me("#function2").value,
      action: action2,
   };

   var powers = [];
   if (me("#function1").value) {
      powers.push(power1);
   }
   if (me("#function2").value) {
      powers.push(power2);
   }

   // Some validations (not comprehensive)
   var errorMessages = [];
   if (!me("#email").value) {
      errorMessages.push(html`The email field of the Mandatee can not be empty.<br />`);
   }
   if (!power1.function || action1.length == 0) {
      errorMessages.push(html`At least one power should be specified.`);
   }

   if (errorMessages.length > 0) {
      gotoPage("ErrorPage", { title: "The form is invalid", msg: errorMessages, back: true });
      return;
   }

   const data = {
      Mandator: mandator,
      Mandatee: mandatee,
      Power: powers,
   };

   // Create the JSON structure of the credential but do not store anything yet in the server
   try {
      var jsonCredential = await pb.send("/apisigner/createjsoncredential", {
         method: "POST",
         body: JSON.stringify(data),
         headers: {
            "Content-Type": "application/json",
         },
      });
      console.log(jsonCredential);
   } catch (error) {
      gotoPage("ErrorPage", { title: "Error creating credential", msg: error.message });
      return;
   }

   gotoPage("DisplayOfferingPage", jsonCredential);

   // window.MHR.cleanReload()
}

window.MHR.register(
   "DisplayOfferingPage",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         super(id);
      }

      async enter(jsonCredential) {
         const learcred = JSON.stringify(jsonCredential, null, "  ");

         console.log("AuthStore is valid:", pb.authStore.isValid);
         console.log(pb.authStore.model);

         if (!pb.authStore.isValid || !pb.authStore.model.verified) {
            gotoPage("ErrorPage", { title: "User not verified" });
            return;
         }

         const theHtml = html`
            <div id="theVC" class="half-centered">
               <p>Review the proposed LEARCredential offer and confirm to send to server:</p>

               <pre><code class="language-json">${learcred}</code></pre>
            </div>

            <div class="ion-margin-start ion-margin-bottom">
               <ion-button @click=${() => storeOfferingInServer(jsonCredential)}>
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

         // Re-run the highlighter for the VC display
         //@ts-ignore
         Prism.highlightAll();
      }
   }
);

async function storeOfferingInServer(jsonCredential) {
   const userEmail = jsonCredential.credentialSubject.mandate.mandatee.email;
   const organizationIdentifier =
      jsonCredential.credentialSubject.mandate.mandator.organizationIdentifier;
   const learcred = JSON.stringify(jsonCredential);

   var model = pb.authStore.model;

   // Sign the credential in the server with the x509 certificate
   try {
      var result = await pb.send("/apisigner/signcredential", {
         method: "POST",
         body: learcred,
         headers: {
            "Content-Type": "application/json",
         },
      });
      var signedCredential = result.signed;
      console.log(signedCredential);
   } catch (error) {
      gotoPage("ErrorPage", { title: "Error creating credential", msg: error.message });
      return;
   }

   // Create the record in "tobesigned" status
   var data = {
      status: "offered",
      email: userEmail,
      organizationIdentifier: organizationIdentifier,
      type: "jwt_vc",
      raw: signedCredential,
      creator_email: model.email,
      signer_email: model.email,
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
