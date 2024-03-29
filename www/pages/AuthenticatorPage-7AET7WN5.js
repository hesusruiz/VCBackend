// front/src/pages/AuthenticatorPage.js
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
window.MHR.register("AuthenticatorPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let title = T("Authenticator required");
    const authType = pageData.authType;
    const email = pageData.email;
    const origin = pageData.origin;
    const state = pageData.state;
    let theHtml = html`
        <ion-card>
    
            <ion-card-header>
                <ion-card-title>${title}</ion-card-title>
            </ion-card-header>
    
            <ion-card-content>
            <div style="font-size:16px">The server requires additional security with an authenticator.</div>
            <div style="font-size:16px">Click below to use it.</div>
            </ion-card-content>
            
            <div class="ion-margin-start ion-margin-bottom">
                <ion-button expand="block" @click=${() => webAuthn(authType, origin, email, state)}>
                    <ion-icon size="large" slot="start" name="finger-print"></ion-icon>
                    ${T("Click to use biometric authentication")}
                </ion-button>
            </div>

        </ion-card>            
        `;
    this.render(theHtml);
  }
});
var apiPrefix = "/webauthn";
async function webAuthn(authType, origin, username, state) {
  var error;
  const wkey = "wauth-" + username;
  const wauthid = await window.MHR.storage.settingsGet(wkey);
  if (wauthid == null) {
    console.log("no webauthn credentials in local device, registering", username);
    error = await registerUser(origin, username, state);
    if (error) {
      myerror(error);
      gotoPage("ErrorPage", {
        title: "Error",
        msg: "Error registering the user"
      });
      return;
    }
  } else if (authType == "registration") {
    console.log("no credentials in server, registering", username);
    error = await registerUser(origin, username, state);
    if (error) {
      myerror(error);
      gotoPage("ErrorPage", {
        title: "Error",
        msg: "Error registering the user"
      });
      return;
    }
  } else {
    console.log("already credentials in server, loging", username);
    error = await loginUser(origin, username, state);
    if (error) {
      myerror(error);
      gotoPage("ErrorPage", {
        title: "Error",
        msg: "Error loging user"
      });
      return;
    }
  }
  gotoPage("AuthenticatorSuccessPage");
  return;
}
async function registerUser(origin, username, state) {
  try {
    var response = await fetch(
      origin + apiPrefix + "/register/begin/" + username + "?state=" + state,
      {
        mode: "cors"
      }
    );
    if (!response.ok) {
      var errorText = await response.text();
      mylog(errorText);
      return "error";
    }
    var responseJSON = await response.json();
    var credentialCreationOptions = responseJSON.options;
    var session = responseJSON.session;
    mylog("Received CredentialCreationOptions", credentialCreationOptions);
    mylog("Session:", session);
    credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
    credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
    const wauthid = await window.MHR.storage.settingsGet("wauth-" + username);
    if (wauthid == null) {
      console.log("no credentials in local device, erasing excludeCredentials data");
      credentialCreationOptions.publicKey.excludeCredentials = [];
    }
    if (credentialCreationOptions.publicKey.excludeCredentials) {
      for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
        credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
      }
    }
    mylog("creating new Authenticator credential");
    try {
      var credential = await navigator.credentials.create({
        publicKey: credentialCreationOptions.publicKey
      });
    } catch (error) {
      myerror(error);
      return error;
    }
    mylog("Authenticator created Credential", credential);
    let attestationObject = credential.response.attestationObject;
    let clientDataJSON = credential.response.clientDataJSON;
    let rawId = credential.rawId;
    var data = {
      id: credential.id,
      rawId: bufferEncode(rawId),
      type: credential.type,
      response: {
        attestationObject: bufferEncode(attestationObject),
        clientDataJSON: bufferEncode(clientDataJSON)
      }
    };
    var wholeData = {
      response: data,
      session
    };
    mylog("sending Authenticator credential to server");
    var response = await fetch(origin + apiPrefix + "/register/finish/" + username + "?state=" + state, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "session_id": session
      },
      mode: "cors",
      body: JSON.stringify(wholeData)
      // body data type must match "Content-Type" header
    });
    if (!response.ok) {
      mylog(errorText);
      var errorText = await response.text();
      return "error";
    }
    mylog("Authenticator credential sent successfully to server");
    const wkey = "wauth-" + username;
    await window.MHR.storage.settingsPut(wkey, data.id);
    return;
  } catch (error) {
    myerror(error);
    return error;
  }
}
async function loginUser(origin, username, state) {
  try {
    var response = await fetch(
      origin + apiPrefix + "/login/begin/" + username + "?state=" + state,
      {
        mode: "cors"
      }
    );
    if (!response.ok) {
      myerror("error requesting CredentialRequestOptions", response.status);
      return "error";
    }
    var responseJSON = await response.json();
    var credentialRequestOptions = responseJSON.options;
    var session = responseJSON.session;
    mylog("Received CredentialRequestOptions", credentialRequestOptions);
    credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge);
    credentialRequestOptions.publicKey.allowCredentials.forEach(function(listItem) {
      listItem.id = bufferDecode(listItem.id);
    });
    const discoverable = true;
    var assertion;
    if (discoverable) {
      credentialRequestOptions.publicKey.allowCredentials = [];
      try {
        assertion = await navigator.credentials.get({
          publicKey: credentialRequestOptions.publicKey
        });
        if (assertion == null) {
          myerror("null assertion received from authenticator device");
          return "error";
        }
      } catch (error) {
        myerror(error);
        return error;
      }
      mylog("Discoverable Assertion created", assertion);
    } else {
      try {
        assertion = await navigator.credentials.get({
          publicKey: credentialRequestOptions.publicKey
        });
        if (assertion == null) {
          myerror("null assertion received from authenticator device");
          return "error";
        }
      } catch (error) {
        myerror(error);
        return error;
      }
    }
    mylog("Authenticator created Assertion", assertion);
    let authData = assertion.response.authenticatorData;
    let clientDataJSON = assertion.response.clientDataJSON;
    let rawId = assertion.rawId;
    let sig = assertion.response.signature;
    let userHandle = assertion.response.userHandle;
    var data = {
      id: assertion.id,
      rawId: bufferEncode(rawId),
      type: assertion.type,
      response: {
        authenticatorData: bufferEncode(authData),
        clientDataJSON: bufferEncode(clientDataJSON),
        signature: bufferEncode(sig),
        userHandle: bufferEncode(userHandle)
      }
    };
    var wholeData = {
      response: data,
      session
    };
    try {
      var response = await fetch(origin + apiPrefix + "/login/finish/" + username + "?state=" + state, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "session_id": session
        },
        mode: "cors",
        body: JSON.stringify(wholeData)
      });
      if (!response.ok) {
        var errorText = await response.text();
        mylog(errorText);
        return "error";
      }
      return;
    } catch (error) {
      myerror(error);
      return error;
    }
  } catch (error) {
    myerror(error);
    return error;
  }
}
window.MHR.register("AuthenticatorSuccessPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  enter(pageData) {
    let html = this.html;
    let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>Authentication success</ion-card-title>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">

                <div class="text-larger">The authentication process has been completed</div>

            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button @click=${() => window.MHR.cleanReload()}>
                    <ion-icon slot="start" name="home"></ion-icon>
                    ${T("Home")}
                </ion-button>

            </div>
        </ion-card>
        `;
    this.render(theHtml);
  }
});
function bufferDecode(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function bufferEncode(value) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  ;
}
