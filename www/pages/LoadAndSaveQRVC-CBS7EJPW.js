import {
  getOrCreateDidKey,
  signJWT
} from "../chunks/chunk-5HFYYPY6.js";
import {
  renderLEARCredentialCard
} from "../chunks/chunk-PI7RY6L6.js";
import {
  decodeJWT
} from "../chunks/chunk-4DGWCCCP.js";
import {
  credentialsSave
} from "../chunks/chunk-YTTLZ6I3.js";
import "../chunks/chunk-BFXLU5VG.js";
import "../chunks/chunk-J6D2DG7T.js";
import "../chunks/chunk-U2D4LOFI.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/LoadAndSaveQRVC.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var html = window.MHR.html;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var PRE_AUTHORIZED_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:pre-authorized_code";
window.MHR.register("LoadAndSaveQRVC", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
    this.VC = "";
    this.VCType = "";
    this.VCStatus = "";
  }
  async enter(qrData) {
    mylog(`LoadAndSaveQRVC: ${qrData}`);
    debugger;
    let html2 = this.html;
    if (qrData == null || !qrData.startsWith) {
      console.log("The scanned QR does not contain a valid URL");
      gotoPage("ErrorPage", { "title": "No data received", "msg": "The scanned QR does not contain a valid URL" });
      return;
    }
    if (!qrData.startsWith("https://") && !qrData.startsWith("http://")) {
      console.log("The scanned QR does not contain a valid URL");
      gotoPage("ErrorPage", { "title": "No data received", "msg": "The scanned QR does not contain a valid URL" });
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
    mylog(qrData);
    if (qrData.includes("credential_offer_uri=")) {
      var credentialOffer = await getCredentialOffer(qrData);
      this.credentialOffer = credentialOffer;
      await storage.settingsPut("credentialOffer", credentialOffer);
      console.log("credentialOffer", credentialOffer);
      const credential_issuer = credentialOffer["credential_issuer"];
      if (!credential_issuer) {
        let msg = "credential_issuer object not found in credentialOffer";
        myerror(msg);
        gotoPage("ErrorPage", { "title": "Invalid credentialOffer", "msg": msg });
        return;
      }
      var issuerMetaData = await getIssuerMetadata(credential_issuer);
      this.issuerMetaData = issuerMetaData;
      await storage.settingsPut("issuerMetaData", issuerMetaData);
      var credentialEndpoint = issuerMetaData["credential_endpoint"];
      if (!credentialEndpoint) {
        let msg = "credentialEndpoint object not found in issuerMetaData";
        myerror(msg);
        gotoPage("ErrorPage", { "title": "Invalid issuerMetaData", "msg": msg });
        return;
      }
      var authorizationServer = issuerMetaData["authorization_server"];
      if (!authorizationServer) {
        let msg = "'authorizationServer' object not found in issuerMetaData";
        myerror(msg);
        gotoPage("ErrorPage", { "title": "Invalid issuerMetaData", "msg": msg });
        return;
      }
      var authServerMetaData = await getAuthServerMetadata(authorizationServer);
      this.authServerMetaData = authServerMetaData;
      await storage.settingsPut("authServerMetaData", authServerMetaData);
      const grants = credentialOffer["grants"];
      if (!grants) {
        let msg = "grants object not found in credentialOffer";
        myerror(msg);
        gotoPage("ErrorPage", { "title": "Invalid credentialOffer", "msg": msg });
        return;
      }
      const authorization_code = grants["authorization_code"];
      if (authorization_code) {
        await this.renderAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData);
        return;
      } else if (grants[PRE_AUTHORIZED_CODE_GRANT_TYPE]) {
        await this.startPreAuthorizedCodeFlow();
        return;
      } else {
        let msg = "No authorization flow type found in grants";
        myerror(msg);
        gotoPage("ErrorPage", { "title": "Invalid grants", "msg": msg });
        return;
      }
    } else {
      mylog("Non-standard issuance");
      const theurl = new URL(qrData);
      this.OriginServer = theurl.origin;
      var myDid = await getOrCreateDidKey();
      const theProof = await generateDIDKeyProof(myDid, "https://issuer.mycredential.eu", "1234567890");
      debugger;
      var result = await this.retrieveCredentialPOST(theProof, qrData);
      this.VC = result["credential"];
      this.VCId = result["id"];
      this.VCType = result["type"];
      this.VCStatus = result["status"];
      this.renderedVC = this.prerenderEmployeeCredential(this.VC, this.VCType, this.VCStatus);
    }
    let theHtml = html2`
        <ion-card color="warning">
                
            <ion-card-content>
            <p><b>
            ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
            </b></p>
            </ion-card-content>
            
        </ion-card>

        ${this.renderedVC}
        `;
    this.render(theHtml);
  }
  async retrieveCredentialPOST(proof, credentialEndpoint) {
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
  // startPreAuthorizedCodeFlow asks the user for the PIN (required) and then processes the flow
  async startPreAuthorizedCodeFlow() {
    let theHtml = html`
        <ion-card style="max-width:600px">
            <ion-card-content>
            <p>Enter the PIN shown in the EBSI screen.<b>
            <ion-input id="thepin" label="PIN" label-placement="stacked" type="number" placeholder="0000"></ion-input>
            </ion-card-content>
            
            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${async () => {
      const ionpin = document.getElementById("thepin");
      const nativepin = await ionpin.getInputElement();
      const pin = nativepin.value;
      if (pin.length > 0) {
        this.renderPreAuthorizedCodeFlow(pin);
      }
    }}>
                ${T("Continue")}
                </ion-button>
            </div>

        </ion-card>
        `;
    this.render(theHtml);
  }
  async renderPreAuthorizedCodeFlow(user_pin) {
    try {
      this.user_pin = user_pin;
      const jwtCredential = await performPreAuthorizedCodeFlow(
        this.credentialOffer,
        this.issuerMetaData,
        this.authServerMetaData,
        user_pin
      );
      this.VC = jwtCredential;
      this.VCType = "EBSI";
      this.VCStatus = "signed";
      const decoded = decodeJWT(jwtCredential);
      this.renderedVC = this.renderEBSICredential(decoded);
      let theHtml = html`
            <ion-card color="warning">
                <ion-card-content>
                <p><b>
                ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
                </b></p>
                </ion-card-content>
            </ion-card>

            ${this.renderedVC}
            `;
      this.render(theHtml);
    } catch (error) {
      debugger;
      this.showError(error.name, error.message);
    }
  }
  async renderAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {
    const jwtCredential = await performAuthCodeFlow(
      credentialOffer,
      issuerMetaData,
      authServerMetaData
    );
    this.VC = jwtCredential;
    this.VCType = "EBSI";
    const decoded = decodeJWT(jwtCredential);
    this.renderedVC = this.renderEBSICredential(decoded);
    let theHtml = html`
        <ion-card color="warning">
            <ion-card-content>
            <p><b>
            ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
            </b></p>
            </ion-card-content>
        </ion-card>

        ${this.renderedVC}
        `;
    this.render(theHtml);
  }
  // Save the credential and perform any additional actions needed
  async saveVC() {
    var replace = false;
    console.log("Save VC " + this.VC);
    if (this.VCType == "EBSI") {
      const decodedJWT = decodeJWT(this.VC);
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
      const decoded = decodeJWT(this.VC);
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
      alert("Credential succesfully updated");
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
  cleanReload() {
    location = window.location.origin + window.location.pathname;
    return;
  }
  renderEBSICredential(vcdecoded) {
    const vc = vcdecoded.body.vc;
    const vcTypeArray = vc["type"];
    const vcType = vcTypeArray[vcTypeArray.length - 1];
    const div = html`
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
  prerenderEmployeeCredential(vcencoded, vctype, vcstatus) {
    if (vctype == "jwt_vc") {
      var decoded = decodeJWT(vcencoded);
    } else {
      decoded = vcencoded;
    }
    let html2 = this.html;
    var saveButtonText = T("Save credential");
    if (vcstatus == "offered") {
      saveButtonText = T("Save credential offer");
    }
    const vc = decoded.body;
    const div = html2`
        <ion-card>
            ${renderLEARCredentialCard(vc, vcstatus)}

            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => this.cleanReload()}>
                    <ion-icon slot="start" name="chevron-back"></ion-icon>
                    ${T("Do not save")}
                </ion-button>

                <ion-button @click=${() => this.saveVC()}>
                    <ion-icon slot="start" name="person-add"></ion-icon>
                    ${saveButtonText}
                </ion-button>
            </div>
        </ion-card>
        `;
    return div;
  }
});
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
      "type": "openid_credential",
      "format": "jwt_vc",
      "types": credentialTypes
    }
  ];
  var authorizationServer = issuerMetaData["authorization_server"];
  if (authorizationServer) {
    authorization_details[0]["locations"] = [
      issuerMetaData["credential_issuer"]
    ];
  }
  var client_metadata = {
    "vp_formats_supported": {
      "jwt_vp": { "alg": ["ES256"] },
      "jwt_vc": { "alg": ["ES256"] }
    },
    "response_types_supported": ["vp_token", "id_token"],
    "authorization_endpoint": window.location.origin
  };
  var formAttributes = {
    "response_type": "code",
    "scope": "openid",
    "issuer_state": issuer_state,
    "client_id": myDID.did,
    "authorization_details": JSON.stringify(authorization_details),
    "redirect_uri": window.location.origin,
    "nonce": "thisisthenonce",
    "code_challenge": code_challenge,
    "code_challenge_method": "S256",
    "client_metadata": JSON.stringify(client_metadata)
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
  var credentialResponse = await requestEBSICredential(proof, access_token, issuerMetaData.credential_endpoint, credentialTypes);
  var acceptance_token = credentialResponse["acceptance_token"];
  const max_iterations = 10;
  var iterations = 0;
  while (acceptance_token && iterations < max_iterations) {
    console.log("Waiting for credential ...");
    await delay(1e3);
    console.log("Finished waiting for credential");
    credentialResponse = await requestDeferredEBSICredential(acceptance_token, issuerMetaData["deferred_credential_endpoint"]);
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
  const authTokenObject = await getPreAuthToken(tokenEndpoint, code, user_pin);
  const nonce2 = authTokenObject.c_nonce;
  const access_token = authTokenObject.access_token;
  const myDID = await window.MHR.storage.didFirst();
  const proof = await generateDIDKeyProof(myDID, issuerMetaData.credential_issuer, nonce2);
  const credentialResponse = await requestEBSICredential(proof, access_token, issuerMetaData.credential_endpoint, credentialTypes);
  return credentialResponse.credential;
}
async function getPreAuthToken(tokenEndpoint, preAuthCode, user_pin) {
  try {
    var formAttributes = {
      "grant_type": PRE_AUTHORIZED_CODE_GRANT_TYPE,
      "user_pin": user_pin,
      "pre-authorized_code": preAuthCode
    };
    var formBody = [];
    for (var property in formAttributes) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(formAttributes[property]);
      formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");
    console.log("The body: " + formBody);
    let response = await fetch(tokenEndpoint, {
      method: "POST",
      cache: "no-cache",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody,
      mode: "cors"
    });
    if (response.ok) {
      var tokenBody = await response.json();
    } else {
      if (response.status == 403) {
        alert("error 403");
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
  console.log(tokenBody);
  return tokenBody;
}
async function requestEBSICredential(proof, accessToken, credentialEndpoint, credentialTypes) {
  var credentialReq = {
    types: credentialTypes,
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
      "Content-Type": "application/json",
      "Authorization": "Bearer " + accessToken
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
async function requestDeferredEBSICredential(acceptance_token, deferredCredentialEndpoint) {
  let response = await fetch(deferredCredentialEndpoint, {
    method: "POST",
    cache: "no-cache",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + acceptance_token
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
  mylog("IssuerMetadata at", issuerAddress);
  let response = await fetch(issuerAddress + "/.well-known/openid-credential-issuer", {
    cache: "no-cache",
    mode: "cors"
  });
  if (response.ok) {
    var openIdInfo = await response.json();
    mylog("IssuerMetadata", openIdInfo);
    return openIdInfo;
  } else {
    throw new Error("error retrieving OpenID metadata");
  }
}
async function getAuthServerMetadata(authServerAddress) {
  mylog("AuthServerMetadata at", authServerAddress);
  let response = await fetch(authServerAddress + "/.well-known/openid-configuration", {
    cache: "no-cache",
    mode: "cors"
  });
  if (response.ok) {
    var openIdInfo = await response.json();
    console.log(openIdInfo);
    mylog("AuthServerMetadata", openIdInfo);
    return openIdInfo;
  } else {
    throw new Error("error retrieving OpenID metadata");
  }
}
async function getCredentialOffer(url) {
  const urlParams = new URL(url).searchParams;
  const credentialOfferURI = decodeURIComponent(urlParams.get("credential_offer_uri"));
  console.log("Get: " + credentialOfferURI);
  let response = await fetch(credentialOfferURI, {
    cache: "no-cache",
    mode: "cors"
  });
  if (response.ok) {
    const credentialOffer = await response.json();
    mylog("CredentialOffer", credentialOffer);
    return credentialOffer;
  } else {
    const errorText = await response.text();
    myerror(response.status + " " + response.statusText + "->" + errorText);
    throw new Error(response.status + " " + response.statusText + "->" + errorText);
  }
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
window.MHR.register("EBSIRedirect", class extends window.MHR.AbstractPage {
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
});
async function generateDIDKeyProof(subjectDID, issuerID, nonce2) {
  const keyStr = subjectDID.did.replace("did:key:", "");
  const subjectKid = subjectDID.did + "#" + keyStr;
  var jwtHeaders = {
    typ: "openid4vci-proof+jwt",
    alg: "ES256",
    kid: subjectKid
  };
  const iat = Math.floor(Date.now() / 1e3) - 2;
  const exp = iat + 86500;
  var jwtPayload = {
    iss: subjectDID.did,
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
window.MHR.register("EBSIRedirectCode", class extends window.MHR.AbstractPage {
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
});
async function doPOST(serverURL, body) {
  try {
    var response = await fetch(
      serverURL,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-cache"
      }
    );
    console.log(response);
  } catch (error) {
    myerror(error.message);
    await gotoPage("ErrorPage", { "title": "Error sending data", "msg": error.message });
    return;
  }
  if (response.ok) {
    var responseJSON = await response.json();
    console.log(responseJSON);
    mylog(`doPOST ${serverURL}:`, responseJSON);
    return responseJSON;
  } else {
    const errormsg = `doPOST ${serverURL}: ${response.statusText}`;
    myerror(errormsg);
    await gotoPage("ErrorPage", { "title": "Error sending data", "msg": errormsg });
    return;
  }
}
