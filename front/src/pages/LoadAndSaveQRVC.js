import { credentialsSave } from "../components/db";
import { decodeUnsafeJWT } from "../components/jwt";
import {
   getOrCreateDidKey,
   importFromJWK,
   verify,
   signWithJWK,
   signJWT,
} from "../components/crypto";

import { renderAnyCredentialCard } from "../components/renderAnyCredential";

// Setup some local variables for convenience
let gotoPage = window.MHR.gotoPage;
let goHome = window.MHR.goHome;
let storage = window.MHR.storage;
let myerror = window.MHR.storage.myerror;
let mylog = window.MHR.storage.mylog;

// Make all requests via the server instead of from the JavaScript client
const viaServer = true;

const PRE_AUTHORIZED_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

window.MHR.register(
   "LoadAndSaveQRVC",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         super(id);
         this.VC = "";
         this.VCType = "";
         this.VCStatus = "";
      }

      /**
       * Handles the entry point for the LoadAndSaveQRVC page.
       * Processes QR code data to load and potentially save a Verifiable Credential (VC).
       *
       * @param {string} qrData - The data scanned from a QR code or received as a redirection.
       * @returns {Promise<void>}
       */
      async enter(qrData) {
         debugger;
         this.qrData = qrData;

         mylog(`LoadAndSaveQRVC: ${qrData}`);

         let html = this.html;

         // We should have received a URL that was scanned as a QR code or as a redirection
         // Perform some sanity checks on the parameter
         if (qrData == null || !qrData.startsWith) {
            myerror("The qrData parameter is not a string");
            gotoPage("ErrorPage", {
               title: "No data received",
               msg: "The qrData parameter is not a string",
            });
            return;
         }

         // Make sure it is a fully qualified URL
         if (!qrData.startsWith("https://") && !qrData.startsWith("http://")) {
            myerror("The scanned QR does not contain a valid URL");
            gotoPage("ErrorPage", {
               title: "No data received",
               msg: "The scanned QR does not contain a valid URL",
            });
            return;
         }

         // EBSI wallet conformance tests use redirections with these parameters
         if (qrData.includes("state=") && qrData.includes("auth-mock")) {
            gotoPage("EBSIRedirect", qrData);
            return;
         }

         // EBSI wallet conformance tests use redirections with these parameters
         if (qrData.includes("code=")) {
            gotoPage("EBSIRedirectCode", qrData);
            return;
         }

         if (qrData.includes("credential_offer_uri=")) {
            // The QR points to an an OpenID4VCI credential issuance offer

            // Retrieve the credential offer from the Issuer
            // Until CORS is enabled in Issuer, send request via a server
            this.credentialOffer = await getCredentialOffer(qrData, "via_server");

            // Save temporarily for redirections which cause page reloads
            await storage.settingsPut("credentialOffer", this.credentialOffer);
            mylog("credentialOffer", this.credentialOffer);

            // Get the credential_issuer url to retrieve its metadata
            const credential_issuer = this.credentialOffer["credential_issuer"];
            if (!credential_issuer) {
               let msg = "credential_issuer object not found in credentialOffer";
               myerror(msg);
               gotoPage("ErrorPage", {
                  title: "Invalid credentialOffer",
                  msg: msg,
               });
               return;
            }

            // Get the Issuer metadata from the well-known endpoint of the Issuer
            var issuerMetaData = await getIssuerMetadata(credential_issuer, "via_server");
            mylog("issuerMetaData", issuerMetaData);
            this.issuerMetaData = issuerMetaData;
            await storage.settingsPut("issuerMetaData", issuerMetaData);

            // Check that the credential endpoint url exists in the metadata
            var credentialEndpoint = issuerMetaData["credential_endpoint"];
            if (!credentialEndpoint) {
               let msg = "credentialEndpoint object not found in issuerMetaData";
               myerror(msg);
               gotoPage("ErrorPage", {
                  title: "Invalid issuerMetaData",
                  msg: msg,
               });
               return;
            }

            // If the 'authorization_server' is not specified, use the same url as the issuer
            var authorizationServer = issuerMetaData["authorization_server"];
            if (!authorizationServer) {
               authorizationServer = issuerMetaData["credential_issuer"];
            }
            if (!authorizationServer) {
               let msg = "'authorizationServer' object not found in issuerMetaData";
               myerror(msg);
               gotoPage("ErrorPage", {
                  title: "Invalid issuerMetaData",
                  msg: msg,
               });
               return;
            }

            // Get the AuthServer metadata from the well-known endpoint of the Authentication Server
            var authServerMetaData = await getAuthServerMetadata(authorizationServer);
            this.authServerMetaData = authServerMetaData;
            await storage.settingsPut("authServerMetaData", authServerMetaData);

            // The grant object in the credential offer will determine the type of flow to execute
            const grants = this.credentialOffer["grants"];
            if (!grants) {
               let msg = "grants object not found in credentialOffer";
               myerror(msg);
               gotoPage("ErrorPage", {
                  title: "Invalid credentialOffer",
                  msg: msg,
               });
               return;
            }

            // Check the type of authorization flows supported by Issuer
            const authorization_code = grants["authorization_code"];
            if (authorization_code) {
               await this.renderAuthCodeFlow(
                  this.credentialOffer,
                  issuerMetaData,
                  authServerMetaData
               );
               return;
            } else if (grants[PRE_AUTHORIZED_CODE_GRANT_TYPE]) {
               await this.startPreAuthorizedCodeFlow();
               return;
            } else {
               let msg = `Unsupported authorization flow type found in grants`;
               myerror(msg);
               gotoPage("ErrorPage", { title: "Invalid grants", msg: msg });
               return;
            }
         } else {
            mylog("Non-standard issuance");
            // This is a non-standard nechanism to issue credentials (easier in controlled environments).
            // We have received a URL that was scanned as a QR code.
            // First we should do a GET to the URL to retrieve the VC.

            const theurl = new URL(qrData);
            this.OriginServer = theurl.origin;
            console.log("Origin:", this.OriginServer);

            var result = await doGETJSON(qrData);

            // Store some values to facilitate later retrieval
            this.VC = result["credential"];
            this.VCId = result["id"];
            this.VCType = result["type"];
            this.VCStatus = result["status"];

            // We only process credentials in 'offered' or 'signed' status
            if (this.VCStatus == "offered" || this.VCStatus == "signed") {
               // Get the HTML for the credential
               try {
                  this.renderedVC = this.prerenderCredential(this.VC, this.VCType, this.VCStatus);
               } catch (error) {
                  this.showError(error.name, error.message);
                  return;
               }

               if (this.VCStatus == "offered") {
                  // The credential has been offered, and the user can authorise its issuance or not
                  let theHtml = this.html`
              <ion-card color="warning">
                <ion-card-content>
                  <p>
                    <b>
                      ${T("You received a proposal for a Verifiable Credential")}.
                      ${T("You can accept it, or cancel the operation.")}
                    </b>
                  </p>
                </ion-card-content>
              </ion-card>

              ${this.renderedVC}
            `;
                  this.render(theHtml);
                  return;
               } else if (this.VCStatus == "signed") {
                  // The credential is already signed. The user has the option to store it in her wallet
                  let theHtml = this.html`
              <ion-card color="warning">
                <ion-card-content>
                  <p>
                    <b>
                      ${T("You received a Verifiable Credential")}.
                      ${T(
                         "You can save it in this device for easy access later, or cancel the operation."
                      )}
                    </b>
                  </p>
                </ion-card-content>
              </ion-card>

              ${this.renderedVC}
            `;
                  this.render(theHtml);
                  return;
               }
            }

            // The credential is not in a correct state. Present an error screen
            this.showError(
               "Invalid credential",
               "The credential is neither in 'offered' nor 'signed' status"
            );
         }
      }

      /**
       * Updates a credential by sending a POST request to the credential endpoint.
       *
       * @param {string} proof - The JWT proof to include in the request.
       * @param {string} credentialEndpoint - The URL of the credential endpoint.
       * @returns {Promise<object>} The credential response from the server.
       * @throws {Error} If the request fails or returns an error status.
       */
      async updateCredentialPOST(proof, credentialEndpoint) {
         var credentialReq = {
            // types: credentialTypes,
            format: "jwt_vc",
            proof: {
               proof_type: "jwt",
               jwt: proof,
            },
         };

         console.log("Body " + JSON.stringify(credentialReq));
         let response = await fetch(credentialEndpoint, {
            method: "POST",
            cache: "no-cache",
            headers: {
               "Content-Type": "application/json",
               // 'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify(credentialReq),
            mode: "cors",
         });

         if (response.ok) {
            // The reply is the complete JWT
            const credentialResponse = await response.json();
            mylog(credentialResponse);
            return credentialResponse;
         } else {
            if (response.status == 400) {
               throw new Error("Bad request 400 retrieving credential");
            } else {
               throw new Error(response.statusText);
            }
         }
      }

      /**
       * Starts the pre-authorized code flow by prompting the user for the PIN that the Issuer sent.
       *
       * @returns {Promise<void>}
       */
      async startPreAuthorizedCodeFlow() {
         let theHtml = this.html`
        <ion-card style="max-width:600px">
          <ion-card-content>
            <p>Enter the PIN you have received in your email.</p>
            <ion-input
              id="thepin"
              label="PIN"
              label-placement="stacked"
              type="number"
              placeholder="0000"
            ></ion-input>
          </ion-card-content>

          <div class="ion-margin-start ion-margin-bottom">
            <ion-button
              @click=${async () => {
                 const ionpin = document.getElementById("thepin");
                 const nativepin = await ionpin.getInputElement();
                 const pin = nativepin.value;
                 if (pin.length > 0) {
                    this.renderPreAuthorizedCodeFlow(pin);
                 }
              }}
            >
              ${T("Continue")}
            </ion-button>
          </div>
        </ion-card>
      `;
         this.render(theHtml);
      }

      /**
       * Renders the pre-authorized code flow after the user has entered the PIN.
       *
       * @param {string} user_pin - The PIN entered by the user.
       * @returns {Promise<void>}
       */
      async renderPreAuthorizedCodeFlow(user_pin) {
         try {
            this.user_pin = user_pin;
            const jwtCredential = await performPreAuthorizedCodeFlow(
               this.credentialOffer,
               this.issuerMetaData,
               this.authServerMetaData,
               user_pin
            );
            if (!jwtCredential) {
               myerror("No credential received");
               this.showError(
                  "No credential received",
                  "The server did not return a valid credential"
               );
               return;
            }

            // Store in an instance variable
            this.VC = jwtCredential;
            this.VCType = "jwt_vc_json";
            this.VCStatus = "signed";

            // Decode and render the credencial
            const decoded = decodeUnsafeJWT(jwtCredential);

            // Get the HTML for the credential
            try {
               this.renderedVC = this.prerenderCredential(this.VC, this.VCType, this.VCStatus);
            } catch (error) {
               this.showError(error.name, error.message);
               return;
            }

            // Ask the user if we should store the VC
            let theHtml = this.html`
            <ion-card color="warning">
               <ion-card-content>
               <p>
                  <b>
                     ${T("You received a Verifiable Credential")}.
                     ${T(
                        "You can save it in this device for easy access later, or cancel the operation."
                     )}
                  </b>
               </p>
               </ion-card-content>
            </ion-card>

            ${this.renderedVC}
            `;
            this.render(theHtml);
         } catch (error) {
            debugger;
            myerror(error);
            this.showError(error.name, error.message);
         }
      }

      /**
       * Renders the authorization code flow.
       *
       * @param {object} credentialOffer - The credential offer object.
       * @param {object} issuerMetaData - The issuer metadata object.
       * @param {object} authServerMetaData - The authorization server metadata object.
       * @returns {Promise<void>}
       */
      async renderAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {
         const jwtCredential = await performAuthCodeFlow(
            credentialOffer,
            issuerMetaData,
            authServerMetaData
         );

         // Store in an instance variable
         this.VC = jwtCredential;
         this.VCType = "EBSI";

         // Decode and render the credencial
         const decoded = decodeUnsafeJWT(jwtCredential);
         this.renderedVC = this.renderEBSICredential(decoded);

         // Ask the user if we should store the VC
         let theHtml = this.html`
        <ion-card color="warning">
          <ion-card-content>
            <p>
              <b>
                ${T("You received a Verifiable Credential")}.
                ${T(
                   "You can save it in this device for easy access later, or cancel the operation."
                )}
              </b>
            </p>
          </ion-card-content>
        </ion-card>

        ${this.renderedVC}
      `;
         this.render(theHtml);
      }

      /**
       * Accepts a credential offer by updating it with the user's DID and sending it back to the server.
       *
       * @returns {Promise<void>}
       */
      async acceptVC() {
         console.log("Accept VC " + this.VC);
         if (this.VCStatus == "offered") {
            // We should update the credential offer with the did of the user

            var myDid = await getOrCreateDidKey();
            const theProof = await generateDIDKeyProof(myDid, this.OriginServer, "1234567890");
            debugger;
            var result = await this.updateCredentialPOST(theProof, this.qrData);
            console.log("acceptVC", result);

            // Display result page
            gotoPage("VCAcceptedPage");
            return;
         }
      }

      /**
       * Saves the Verifiable Credential (VC) to the local storage.
       *
       * @returns {Promise<void>}
       */
      async saveVC() {
         var replace = false;

         console.log("Save VC " + this.VC);

         if (this.VCType == "jwt_vc_json") {
            debugger;
            // The credential is in JWT format, lets decode it
            const decoded = decodeUnsafeJWT(this.VC);

            // Prepare for saving the credential in the local storage
            var credStruct = {
               type: this.VCType,
               status: "signed",
               encoded: this.VC,
               decoded: decoded.body?.vc,
               id: decoded.body.jti,
            };

            // Save the credential, if there is no other one with the same id
            var saved = await credentialsSave(credStruct, false);
            if (!saved) {
               return;
            }

            alert("Credential succesfully saved");
            // Reload the application with a clean URL
            location = window.location.origin + window.location.pathname;
         } else if (this.VCType == "EBSI") {
            const decodedJWT = decodeUnsafeJWT(this.VC);
            const decoded = decodedJWT.body.vc;

            var credStruct = {
               type: "EBSI",
               status: this.VCStatus,
               encoded: this.VC,
               decoded: decoded,
            };
            var saved = await credentialsSave(credStruct, replace);
            if (!saved) {
               return;
            }
         } else if (this.VCType == "jwt_vc") {
            debugger;

            if (this.VCStatus == "offered") {
               // We should update the credential offer with the did of the user

               var myDid = await getOrCreateDidKey();

               // Update the credential with the did:key
               var sendidRequest = {
                  did: myDid.did,
               };

               // Send the DID to the Issuer
               const senddidURL = `${this.OriginServer}/apiuser/senddid/${this.VCId}`;
               var result = await doPOST(senddidURL, sendidRequest);
               if (!result) {
                  return;
               }
               console.log("after doPOST sending the DID");

               // We received back the updated credential. Status must be 'tobesigned'
               this.VC = result["credential"];
               this.VCId = result["id"];
               this.VCType = result["type"];
               this.VCStatus = result["status"];
            }

            // The credential is in JWT format, lets decode it
            const decoded = decodeUnsafeJWT(this.VC);

            // Prepare for saving the credential in the local storage
            var credStruct = {
               type: this.VCType,
               status: this.VCStatus,
               encoded: this.VC,
               decoded: decoded.body,
               id: decoded.body.id,
            };

            // If the credential already exists, we only replace it if it is 'signed'
            if (this.VCStatus == "signed") {
               replace = true;
            }
            var saved = await credentialsSave(credStruct, replace);
            if (!saved) {
               return;
            }

            alert("Credential succesfully saved");
         } else {
            const decoded = JSON.parse(this.VC);

            var credStruct = {
               type: "w3cvc",
               status: this.VCStatus,
               encoded: this.VC,
               decoded: decoded,
            };
            var saved = await credentialsSave(credStruct, replace);
            if (!saved) {
               return;
            }
         }

         // Reload the application with a clean URL
         location = window.location.origin + window.location.pathname;
         return;
      }

      /**
       * Reloads the application with a clean URL.
       *
       * @returns {void}
       */
      cleanReload() {
         // Reload the application with a clean URL
         location = window.location.origin + window.location.pathname;
         return;
      }

      /**
       * Renders an EBSI credential.
       *
       * @param {object} vcdecoded - The decoded credential object.
       * @returns {HTMLElement} The rendered HTML element.
       */
      renderEBSICredential(vcdecoded) {
         const vc = vcdecoded.body.vc;
         const vcTypeArray = vc["type"];

         // Get the last element of the array
         const vcType = vcTypeArray[vcTypeArray.length - 1];

         const div = this.html`
        <ion-card>
          <ion-card-header>
            <ion-card-title>${vcType}</ion-card-title>
            <ion-card-subtitle>EBSI</ion-card-subtitle>
          </ion-card-header>

          <ion-card-content class="ion-padding-bottom">
            <div>
              <p>Issuer: ${vc.issuer}</p>
            </div>
          </ion-card-content>

          <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => this.cleanReload()}>
              <ion-icon slot="start" name="chevron-back"></ion-icon>
              ${T("Do not save")}
            </ion-button>

            <ion-button @click=${() => this.saveVC()}>
              <ion-icon slot="start" name="person-add"></ion-icon>
              ${T("Save credential")}
            </ion-button>
          </div>
        </ion-card>
      `;
         return div;
      }

      /**
       * Pre-renders a credential based on its type and status.
       *
       * @param {string} vcencoded - The encoded credential.
       * @param {string} vctype - The type of the credential.
       * @param {string} vcstatus - The status of the credential.
       * @returns {HTMLElement} The rendered HTML element.
       */
      prerenderCredential(vcencoded, vctype, vcstatus) {
         if (vctype == "jwt_vc" || vctype == "jwt_vc_json") {
            var decoded = decodeUnsafeJWT(vcencoded);
         } else {
            decoded = vcencoded;
         }

         if (vctype == "jwt_vc_json") {
            const vc = decoded.body.vc;
            const credCard = renderAnyCredentialCard(vc, vcstatus);

            return this.html`
            <ion-card>
              ${credCard}
    
              <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => this.cleanReload()}>
                  <ion-icon slot="start" name="chevron-back"></ion-icon>
                  ${T("Do not save")}
                </ion-button>
    
                <ion-button @click=${() => this.saveVC()}>
                  <ion-icon slot="start" name="person-add"></ion-icon>
                  ${T("Save credential")}
                </ion-button>
              </div>
            </ion-card>
            `;
         }

         const vc = decoded.body;

         const vctypes = vc.type;

         const credCard = renderAnyCredentialCard(vc, vcstatus);

         let html = this.html;

         if (vcstatus == "offered") {
            const div = this.html`
          <ion-card>
            ${credCard}

            <div class="ion-margin-start ion-margin-bottom">
              <ion-button @click=${() => this.cleanReload()}>
                <ion-icon slot="start" name="chevron-back"></ion-icon>
                ${T("Cancel")}
              </ion-button>

              <ion-button @click=${() => this.acceptVC()}>
                <ion-icon slot="start" name="person-add"></ion-icon>
                ${T("Accept credential offer")}
              </ion-button>
            </div>
          </ion-card>
        `;
            return div;
         }

         const div = this.html`
        <ion-card>
          ${credCard}

          <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => this.cleanReload()}>
              <ion-icon slot="start" name="chevron-back"></ion-icon>
              ${T("Do not save")}
            </ion-button>

            <ion-button @click=${() => this.saveVC()}>
              <ion-icon slot="start" name="person-add"></ion-icon>
              ${T("Save credential")}
            </ion-button>
          </div>
        </ion-card>
      `;
         return div;
      }
   }
);

/**
 * Performs the authorization code flow for credential issuance.
 *
 * @param {object} credentialOffer - The credential offer object.
 * @param {object} issuerMetaData - The issuer metadata object.
 * @param {object} authServerMetaData - The authorization server metadata object.
 * @returns {Promise<string>} The issued credential in JWT format.
 * @throws {Error} If any step in the flow fails.
 */
async function performAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {
   // Get the credential supported by issuer
   const credentialTypes = credentialOffer.credentials[0].types;

   // The state will be used by the issuer to match request/reply
   const issuer_state = credentialOffer["grants"]["authorization_code"]["issuer_state"];

   // This is the url of the Authorization Server
   const authorization_endpoint = authServerMetaData["authorization_endpoint"];

   // Get my DID
   const myDID = await window.MHR.storage.didFirst();

   // **************************************
   // **************************************
   // Step 1: GET Authorization Request
   // **************************************
   // **************************************
   console.log("Step 1: GET Authorization Request");

   // It has the following form:
   //
   // GET from https://api-conformance.ebsi.eu/conformance/v3/auth-mock/authorize
   // ?response_type=code
   // &scope=openid
   // &state=tracker%3Dvcfghhj
   // &client_id=did%3Akey%3Az2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbsEYvdrjxMjQ4tpnje9BDBTzuNDP3knn6qLZErzd4bJ5go2CChoPjd5GAH3zpFJP5fuwSk66U5Pq6EhF4nKnHzDnznEP8fX99nZGgwbAh1o7Gj1X52Tdhf7U4KTk66xsA5r
   // &authorization_details=%5B%7B%22type%22%3A%22openid_credential%22%2C%22format%22%3A%22jwt_vc%22%2C%22types%22%3A%5B%22VerifiableCredential%22%2C%22VerifiableAttestation%22%2C%22CTWalletInTime%22%5D%7D%5D
   // &redirect_uri=openid%3A
   // &nonce=glkFFoisdfEui43
   // &code_challenge=YjI0ZTQ4NTBhMzJmMmZhNjZkZDFkYzVhNzlhNGMyZDdjZDlkMTM4YTY4NjcyMTA5M2Q2OWQ3YjNjOGJlZDBlMSAgLQo%3D
   // &code_challenge_method=S256
   // &client_metadata=%7B%22vp_formats_supported%22%3A%7B%22jwt_vp%22%3A%7B%22alg%22%3A%5B%22ES256%22%5D%7D%2C%22jwt_vc%22%3A%7B%22alg%22%3A%5B%22ES256%22%5D%7D%7D%2C%22response_types_supported%22%3A%5B%22vp_token%22%2C%22id_token%22%5D%2C%22authorization_endpoint%22%3A%22openid%3A%22%7D

   // Calculate a code_challenge as BASE64URL-ENCODE(SHA256(code_verifier as UTF-8 string))
   // Where code_verifier is a secure random, which will be used with token endpoint.
   // It is between 43 and 128 characters long, and contains characters A-Z, a-z, 0-9, hyphen, period, underscore, and tilde.
   // See RFC 7636 for more information
   // TODO: should generate a random string
   const code_verifier = "this_is_a_code_verifierthis_is_a_code_verifierthis_is_a_code_verifier";
   const code_challenge = await hashFromString(code_verifier);
   console.log("code_challenge", code_challenge);

   // Specify what we are requesting
   var authorization_details = [
      {
         type: "openid_credential",
         format: "jwt_vc",
         types: credentialTypes,
      },
   ];

   // If the Credential Issuer metadata contains an authorization_server parameter,
   // the authorization detail's locations common data field MUST be set to the Credential Issuer Identifier value.
   var authorizationServer = issuerMetaData["authorization_server"];
   if (authorizationServer) {
      authorization_details[0]["locations"] = [issuerMetaData["credential_issuer"]];
   }

   var client_metadata = {
      vp_formats_supported: {
         jwt_vp: { alg: ["ES256"] },
         jwt_vc: { alg: ["ES256"] },
      },
      response_types_supported: ["vp_token", "id_token"],
      authorization_endpoint: window.location.origin,
   };

   var formAttributes = {
      response_type: "code",
      scope: "openid",
      issuer_state: issuer_state,
      client_id: myDID.did,
      authorization_details: JSON.stringify(authorization_details),
      redirect_uri: window.location.origin,
      nonce: "thisisthenonce",
      code_challenge: code_challenge,
      code_challenge_method: "S256",
      client_metadata: JSON.stringify(client_metadata),
   };
   // Encode in urlForm
   var formBody = [];
   for (var property in formAttributes) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formAttributes[property]);
      formBody.push(encodedKey + "=" + encodedValue);
   }
   formBody = formBody.join("&");

   // There will be an HTTP 302 Redirection after this
   // We will receive the url to invoke as a result from the POST
   debugger;
   console.log("AuthRequest", authorization_endpoint + "?" + formBody);
   let resp = await fetch(authorization_endpoint + "?" + formBody, {
      cache: "no-cache",
      mode: "cors",
   });

   // Throw an error if something went wrong
   if (!resp.ok || !resp.redirected) {
      throw new Error("error retrieving OpenID metadata");
   }

   var redirectedURL = resp.url;
   mylog(redirectedURL);
   var urlParams = new URL(redirectedURL).searchParams;

   const response_type = decodeURIComponent(urlParams.get("response_type"));
   if (response_type == "vp_token") {
      const pd = decodeURIComponent(urlParams.get("presentation_definition"));
      console.log("Presentation Definition", pd);
      throw new Error("Response type vp_token not implemented yet");
   } else if (response_type == "id_token") {
      // Do nothing. This is for documentation purposes
   } else {
      throw new Error("Invalid response_type: " + response_type);
   }

   // **************************************
   // **************************************
   // Step 2: ID Token Request
   //
   // The authorization server requests an ID Token from the Wallet to authenticate the DID without any claims.
   // The request from the Auth Server comes in the redirected URL received as a response of the authorization request.
   //
   // **************************************
   // **************************************
   console.log("Step 2: ID Token Request");

   const redirect_uri = decodeURIComponent(urlParams.get("redirect_uri"));
   console.log("redirect_uri", redirect_uri);
   const client_id = decodeURIComponent(urlParams.get("client_id"));
   const state = decodeURIComponent(urlParams.get("state"));
   var nonce = decodeURIComponent(urlParams.get("nonce"));

   // Generate the ID Token according to the request from the authorization server
   const IDToken = await generateEBSIIDToken(myDID, client_id, state, nonce);
   console.log("IDToken", IDToken);

   // **************************************
   // **************************************
   // Step 3: Send ID Token Response to Authorization Server
   //
   // The Wallet answers the ID Token Request by providing the id_token in the redirect_uri as instructed by response_mode
   // of direct_post. The id_token must be signed with the DID document's authentication key.
   // The state parameter is mandatory for the ID Token Response when it is present in the ID Token Request sent by
   // the Authorization Server. In such cases, the Wallet must ensure that the values of the state parameter are identical in both.
   //
   // **************************************
   // **************************************
   console.log("Step 2: ID Token Request");

   var formAttributes = {
      id_token: IDToken,
      state: state,
   };

   formBody = [];
   for (var property in formAttributes) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formAttributes[property]);
      formBody.push(encodedKey + "=" + encodedValue);
   }
   formBody = formBody.join("&");
   console.log("Body", formBody);

   // There will be an HTTP 302 Redirection after this
   // We will receive the url to invoke as a result from the POST
   resp = await fetch(redirect_uri, {
      method: "POST",
      redirect: "follow",
      cache: "no-cache",
      headers: {
         "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
      mode: "cors",
   });

   // Throw an error if something went wrong
   if (!resp.ok || !resp.redirected) {
      throw new Error(resp.statusText);
   }

   redirectedURL = resp.url;

   // **************************************
   // **************************************
   // Step 4: Receive Authorization response
   //
   // The redirected URL contains the Authorization Response, with the authorization code. The url is something like:
   // https://wallet.mycredential.eu?code=530dfe71-845b-4310-acb6-06023a036ff5
   //
   // **************************************
   // **************************************
   console.log("Step 4: Receive Authorization response");
   mylog(redirectedURL);
   var urlParams = new URL(redirectedURL).searchParams;

   // Get the authorization code from the URL
   const code = decodeURIComponent(urlParams.get("code"));
   console.log("code", code);

   // **************************************
   // **************************************
   // Step 5: Request Access Token from Authorization Server
   //
   // The Wallet (Relying Party) proceeds with the code flow by calling the Token Endpoint with the required details
   // and providing a code_verifier corresponding to the initial Authorisation Request code_challenge.
   //
   // **************************************
   // **************************************
   console.log("Step 5: Request Access Token from Authorization Server");

   const tokenEndpoint = authServerMetaData.token_endpoint;

   var formAttributes = {
      grant_type: "authorization_code",
      client_id: myDID.did,
      code: code,
      code_verifier: code_verifier,
   };
   formBody = encodeFormAttributes(formAttributes);
   console.log(tokenEndpoint);
   console.log(formBody);

   // This request is a normal one and will not be redirected
   resp = await fetch(tokenEndpoint, {
      method: "POST",
      redirect: "follow",
      cache: "no-cache",
      headers: {
         "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
      mode: "cors",
   });

   if (!resp.ok) {
      throw new Error(resp.statusText);
   }

   // **************************************
   // **************************************
   // Step 6: Receive Access Token from Authorization Server
   //
   // The Access Token is delivered inside a response payload from a successful Token Endpoint initiation.
   // c_nonce (Challenge Nonce) must be stored until a new one is given. The response looks like:
   //
   // Content-Type: application/json
   // {
   //     "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp..sHQ",
   //     "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI4a5k..zEF",
   //     "token_type": "bearer",
   //     "expires_in": 86400,
   //     "id_token": "eyJodHRwOi8vbWF0dHIvdGVuYW50L..3Mz",
   //     "c_nonce": "PAPPf3h9lexTv3WYHZx8ajTe",
   //     "c_nonce_expires_in": 86400
   // }
   // **************************************
   // **************************************
   console.log("Step 6: Receive Access Token from Authorization Server");

   const authTokenObject = await resp.json();
   console.log("Auth Token object:", authTokenObject);

   // Get the nonce and access token from the retrieved object
   var nonce = authTokenObject.c_nonce;
   const access_token = authTokenObject.access_token;

   // **************************************
   // **************************************
   // Step 7: Send a Credential Request
   //
   // At this point, the Wallet has successfully obtained a valid Access Token, which can be used to gain access to
   // the Credential's Issuer.
   // The Relying Party proceeds by requesting issuance of the Verifiable Credential from the Issuer Mock.
   // The requested Credential must match the granted access. The DID document's authentication key must be used
   // for signing the JWT proof, where the DID must also match the one used for authentication.
   //
   // **************************************
   // **************************************
   console.log("Step 7: Send a Credential Request");

   // Get the proof object that we have to include in the Credential Request
   const proof = await generateDIDKeyProof(myDID, issuerMetaData.credential_issuer, nonce);

   // Get the credential from EBSI
   var credentialResponse = await requestCredential(
      proof,
      access_token,
      issuerMetaData.credential_endpoint,
      credentialTypes
   );

   var acceptance_token = credentialResponse["acceptance_token"];
   const max_iterations = 10;
   var iterations = 0;

   while (acceptance_token && iterations < max_iterations) {
      console.log("Waiting for credential ...");
      await delay(1000);
      console.log("Finished waiting for credential");

      // Get the credential from EBSI

      credentialResponse = await requestDeferredEBSICredential(
         acceptance_token,
         issuerMetaData["deferred_credential_endpoint"]
      );
      // credentialResponse = await requestEBSICredential(proof, acceptance_token, issuerMetaData.credential_endpoint, credentialTypes)
      console.log("CredentialResponse", credentialResponse);
      acceptance_token = credentialResponse["acceptance_token"];

      iterations = iterations + 1;
   }

   if (!credentialResponse.credential) {
      throw new Error("No credential after all retries");
   }

   // **************************************
   // **************************************
   // Step 8: Receive the credential
   //
   // After a successful request, the response payload will contain the requested credential. It looks like:
   //
   // Content-Type: application/json
   // {
   //   "format": "jwt_vc",
   //   "credential": "eyJ0eXAiOiJKV1QiLCJhbGciOi...Y5kwU_qJzvBWEVsBP8QvRlLvcWJDwyyGJF0YluuK2Cog",
   // }
   //
   // **************************************
   // **************************************
   console.log("Step 8: Receive the credential");

   return credentialResponse.credential;
}

function delay(ms) {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performPreAuthorizedCodeFlow(
   credentialOffer,
   issuerMetaData,
   authServerMetaData,
   user_pin
) {
   console.log("credentialOffer");
   console.log(credentialOffer);

   console.log("issuerMetaData");
   console.log(issuerMetaData);

   console.log("authServerMetaData");
   console.log(authServerMetaData);

   // Get the credential supported by issuer
   const credentialTypes = credentialOffer.credentials[0].types;

   // Get an accesstoken for retrieving the credential
   const tokenEndpoint = authServerMetaData["token_endpoint"];
   const code = credentialOffer["grants"][PRE_AUTHORIZED_CODE_GRANT_TYPE]["pre-authorized_code"];
   const authTokenObject = await getPreAuthToken(tokenEndpoint, code, user_pin, "via_server");

   // Get the nonce and access token from the retrieved object
   const nonce = authTokenObject.c_nonce;
   const access_token = authTokenObject.access_token;

   // Get my DID
   // const myDID = await window.MHR.storage.didFirst();

   var myDID = localStorage.getItem("domedid");
   myDID = JSON.parse(myDID);

   // Get the proof object that we have to include in the Credential Request
   const proof = await generateDIDKeyProof(myDID, issuerMetaData.credential_issuer, nonce);

   // Get the credential
   const credentialResponse = await requestCredential(
      proof,
      access_token,
      issuerMetaData.credential_endpoint,
      credentialTypes
   );

   return credentialResponse.credential;
}

async function getPreAuthToken(tokenEndpoint, preAuthCode, user_pin) {
   // Build the structure to send to the server
   var formAttributes = {
      grant_type: PRE_AUTHORIZED_CODE_GRANT_TYPE,
      tx_code: user_pin,
      "pre-authorized_code": preAuthCode,
   };

   // Encode in 'application/x-www-form-urlencoded' the body
   var formBody = [];
   for (var property in formAttributes) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formAttributes[property]);
      formBody.push(encodedKey + "=" + encodedValue);
   }
   formBody = formBody.join("&");
   mylog("getPreAuthToken Body: " + formBody);

   // Send to server
   var tokenBody = await doPOST(tokenEndpoint, formBody, "application/x-www-form-urlencoded");

   mylog("getPreAuthToken tokenBody:", tokenBody);
   return tokenBody;
}

async function requestCredential(proof, accessToken, credentialEndpoint, credentialTypes) {
   debugger;
   var credentialReq = {
      types: credentialTypes,
      format: "jwt_vc_json",
      proof: {
         proof_type: "jwt",
         jwt: proof,
      },
   };

   var credentialResponse = await doPOST(
      credentialEndpoint,
      credentialReq,
      "application/json",
      accessToken
   );
   mylog(credentialResponse);
   return credentialResponse;
}

async function requestDeferredEBSICredential(acceptance_token, deferredCredentialEndpoint) {
   let response = await fetch(deferredCredentialEndpoint, {
      method: "POST",
      cache: "no-cache",
      headers: {
         "Content-Type": "application/json",
         Authorization: "Bearer " + acceptance_token,
      },
      mode: "cors",
   });

   if (response.ok) {
      // The reply is the complete JWT
      const credentialResponse = await response.json();
      mylog(credentialResponse);
      return credentialResponse;
   } else {
      throw new Error(response.statusText);
   }
}

async function getCredentialOIDC4VCI(credentialEndpoint, accessToken, format, credential_type) {
   try {
      var credentialReq = {
         format: format,
         types: credential_type,
      };
      console.log("Body " + JSON.stringify(credentialReq));
      let response = await fetch(credentialEndpoint, {
         method: "POST",
         cache: "no-cache",
         headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
         },
         body: JSON.stringify(credentialReq),
         mode: "cors",
      });
      if (response.ok) {
         var credentialBody = await response.json();
      } else {
         if (response.status == 403) {
            alert.apply("error 403");
            window.MHR.goHome();
            return "Error 403";
         }
         var error = await response.text();
         myerror(error);
         window.MHR.goHome();
         alert(error);
         return null;
      }
   } catch (error2) {
      myerror(error2);
      alert(error2);
      return null;
   }
   console.log(credentialBody);
   return credentialBody;
}

/**
 * Retrieves the OpenID Credential Issuer metadata from the specified issuer address.
 *
 * @async
 * @function getIssuerMetadata
 * @param {string} issuerAddress - The base URL of the OpenID Credential Issuer.
 * @returns {Promise<object>} A promise that resolves with the issuer metadata object.
 * @throws {Error} Throws an error if the request fails or the response is not valid JSON.
 */
async function getIssuerMetadata(issuerAddress) {
   mylog("IssuerMetadata at", issuerAddress + "/.well-known/openid-credential-issuer");
   var openIdInfo = await doGETJSON(issuerAddress + "/.well-known/openid-credential-issuer");
   return openIdInfo;
}

/**
 * Retrieves the OpenID Authorization Server metadata from the specified authorization server address.
 *
 * @async
 * @function getAuthServerMetadata
 * @param {string} authServerAddress - The base URL of the OpenID Authorization Server.
 * @returns {Promise<object>} A promise that resolves with the authorization server metadata object.
 * @throws {Error} Throws an error if the request fails or the response is not valid JSON.
 */
async function getAuthServerMetadata(authServerAddress) {
   mylog("AuthServerMetadata at", authServerAddress);
   var openIdInfo = await doGETJSON(authServerAddress + "/.well-known/openid-configuration");
   return openIdInfo;
}

/**
 * Retrieves a credential offer from the specified URL.
 *
 * @async
 * @function getCredentialOffer
 * @param {string} url - The URL containing the credential offer URI.
 * @returns {Promise<object>} A promise that resolves with the credential offer object.
 * @throws {Error} Throws an error if the request fails or the response is not valid JSON.
 */
async function getCredentialOffer(url) {
   const urlParams = new URL(url).searchParams;
   const credentialOfferURI = decodeURIComponent(urlParams.get("credential_offer_uri"));
   console.log("Get: " + credentialOfferURI);

   var credentialOffer = await doGETJSON(credentialOfferURI);
   console.log(credentialOffer);
   return credentialOffer;
}

/**
 * Returns the string representation of the SHA-256 hash of a string
 *
 * @async
 * @param {string} string
 * @returns {Promise<string>}
 */
async function hashFromString(string) {
   const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(string));
   let astr = btoa(String.fromCharCode(...new Uint8Array(hash)));

   // Remove padding equal characters
   astr = astr.replace(/=+$/, "");

   // Replace non-url compatible chars with base64 standard chars
   astr = astr.replace(/\+/g, "-").replace(/\//g, "_");

   return astr;
}

function btoaUrl(input) {
   // Encode using the standard Javascript function
   let astr = btoa(input);

   // Replace non-url compatible chars with base64 standard chars
   astr = astr.replace(/\+/g, "-").replace(/\//g, "_");

   return astr;
}

function encodeFormAttributes(formAttributes) {
   var formBody = [];
   for (var property in formAttributes) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formAttributes[property]);
      formBody.push(encodedKey + "=" + encodedValue);
   }
   formBody = formBody.join("&");
   return formBody;
}

window.MHR.register(
   "EBSIRedirect",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         console.log("EBSIRedirect constructor");
         super(id);
      }

      async enter(qrData) {
         mylog(qrData);
         const urlParams = new URL(qrData).searchParams;

         const redirect_uri = decodeURIComponent(urlParams.get("redirect_uri"));
         console.log("redirect_uri", redirect_uri);
         const client_id = decodeURIComponent(urlParams.get("client_id"));
         const state = decodeURIComponent(urlParams.get("state"));
         const nonce = decodeURIComponent(urlParams.get("nonce"));

         // Get my DID
         const myDID = await window.MHR.storage.didFirst();

         const IDToken = await generateEBSIIDToken(myDID, client_id, state, nonce);
         console.log("IDToken", IDToken);

         var formAttributes = {
            id_token: IDToken,
            state: state,
         };

         var formBody = [];
         for (var property in formAttributes) {
            var encodedKey = encodeURIComponent(property);
            var encodedValue = encodeURIComponent(formAttributes[property]);
            formBody.push(encodedKey + "=" + encodedValue);
         }
         formBody = formBody.join("&");
         console.log("Body", formBody);

         let resp = await fetch(redirect_uri, {
            method: "POST",
            redirect: "follow",
            cache: "no-cache",
            headers: {
               "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formBody,
            mode: "cors",
         });

         if (resp.ok && resp.redirected) {
            // The reply is the complete JWT
            debugger;
            console.log(resp.url);
            location = resp.url;
            return;
         } else {
            throw new Error(resp.statusText);
         }
      }
   }
);

/**
 * generateDIDKeyProof creates a JWT which is used as a proof that the creator (the signer of the JWT) controls the
 * private key associated to the did:key (which is essentially the public key).
 * This concrete proof is specialised for OIDC4VCI flows, as indicated by the 'typ' field in the header.
 *
 * @async
 * @param {{did: string, privateKey: JsonWebKey, publicKey: JsonWebKey}} subjectDID The did and associated private key object for the Subject
 * @param {string} issuerID The identifier for the Issuer in the OID4VCI flow. Do not confuse with the issuer of the JWT,
 * which should be the person who will be receiving the Verifiable Credential.
 * @param {string} nonce The challenge received from the Issuer that we have to sign as a proof of possession
 * @returns {Promise<string>} The JWT in compact string form
 */
async function generateDIDKeyProof(subjectDID, issuerID, nonce) {
   const subjectKid = subjectDID.did;

   // Create the headers of the JWT
   var jwtHeaders = {
      typ: "openid4vci-proof+jwt",
      alg: "ES256",
      kid: subjectKid,
   };

   // It expires in one day (it could be much shorter in many flows)
   const iat = Math.floor(Date.now() / 1000) - 2;
   const exp = iat + 86500;

   // The issuer of the JWT is the person who will receive the Verifiable Credential at the end of the OID4VCI flow.
   // This is why the 'iss' claim is set to the did:key of the Subject.
   // The JWT is intended for the entity that is issuing the Verifiable Credential in the OID4VCI flow. This is the
   // reason why the 'aud' claim is set to the did (whatever did method is used) of the VC Issuer.
   var jwtPayload = {
      // iss: subjectDID.did,
      aud: issuerID,
      iat: iat,
      exp: exp,
      nonce: nonce,
   };

   // The JWT is signed with the private key associated to the did:key of the creator of the JWT.
   const jwt = await signJWT(jwtHeaders, jwtPayload, subjectDID.privateKey);

   return jwt;
}

async function generateEBSIIDToken(subjectDID, issuerID, state, nonce) {
   const keyStr = subjectDID.did.replace("did:key:", "");
   const subjectKid = subjectDID.did + "#" + keyStr;

   // Create the request proof for authenticating this request
   var jwtHeaders = {
      typ: "JWT",
      alg: "ES256",
      kid: subjectKid,
   };

   const iat = Math.floor(Date.now() / 1000) - 2;
   const exp = iat + 86500;

   var jwtPayload = {
      iss: subjectDID.did,
      sub: subjectDID.did,
      aud: issuerID,
      iat: iat,
      exp: exp,
      state: state,
      nonce: nonce,
   };

   const jwt = await signJWT(jwtHeaders, jwtPayload, subjectDID.privateKey);
   return jwt;
}

window.MHR.register(
   "EBSIRedirectCode",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         console.log("EBSIRedirectCode constructor");
         super(id);
      }

      async enter(qrData) {
         mylog(qrData);
         const urlParams = new URL(qrData).searchParams;
         debugger;

         const code = decodeURIComponent(urlParams.get("code"));
         console.log("redirect_uri", redirect_uri);

         // Get my DID
         const myDID = await window.MHR.storage.didFirst();

         const IDToken = await generateEBSIIDToken(myDID, client_id, state, nonce);
         console.log("IDToken", IDToken);
         debugger;

         var formAttributes = {
            id_token: IDToken,
            state: state,
         };

         var formBody = [];
         for (var property in formAttributes) {
            var encodedKey = encodeURIComponent(property);
            var encodedValue = encodeURIComponent(formAttributes[property]);
            formBody.push(encodedKey + "=" + encodedValue);
         }
         formBody = formBody.join("&");
         console.log("Body", formBody);

         let response = await fetch(redirect_uri, {
            method: "POST",
            cache: "no-cache",
            headers: {
               "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formBody,
            mode: "cors",
         });

         if (response.ok) {
            // The reply is the complete JWT
            return;
         } else {
            throw new Error(response.statusText);
         }
      }
   }
);

async function doGETText(serverURL) {
   var response = await fetch(serverURL, {
      cache: "no-cache",
      mode: "cors",
   });
   if (response.ok) {
      var responseText = await response.text();
      mylog(`doFetchText ${serverURL}:`, responseText);
      return responseText;
   } else {
      const errormsg = `doFetchText ${serverURL}: ${response.status}`;
      myerror(errormsg);
      throw new Error(errormsg);
   }
}

async function doGETJSON(serverURL) {
   if (!serverURL) {
      throw new Error("No serverURL");
   }

   var response;
   if (viaServer) {
      let forwardBody = {
         method: "GET",
         url: serverURL,
      };
      response = await fetch("/serverhandler", {
         method: "POST",
         body: JSON.stringify(forwardBody),
         headers: {
            "Content-Type": "application/json",
         },
         cache: "no-cache",
      });
   } else {
      response = await fetch(serverURL);
   }

   if (response.ok) {
      var responseJSON = await response.json();
      mylog(`doFetchJSON ${serverURL}:`, responseJSON);
      return responseJSON;
   } else {
      const errormsg = `doFetchJSON ${serverURL}: ${response.status}`;
      myerror(errormsg);
      throw new Error(errormsg);
   }
}

async function doPOST(serverURL, body, mimetype = "application/json", authorization) {
   debugger;
   if (!serverURL) {
      throw new Error("No serverURL");
   }

   var response;
   if (viaServer) {
      let forwardBody = {
         method: "POST",
         url: serverURL,
         mimetype: mimetype,
         body: body,
      };
      if (authorization) {
         forwardBody["authorization"] = authorization;
      }
      response = await fetch("/serverhandler", {
         method: "POST",
         body: JSON.stringify(forwardBody),
         headers: {
            "Content-Type": "application/json",
         },
         cache: "no-cache",
      });
   } else {
      response = await fetch(serverURL, {
         method: "POST",
         body: JSON.stringify(body),
         headers: {
            "Content-Type": mimetype,
         },
         cache: "no-cache",
      });
   }
   console.log(response);

   if (response.ok) {
      var responseJSON = await response.json();
      console.log(responseJSON);
      mylog(`doPOST ${serverURL}:`, responseJSON);
      return responseJSON;
   } else {
      const errormsg = `doPOST ${serverURL}: ${response.status}`;
      myerror(errormsg, body);
      throw new Error(errormsg);
   }
}

window.MHR.register(
   "VCAcceptedPage",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         super(id);
      }

      async enter() {
         let html = this.html;

         var theHtml = html`
            <ion-card>
               <ion-card-header>
                  <ion-card-title>Credential offer accepted</ion-card-title>
               </ion-card-header>

               <ion-card-content>
                  <div class="ion-margin-top">
                     <ion-text class="ion-margin-top"
                        >You have authorised the issuance of the Verifiable Credential.</ion-text
                     >
                  </div>
               </ion-card-content>

               <div class="ion-margin-start ion-margin-bottom">
                  <ion-button
                     @click=${() => {
                        window.MHR.cleanReload();
                     }}
                  >
                     <ion-icon slot="start" name="home"></ion-icon>
                     ${T("Home")}
                  </ion-button>
               </div>
            </ion-card>
         `;

         this.render(theHtml, false);
      }
   }
);
