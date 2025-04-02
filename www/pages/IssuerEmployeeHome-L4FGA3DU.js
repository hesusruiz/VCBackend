import {
  Client
} from "../chunks/chunk-K6L5OUL6.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/IssuerEmployeeHome.js
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
window.MHR.register("IssuerEmployeeHome", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    console.log(document.location);
    if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
      console.log("************Redirected with state**************");
      gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    var email, verified;
    if (pb.authStore.isValid) {
      email = pb.authStore.model.email;
      verified = pb.authStore.model.verified;
    }
    var theHtml;
    if (!pb.authStore.isValid) {
      theHtml = await logonScreen();
    } else {
      if (!verified) {
        theHtml = validateEmailScreen();
      } else {
        gotoPage("IssuerLandingPage");
        return;
      }
    }
    this.render(theHtml, false);
  }
});
function validateEmailScreen() {
  var email, verified;
  if (pb.authStore.isValid) {
    email = pb.authStore.model.email;
    verified = pb.authStore.model.verified;
  }
  return html`
    <ion-card>
        <ion-card-header>
            <ion-card-title>Welcome back ${email}</ion-card-title>
        </ion-card-header>

        <ion-card-content>

            <div class="ion-margin-top">
            <ion-text class="ion-margin-top">You need to verify your email before being able to use this system.</ion-text>
            </div>

        </ion-card-content>

        <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${() => requestVerification(email)}>
                ${T("Request verification")}
            </ion-button>
            <ion-button @click=${() => pb.authStore.clear()}>
                ${T("Logoff")}
            </ion-button>
        </div>

    </ion-card>
    `;
}
async function requestVerification(email) {
  console.log("Requesting verification");
  const result = await pb.collection("signers").requestVerification(email);
  console.log("After requesting verification:", result);
}
async function logonScreen() {
  return html`
    <ion-card>
        <ion-card-header>
            <ion-card-title>Logon with your registered email</ion-card-title>
        </ion-card-header>
    
        <ion-card-content>
    
            <ion-list>
    
                <ion-item>
                    <ion-input id="email" type="email" label="Email:" helperText="Enter a valid email" placeholder="email@domain.com"></ion-input>
                </ion-item>
    
            </ion-list>
    
            <div class="ion-margin-top">
                <h2>You need to register and verify your email before being able to logon and use this system.<h2>
            </div>
    
        </ion-card-content>
    
        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => logonWithEmail()}>
                ${T("Logon")}
            </ion-button>
            <ion-button @click=${() => registerEmail()}>
                ${T("Register")}
            </ion-button>
        </div>
    
    </ion-card>
    `;
}
async function logonWithEmail() {
  let params = new URL(document.location).searchParams;
  let txcode = params.get("transaction_code");
  mylog(`txcode: ${txcode}`);
  const email = document.getElementById("email").value;
  console.log(email);
  if (email.length == 0) {
    return;
  }
  pb.authStore.clear();
  try {
    const authData = await pb.collection("signers").authWithPassword(
      email,
      txcode
    );
    console.log(authData);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error in logon", msg: error.message });
    return;
  }
  window.MHR.cleanReload();
}
async function registerEmail() {
  const email = document.getElementById("email").value;
  console.log(email);
  if (email.length == 0) {
    return;
  }
  const data = {
    "email": email,
    "emailVisibility": true,
    "password": "12345678",
    "passwordConfirm": "12345678"
  };
  try {
    console.log("Requesting verification");
    var result = await pb.collection("signers").requestVerification(email);
    console.log("After requesting verification:", result);
  } catch (error) {
    gotoPage("ErrorPage", { title: "Error requesting verification", msg: error.message });
    return;
  }
  alert("Registration requested. Please check your email for confirmation.");
  window.MHR.cleanReload();
}
