import {
  log
} from "../chunks/chunk-FVTRWWP3.js";
import "../chunks/chunk-KRYK5JSZ.js";

// front/src/pages/LoadAndSaveQRVC.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var PRE_AUTHORIZED_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:pre-authorized_code";
window.MHR.register("LoadAndSaveQRVC", class LoadAndSaveQRVC extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter(qrData) {
    let html = this.html;
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
    if (qrData.includes("/credential-offer?credential_offer_uri=")) {
      var credentialOffer = await getCredentialOffer(qrData);
      var code = credentialOffer["grants"][PRE_AUTHORIZED_CODE_GRANT_TYPE]["pre-authorized_code"];
      var format = credentialOffer["credentials"][0]["format"];
      var credentialTypes = credentialOffer["credentials"].map((credential) => credential["type"]);
      var issuerAddress = credentialOffer["credential_issuer"];
      var openIdInfo = await getOpenIdConfig(issuerAddress);
      var credentialEndpoint = openIdInfo["credential_endpoint"];
      var tokenEndpoint = openIdInfo["token_endpoint"];
      var authTokenObject = await getAuthToken(tokenEndpoint, code);
      var accessToken = authTokenObject["access_token"];
      var credentialResponse = await getCredentialOIDC4VCI(credentialEndpoint, accessToken, format, credentialTypes);
      console.log("Received the credentials.");
      this.VC = JSON.stringify(credentialResponse["credential"], null, 2);
    } else {
      this.VC = await getVerifiableCredentialLD(qrData);
    }
    let theHtml = html`
        <div class="w3-container">
            <div class="w3-card-4 w3-center w3-margin-top w3-padding-bottom">
        
                <header class="w3-container color-primary" style="padding:10px">
                    <h4>${T("You received a Verifiable Credential")}</h4>
                </header>
        
                <div class="w3-container ptb-16">
                    <p>${T("You can save it in this device for easy access later.")}</p>
                    <p>${T("Please click Save to save the certificate.")}</p>
                </div>
        
                <div class="w3-padding-16">       
                    <btn-primary @click=${() => this.saveVC()}>${T("Save")}</btn-primary>
                </div>
        
            </div>
        </div>
        `;
    this.render(theHtml);
  }
  saveVC() {
    console.log("Save VC " + JSON.stringify(this.VC));
    log.log("Store " + this.VC);
    let total = 0;
    if (!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
      total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"));
      log.log("Total " + total);
    }
    const id = "W3C_VC_LD_" + total;
    window.localStorage.setItem(id, this.VC);
    total = total + 1;
    log.log(total + " credentials in storage.");
    window.localStorage.setItem("W3C_VC_LD_TOTAL", total);
    location = window.location.origin + window.location.pathname;
    gotoPage("DisplayVC", id);
    return;
  }
});
async function getCredentialOIDC4VCI(credentialEndpoint, accessToken, format, credential_type) {
  try {
    var credentialReq = {
      format,
      types: credential_type
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
      var credentialBody = await response.json();
    } else {
      if (response.status == 403) {
        alert.apply("error 403");
        window.MHR.goHome();
        return "Error 403";
      }
      var error = await response.text();
      log.error(error);
      window.MHR.goHome();
      alert(error);
      return null;
    }
  } catch (error2) {
    log.error(error2);
    alert(error2);
    return null;
  }
  console.log(credentialBody);
  return credentialBody;
}
async function getAuthToken(tokenEndpoint, preAuthCode) {
  try {
    var formAttributes = {
      "grant_type": PRE_AUTHORIZED_CODE_GRANT_TYPE,
      "code": preAuthCode
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
        alert.apply("error 403");
        window.MHR.goHome();
        return "Error 403";
      }
      var error = await response.text();
      log.error(error);
      window.MHR.goHome();
      alert(error);
      return null;
    }
  } catch (error2) {
    log.error(error2);
    alert(error2);
    return null;
  }
  console.log(tokenBody);
  return tokenBody;
}
async function getOpenIdConfig(issuerAddress) {
  try {
    console.log("Get: " + issuerAddress);
    let response = await fetch(issuerAddress + "/.well-known/openid-configuration", {
      cache: "no-cache",
      mode: "cors"
    });
    if (response.ok) {
      var openIdInfo = await response.json();
    } else {
      if (response.status == 403) {
        alert.apply("error 403");
        window.MHR.goHome();
        return "Error 403";
      }
      var error = await response.text();
      log.error(error);
      window.MHR.goHome();
      alert(error);
      return null;
    }
  } catch (error2) {
    log.error(error2);
    alert(error2);
    return null;
  }
  console.log(openIdInfo);
  return openIdInfo;
}
async function getVerifiableCredentialLD(backEndpoint) {
  try {
    let response = await fetch(backEndpoint, {
      mode: "cors"
    });
    if (response.ok) {
      var vc = await response.text();
    } else {
      if (response.status == 403) {
        alert.apply("error 403");
        window.MHR.goHome();
        return "Error 403";
      }
      var error = await response.text();
      log.error(error);
      window.MHR.goHome();
      alert(error);
      return null;
    }
  } catch (error2) {
    log.error(error2);
    alert(error2);
    return null;
  }
  console.log(vc);
  return vc;
}
async function getCredentialOffer(url) {
  try {
    const urlParams = new URL(url).searchParams;
    const credentialOfferURI = decodeURIComponent(urlParams.get("credential_offer_uri"));
    console.log("Get: " + credentialOfferURI);
    let response = await fetch(credentialOfferURI, {
      cache: "no-cache",
      mode: "cors"
    });
    if (response.ok) {
      const credentialOffer = await response.json();
      console.log(credentialOffer);
      return credentialOffer;
    } else {
      if (response.status === 403) {
        alert.apply("error 403");
        window.MHR.goHome();
        return "Error 403";
      }
      var error = await response.text();
      log.error(error);
      window.MHR.goHome();
      alert(error);
      return null;
    }
  } catch (error2) {
    log.error(error2);
    alert(error2);
    return null;
  }
}
