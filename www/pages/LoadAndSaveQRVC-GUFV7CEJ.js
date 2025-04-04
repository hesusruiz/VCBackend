import {
  credentialsSave
} from "../chunks/chunk-XVNNYFGL.js";
import "../chunks/chunk-BFXLU5VG.js";
import {
  getOrCreateDidKey,
  renderAnyCredentialCard,
  signJWT
} from "../chunks/chunk-TEA6LPUJ.js";
import {
  decodeUnsafeJWT
} from "../chunks/chunk-3475HZHE.js";
import "../chunks/chunk-CJ4ZD2TO.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/LoadAndSaveQRVC.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var viaServer = true;
var PRE_AUTHORIZED_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:pre-authorized_code";
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
      if (qrData == null || !qrData.startsWith) {
        myerror("The qrData parameter is not a string");
        gotoPage("ErrorPage", {
          title: "No data received",
          msg: "The qrData parameter is not a string"
        });
        return;
      }
      if (!qrData.startsWith("https://") && !qrData.startsWith("http://")) {
        myerror("The scanned QR does not contain a valid URL");
        gotoPage("ErrorPage", {
          title: "No data received",
          msg: "The scanned QR does not contain a valid URL"
        });
        return;
      }
      if (qrData.includes("state=") && qrData.includes("auth-mock")) {
        gotoPage("EBSIRedirect", qrData);
        return;
      }
      if (qrData.includes("code=")) {
        gotoPage("EBSIRedirectCode", qrData);
        return;
      }
      if (qrData.includes("credential_offer_uri=")) {
        this.credentialOffer = await getCredentialOffer(qrData, "via_server");
        await storage.settingsPut("credentialOffer", this.credentialOffer);
        mylog("credentialOffer", this.credentialOffer);
        const credential_issuer = this.credentialOffer["credential_issuer"];
        if (!credential_issuer) {
          let msg = "credential_issuer object not found in credentialOffer";
          myerror(msg);
          gotoPage("ErrorPage", {
            title: "Invalid credentialOffer",
            msg
          });
          return;
        }
        var issuerMetaData = await getIssuerMetadata(credential_issuer, "via_server");
        mylog("issuerMetaData", issuerMetaData);
        this.issuerMetaData = issuerMetaData;
        await storage.settingsPut("issuerMetaData", issuerMetaData);
        var credentialEndpoint = issuerMetaData["credential_endpoint"];
        if (!credentialEndpoint) {
          let msg = "credentialEndpoint object not found in issuerMetaData";
          myerror(msg);
          gotoPage("ErrorPage", {
            title: "Invalid issuerMetaData",
            msg
          });
          return;
        }
        var authorizationServer = issuerMetaData["authorization_server"];
        if (!authorizationServer) {
          authorizationServer = issuerMetaData["credential_issuer"];
        }
        if (!authorizationServer) {
          let msg = "'authorizationServer' object not found in issuerMetaData";
          myerror(msg);
          gotoPage("ErrorPage", {
            title: "Invalid issuerMetaData",
            msg
          });
          return;
        }
        var authServerMetaData = await getAuthServerMetadata(authorizationServer);
        this.authServerMetaData = authServerMetaData;
        await storage.settingsPut("authServerMetaData", authServerMetaData);
        const grants = this.credentialOffer["grants"];
        if (!grants) {
          let msg = "grants object not found in credentialOffer";
          myerror(msg);
          gotoPage("ErrorPage", {
            title: "Invalid credentialOffer",
            msg
          });
          return;
        }
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
          gotoPage("ErrorPage", { title: "Invalid grants", msg });
          return;
        }
      } else {
        mylog("Non-standard issuance");
        const theurl = new URL(qrData);
        this.OriginServer = theurl.origin;
        console.log("Origin:", this.OriginServer);
        var result = await doGETJSON(qrData);
        this.VC = result["credential"];
        this.VCId = result["id"];
        this.VCType = result["type"];
        this.VCStatus = result["status"];
        if (this.VCStatus == "offered" || this.VCStatus == "signed") {
          try {
            this.renderedVC = this.prerenderCredential(this.VC, this.VCType, this.VCStatus);
          } catch (error) {
            this.showError(error.name, error.message);
            return;
          }
          if (this.VCStatus == "offered") {
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
          jwt: proof
        }
      };
      console.log("Body " + JSON.stringify(credentialReq));
      let response = await fetch(credentialEndpoint, {
        method: "POST",
        cache: "no-cache",
        headers: {
          "Content-Type": "application/json"
          // 'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(credentialReq),
        mode: "cors"
      });
      if (response.ok) {
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
        this.VC = jwtCredential;
        this.VCType = "jwt_vc_json";
        this.VCStatus = "signed";
        const decoded = decodeUnsafeJWT(jwtCredential);
        try {
          this.renderedVC = this.prerenderCredential(this.VC, this.VCType, this.VCStatus);
        } catch (error) {
          this.showError(error.name, error.message);
          return;
        }
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
      this.VC = jwtCredential;
      this.VCType = "EBSI";
      const decoded = decodeUnsafeJWT(jwtCredential);
      this.renderedVC = this.renderEBSICredential(decoded);
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
        var myDid = await getOrCreateDidKey();
        const theProof = await generateDIDKeyProof(myDid, this.OriginServer, "1234567890");
        debugger;
        var result = await this.updateCredentialPOST(theProof, this.qrData);
        console.log("acceptVC", result);
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
        const decoded = decodeUnsafeJWT(this.VC);
        var credStruct = {
          type: this.VCType,
          status: "signed",
          encoded: this.VC,
          decoded: decoded.body?.vc,
          id: decoded.body.jti
        };
        var saved = await credentialsSave(credStruct, false);
        if (!saved) {
          return;
        }
        alert("Credential succesfully saved");
        location = window.location.origin + window.location.pathname;
      } else if (this.VCType == "EBSI") {
        const decodedJWT = decodeUnsafeJWT(this.VC);
        const decoded = decodedJWT.body.vc;
        var credStruct = {
          type: "EBSI",
          status: this.VCStatus,
          encoded: this.VC,
          decoded
        };
        var saved = await credentialsSave(credStruct, replace);
        if (!saved) {
          return;
        }
      } else if (this.VCType == "jwt_vc") {
        debugger;
        if (this.VCStatus == "offered") {
          var myDid = await getOrCreateDidKey();
          var sendidRequest = {
            did: myDid.did
          };
          const senddidURL = `${this.OriginServer}/apiuser/senddid/${this.VCId}`;
          var result = await doPOST(senddidURL, sendidRequest);
          if (!result) {
            return;
          }
          console.log("after doPOST sending the DID");
          this.VC = result["credential"];
          this.VCId = result["id"];
          this.VCType = result["type"];
          this.VCStatus = result["status"];
        }
        const decoded = decodeUnsafeJWT(this.VC);
        var credStruct = {
          type: this.VCType,
          status: this.VCStatus,
          encoded: this.VC,
          decoded: decoded.body,
          id: decoded.body.id
        };
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
          decoded
        };
        var saved = await credentialsSave(credStruct, replace);
        if (!saved) {
          return;
        }
      }
      location = window.location.origin + window.location.pathname;
      return;
    }
    /**
     * Reloads the application with a clean URL.
     *
     * @returns {void}
     */
    cleanReload() {
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
        const vc2 = decoded.body.vc;
        const credCard2 = renderAnyCredentialCard(vc2, vcstatus);
        return this.html`
            <ion-card>
              ${credCard2}
    
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
        const div2 = this.html`
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
        return div2;
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
async function performAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {
  const credentialTypes = credentialOffer.credentials[0].types;
  const issuer_state = credentialOffer["grants"]["authorization_code"]["issuer_state"];
  const authorization_endpoint = authServerMetaData["authorization_endpoint"];
  const myDID = await window.MHR.storage.didFirst();
  console.log("Step 1: GET Authorization Request");
  const code_verifier = "this_is_a_code_verifierthis_is_a_code_verifierthis_is_a_code_verifier";
  const code_challenge = await hashFromString(code_verifier);
  console.log("code_challenge", code_challenge);
  var authorization_details = [
    {
      type: "openid_credential",
      format: "jwt_vc",
      types: credentialTypes
    }
  ];
  var authorizationServer = issuerMetaData["authorization_server"];
  if (authorizationServer) {
    authorization_details[0]["locations"] = [issuerMetaData["credential_issuer"]];
  }
  var client_metadata = {
    vp_formats_supported: {
      jwt_vp: { alg: ["ES256"] },
      jwt_vc: { alg: ["ES256"] }
    },
    response_types_supported: ["vp_token", "id_token"],
    authorization_endpoint: window.location.origin
  };
  var formAttributes = {
    response_type: "code",
    scope: "openid",
    issuer_state,
    client_id: myDID.did,
    authorization_details: JSON.stringify(authorization_details),
    redirect_uri: window.location.origin,
    nonce: "thisisthenonce",
    code_challenge,
    code_challenge_method: "S256",
    client_metadata: JSON.stringify(client_metadata)
  };
  var formBody = [];
  for (var property in formAttributes) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(formAttributes[property]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  formBody = formBody.join("&");
  debugger;
  console.log("AuthRequest", authorization_endpoint + "?" + formBody);
  let resp = await fetch(authorization_endpoint + "?" + formBody, {
    cache: "no-cache",
    mode: "cors"
  });
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
  } else {
    throw new Error("Invalid response_type: " + response_type);
  }
  console.log("Step 2: ID Token Request");
  const redirect_uri2 = decodeURIComponent(urlParams.get("redirect_uri"));
  console.log("redirect_uri", redirect_uri2);
  const client_id2 = decodeURIComponent(urlParams.get("client_id"));
  const state2 = decodeURIComponent(urlParams.get("state"));
  var nonce2 = decodeURIComponent(urlParams.get("nonce"));
  const IDToken = await generateEBSIIDToken(myDID, client_id2, state2, nonce2);
  console.log("IDToken", IDToken);
  console.log("Step 2: ID Token Request");
  var formAttributes = {
    id_token: IDToken,
    state: state2
  };
  formBody = [];
  for (var property in formAttributes) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(formAttributes[property]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  formBody = formBody.join("&");
  console.log("Body", formBody);
  resp = await fetch(redirect_uri2, {
    method: "POST",
    redirect: "follow",
    cache: "no-cache",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody,
    mode: "cors"
  });
  if (!resp.ok || !resp.redirected) {
    throw new Error(resp.statusText);
  }
  redirectedURL = resp.url;
  console.log("Step 4: Receive Authorization response");
  mylog(redirectedURL);
  var urlParams = new URL(redirectedURL).searchParams;
  const code = decodeURIComponent(urlParams.get("code"));
  console.log("code", code);
  console.log("Step 5: Request Access Token from Authorization Server");
  const tokenEndpoint = authServerMetaData.token_endpoint;
  var formAttributes = {
    grant_type: "authorization_code",
    client_id: myDID.did,
    code,
    code_verifier
  };
  formBody = encodeFormAttributes(formAttributes);
  console.log(tokenEndpoint);
  console.log(formBody);
  resp = await fetch(tokenEndpoint, {
    method: "POST",
    redirect: "follow",
    cache: "no-cache",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody,
    mode: "cors"
  });
  if (!resp.ok) {
    throw new Error(resp.statusText);
  }
  console.log("Step 6: Receive Access Token from Authorization Server");
  const authTokenObject = await resp.json();
  console.log("Auth Token object:", authTokenObject);
  var nonce2 = authTokenObject.c_nonce;
  const access_token = authTokenObject.access_token;
  console.log("Step 7: Send a Credential Request");
  const proof = await generateDIDKeyProof(myDID, issuerMetaData.credential_issuer, nonce2);
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
    await delay(1e3);
    console.log("Finished waiting for credential");
    credentialResponse = await requestDeferredEBSICredential(
      acceptance_token,
      issuerMetaData["deferred_credential_endpoint"]
    );
    console.log("CredentialResponse", credentialResponse);
    acceptance_token = credentialResponse["acceptance_token"];
    iterations = iterations + 1;
  }
  if (!credentialResponse.credential) {
    throw new Error("No credential after all retries");
  }
  console.log("Step 8: Receive the credential");
  return credentialResponse.credential;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function performPreAuthorizedCodeFlow(credentialOffer, issuerMetaData, authServerMetaData, user_pin) {
  console.log("credentialOffer");
  console.log(credentialOffer);
  console.log("issuerMetaData");
  console.log(issuerMetaData);
  console.log("authServerMetaData");
  console.log(authServerMetaData);
  const credentialTypes = credentialOffer.credentials[0].types;
  const tokenEndpoint = authServerMetaData["token_endpoint"];
  const code = credentialOffer["grants"][PRE_AUTHORIZED_CODE_GRANT_TYPE]["pre-authorized_code"];
  const authTokenObject = await getPreAuthToken(tokenEndpoint, code, user_pin, "via_server");
  const nonce2 = authTokenObject.c_nonce;
  const access_token = authTokenObject.access_token;
  var myDID = localStorage.getItem("domedid");
  myDID = JSON.parse(myDID);
  const proof = await generateDIDKeyProof(myDID, issuerMetaData.credential_issuer, nonce2);
  const credentialResponse = await requestCredential(
    proof,
    access_token,
    issuerMetaData.credential_endpoint,
    credentialTypes
  );
  return credentialResponse.credential;
}
async function getPreAuthToken(tokenEndpoint, preAuthCode, user_pin) {
  var formAttributes = {
    grant_type: PRE_AUTHORIZED_CODE_GRANT_TYPE,
    tx_code: user_pin,
    "pre-authorized_code": preAuthCode
  };
  var formBody = [];
  for (var property in formAttributes) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(formAttributes[property]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  formBody = formBody.join("&");
  mylog("getPreAuthToken Body: " + formBody);
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
      jwt: proof
    }
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
      Authorization: "Bearer " + acceptance_token
    },
    mode: "cors"
  });
  if (response.ok) {
    const credentialResponse = await response.json();
    mylog(credentialResponse);
    return credentialResponse;
  } else {
    throw new Error(response.statusText);
  }
}
async function getIssuerMetadata(issuerAddress) {
  mylog("IssuerMetadata at", issuerAddress + "/.well-known/openid-credential-issuer");
  var openIdInfo = await doGETJSON(issuerAddress + "/.well-known/openid-credential-issuer");
  return openIdInfo;
}
async function getAuthServerMetadata(authServerAddress) {
  mylog("AuthServerMetadata at", authServerAddress);
  var openIdInfo = await doGETJSON(authServerAddress + "/.well-known/openid-configuration");
  return openIdInfo;
}
async function getCredentialOffer(url) {
  const urlParams = new URL(url).searchParams;
  const credentialOfferURI = decodeURIComponent(urlParams.get("credential_offer_uri"));
  console.log("Get: " + credentialOfferURI);
  var credentialOffer = await doGETJSON(credentialOfferURI);
  console.log(credentialOffer);
  return credentialOffer;
}
async function hashFromString(string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(string));
  let astr = btoa(String.fromCharCode(...new Uint8Array(hash)));
  astr = astr.replace(/=+$/, "");
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
      const redirect_uri2 = decodeURIComponent(urlParams.get("redirect_uri"));
      console.log("redirect_uri", redirect_uri2);
      const client_id2 = decodeURIComponent(urlParams.get("client_id"));
      const state2 = decodeURIComponent(urlParams.get("state"));
      const nonce2 = decodeURIComponent(urlParams.get("nonce"));
      const myDID = await window.MHR.storage.didFirst();
      const IDToken = await generateEBSIIDToken(myDID, client_id2, state2, nonce2);
      console.log("IDToken", IDToken);
      var formAttributes = {
        id_token: IDToken,
        state: state2
      };
      var formBody = [];
      for (var property in formAttributes) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(formAttributes[property]);
        formBody.push(encodedKey + "=" + encodedValue);
      }
      formBody = formBody.join("&");
      console.log("Body", formBody);
      let resp = await fetch(redirect_uri2, {
        method: "POST",
        redirect: "follow",
        cache: "no-cache",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formBody,
        mode: "cors"
      });
      if (resp.ok && resp.redirected) {
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
async function generateDIDKeyProof(subjectDID, issuerID, nonce2) {
  const subjectKid = subjectDID.did;
  var jwtHeaders = {
    typ: "openid4vci-proof+jwt",
    alg: "ES256",
    kid: subjectKid
  };
  const iat = Math.floor(Date.now() / 1e3) - 2;
  const exp = iat + 86500;
  var jwtPayload = {
    // iss: subjectDID.did,
    aud: issuerID,
    iat,
    exp,
    nonce: nonce2
  };
  const jwt = await signJWT(jwtHeaders, jwtPayload, subjectDID.privateKey);
  return jwt;
}
async function generateEBSIIDToken(subjectDID, issuerID, state2, nonce2) {
  const keyStr = subjectDID.did.replace("did:key:", "");
  const subjectKid = subjectDID.did + "#" + keyStr;
  var jwtHeaders = {
    typ: "JWT",
    alg: "ES256",
    kid: subjectKid
  };
  const iat = Math.floor(Date.now() / 1e3) - 2;
  const exp = iat + 86500;
  var jwtPayload = {
    iss: subjectDID.did,
    sub: subjectDID.did,
    aud: issuerID,
    iat,
    exp,
    state: state2,
    nonce: nonce2
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
      const myDID = await window.MHR.storage.didFirst();
      const IDToken = await generateEBSIIDToken(myDID, client_id, state, nonce);
      console.log("IDToken", IDToken);
      debugger;
      var formAttributes = {
        id_token: IDToken,
        state
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
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formBody,
        mode: "cors"
      });
      if (response.ok) {
        return;
      } else {
        throw new Error(response.statusText);
      }
    }
  }
);
async function doGETJSON(serverURL) {
  if (!serverURL) {
    throw new Error("No serverURL");
  }
  var response;
  if (viaServer) {
    let forwardBody = {
      method: "GET",
      url: serverURL
    };
    response = await fetch("/serverhandler", {
      method: "POST",
      body: JSON.stringify(forwardBody),
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-cache"
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
      mimetype,
      body
    };
    if (authorization) {
      forwardBody["authorization"] = authorization;
    }
    response = await fetch("/serverhandler", {
      method: "POST",
      body: JSON.stringify(forwardBody),
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-cache"
    });
  } else {
    response = await fetch(serverURL, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": mimetype
      },
      cache: "no-cache"
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
