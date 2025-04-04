// The logo in the header
import photo_man from "../img/photo_man.png";
import photo_woman from "../img/photo_woman.png";
import avatar from "../img/logo.png";

// Setup some local variables for convenience
let gotoPage = window.MHR.gotoPage;
let goHome = window.MHR.goHome;
let html = window.MHR.html;
let storage = window.MHR.storage;
let myerror = window.MHR.storage.myerror;
let mylog = window.MHR.storage.mylog;

/**
 * renderAnyCredentialCard creates the HTML rendering the credential as a Card.
 * The result can be embedded in other HTML for presenting the credential.
 * The minimum requirement is that the credential has a 'type' field according to the W3C VC spec.
 *
 * @param {JSONObject}  vc - The Verifiable Credential, in JSON format.
 * @param {string}  status - One of 'offered', 'tobesigned' or 'signed'.
 * @returns {Tag<HTMLElement>} - The HTML representing the credential
 */
export function renderAnyCredentialCard(vc, status = "signed") {
   var credCard;
   console.log("renderAnyCredentialCard", vc);
   if (vc.vc) {
      vc = vc.vc;
   }
   const vctypes = vc.type;

   if (vctypes.includes("LEARCredentialEmployee")) {
      credCard = renderLEARCredentialCard(vc, status);
   } else if (vctypes.includes("YAMKETServiceCertification")) {
      credCard = renderYAMKETCertificationCard(vc, status);
   } else {
      throw new Error(`credential type unknown: ${vctypes}`);
   }

   return credCard;
}

/**
 * renderLEARCredentialCard creates the HTML rendering the credential as a Card.
 * The result can be embedded in other HTML for presenting the credential.
 *
 * @param {JSONObject}  vc - The Verifiable Credential.
 * @param {string}  status - One of 'offered', 'tobesigned' or 'signed'.
 * @returns {Tag<HTMLElement>} - The HTML representing the credential
 */
export function renderLEARCredentialCard(vc, status) {
   mylog("renderLEARCredentialCard with:", status, vc);

   // TODO: perform some verifications to make sure the credential is a LEARCredential
   const vctypes = vc.type;
   if (vctypes.indexOf("LEARCredentialEmployee") == -1) {
      throw new Error("renderLEARCredentialCard: credential is not of type LEARCredentialEmployee");
   }

   const vcs = vc.credentialSubject;
   if (!vcs) {
      throw new Error("renderLEARCredentialCard: credentialSubject does not exist");
   }
   if (!vcs.mandate) {
      throw new Error("renderLEARCredentialCard: mandate object does not exist");
   }
   if (!vcs.mandate.mandator) {
      throw new Error("renderLEARCredentialCard: mandator data does not exist");
   }
   if (!vcs.mandate.mandatee) {
      throw new Error("renderLEARCredentialCard: mandatee data does not exist");
   }
   if (!vcs.mandate.power) {
      throw new Error("renderLEARCredentialCard: power data does not exist");
   }

   // Get the name of the holder (mandatee)
   // Support legacy credentials (for the moment) with snake case fields
   var first_name = vcs.mandate.mandatee.first_name;
   if (!first_name) {
      first_name = vcs.mandate.mandatee.firstName;
   }
   var last_name = vcs.mandate.mandatee.last_name;
   if (!last_name) {
      last_name = vcs.mandate.mandatee.lastName;
   }

   // The image to appear in the credential
   // TODO: Gender will not be in the credential in the future
   var avatar = photo_man;
   const gender = vcs.mandate.mandatee.gender;
   if (gender && gender.toUpperCase() == "F") {
      avatar = photo_woman;
   }

   // To make it easier for the template to present the powers
   const powers = vcs.mandate.power;

   const learCard = html`
      <ion-card-header>
         <ion-card-title>${first_name} ${last_name}</ion-card-title>
         <ion-card-subtitle>${vcs.mandate.mandator.organization}</ion-card-subtitle>
      </ion-card-header>

      <ion-card-content class="ion-padding-bottom">
         <div>
            <ion-list>
               <ion-item>
                  <ion-thumbnail slot="start">
                     <img alt="Avatar" src=${avatar} />
                  </ion-thumbnail>
                  <ion-label>
                     <table>
                        <tr>
                           <td><b>From:</b></td>
                           <td>${vc.validFrom.slice(0, 19)}</td>
                        </tr>
                        <tr>
                           <td><b>To: </b></td>
                           <td>${vc.validUntil.slice(0, 19)}</td>
                        </tr>
                     </table>
                  </ion-label>
                  ${status != "signed"
                     ? html`<ion-label color="danger"><b>Status: signature pending</b></ion-label>`
                     : null}
               </ion-item>

               ${powers.map((pow) => {
                  return html` <ion-item>
                     ${pow.tmf_domain
                        ? html`
                             <ion-label>
                                ${typeof pow.tmf_domain == "string"
                                   ? pow.tmf_domain
                                   : pow.tmf_domain[0]}
                                ${pow.tmf_function} [${pow.tmf_action}]
                             </ion-label>
                          `
                        : null}
                     ${pow.domain
                        ? html`
                             <ion-label>
                                ${typeof pow.domain == "string" ? pow.domain : pow.domain[0]}
                                ${pow.function} [${pow.action}]
                             </ion-label>
                          `
                        : null}
                  </ion-item>`;
               })}
            </ion-list>
         </div>
      </ion-card-content>
   `;
   return learCard;
}

/**
 * renderYAMKETCertificationCard creates the HTML rendering the credential as a Card.
 * The result can be embedded in other HTML for presenting the credential.
 * @param {JSONObject}  vc - The Verifiable Credential.
 * @param {string}  status - One of 'offered', 'tobesigned' or 'signed'.
 * @returns {Tag<HTMLElement>} - The HTML representing the credential
 */
export function renderYAMKETCertificationCard(vc, status) {
   console.log("renderYAMKETCertificationCard with:", status, vc);

   // TODO: perform some verifications to make sure the credential is a YAMKETServiceCertification

   const serviceName = "TheServiceName";

   const theCard = html`
      <ion-card-header>
         <ion-card-title>${serviceName}</ion-card-title>
         <ion-card-subtitle>Service certification</ion-card-subtitle>
      </ion-card-header>

      <ion-card-content class="ion-padding-bottom">
         <div>
            <ion-list>
               <ion-item>
                  <ion-thumbnail slot="start">
                     <img alt="Avatar" src=${avatar} />
                  </ion-thumbnail>
                  ${status != "signed"
                     ? html`<ion-label color="danger"><b>Status: signature pending</b></ion-label>`
                     : null}
               </ion-item>
            </ion-list>
         </div>
      </ion-card-content>
   `;
   return theCard;
}
