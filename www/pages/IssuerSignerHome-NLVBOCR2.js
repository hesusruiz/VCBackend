import {
  Client
} from "../chunks/chunk-K6L5OUL6.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/pages/IssuerSignerHome.js
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
var cleanReload = window.MHR.cleanReload;
window.MHR.register("IssuerSignerHome", class extends window.MHR.AbstractPage {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(id);
  }
  async enter() {
    var theHtml;
    pb.authStore.clear();
    try {
      const authData = await pb.send("/apisigner/loginwithcert");
      debugger;
      if (authData.token) {
        pb.authStore.save(authData.token, authData.record);
        console.log(authData);
        gotoPage("ListOfferingsPage");
        return;
      } else {
        if (authData.not_verified) {
          console.log("waiting for confirmation");
          gotoPage("ErrorPage", {
            title: "Waiting for confirmation",
            msg: "Please, check your email for a confirmation message.",
            back: false,
            level: "info"
          });
          return;
        }
        theHtml = await registerScreen(authData);
        this.render(theHtml, false);
        return;
      }
    } catch (error) {
      console.log("error in loginwithcert:", error);
      gotoPage("ErrorPage", { title: "Error in logon", msg: error.message });
      return;
    }
  }
});
async function registerScreen(authData) {
  const organization_identifier = authData.organization_identifier;
  const organization = authData.organization;
  const serial_number = authData.serial_number;
  const common_name = authData.common_name;
  var certificate_type = "personal";
  if (organization_identifier) {
    if (serial_number) {
      certificate_type = "legalRepresentative";
    } else {
      certificate_type = "seal";
    }
  }
  var introMessage;
  switch (certificate_type) {
    case "personal":
      introMessage = html`
            <ion-card color="warning">
                <ion-card-header>
                    <ion-card-subtitle>Warning</ion-card-subtitle>
                </ion-card-header>

                <ion-card-content>

                    <p>It seems that you have authenticated with a <b>personal certificate</b>. DOME requires LEARCredentials to be signed with an organisational certificate
                        (either a certificate for a legal representative or a certificate for seals).
                    </p>
                    <p>However, for testing purposes we allow you to use your personal certificate to generate test LEARCredentials (which will not be usable in production in DOME)</p>
                    <p>In this case, we will simulate a "fictitious" organisation with an identifier equal to your serial number (which is <b>${serial_number}</b>).</p>

                </ion-card-content>
            </ion-card>
            `;
      break;
    case "legalRepresentative":
      introMessage = html`
            <ion-card>
                <ion-card-header>
                    <ion-card-subtitle>Organisation</ion-card-subtitle>
                </ion-card-header>
                <ion-card-content>

                    <p>You have authenticated with a certificate with the following information:</p>
                    <ul>
                        <li>Organization: <b>${organization}</b></li>
                        <li>Organization identifier: <b>${organization_identifier}</b></li>
                    </ul>
                </ion-card-content>
            </ion-card>
            `;
      break;
    case "seal":
      introMessage = html`
            <ion-card>
                <ion-card-header>
                    <ion-card-subtitle>Organisation</ion-card-subtitle>
                </ion-card-header>
                <ion-card-content>

                    <p>You have authenticated with a certificate with the following information:</p>
                    <ul>
                        <li>Organization: <b>${organization}</b></li>
                        <li>Organization identifier: <b>${organization_identifier}</b></li>
                    </ul>
                </ion-card-content>
            </ion-card>
            `;
      break;
  }
  return html`
    <div>
        <style>
            me {margin:auto;max-width: 800px;}
        </style>
    
        <div class="w3-panel w3-card-2">
            <h1>Welcome ${common_name}</h1>

            ${introMessage}

            <p>
                It seems that this is your first time here, so please type your company email and click the <b>Register</b> button.
                We will use the email and some information inside your certificate to register you in the platform, so you will be able to start issuing LEARCredentials to one or more of your employees or contractors.
            </p>

            <h3>Enter your email to register</h3>

            <ion-loading id="loadingmsg" message="Registering..."></ion-loading>

            <ion-list>

                <ion-item>
                    <ion-input id="email" type="email" label="Email:"></ion-input>
                </ion-item>

            </ion-list>

            <div class="ion-margin">
                <ion-text color="danger"><p id="errortext"></p></ion-text>
    
                <ion-button @click=${() => registerEmail()}>
                    ${T("Register")}
                </ion-button>

            </div>
        </div>
    </div>
    `;
}
async function registerEmail() {
  me("#errortext").innerText = "";
  const email = me("#email").value;
  console.log("email:", email);
  if (email.length == 0) {
    console.log("email not specified");
    me("#errortext").innerText = "Enter your email";
    return;
  }
  const data = {
    "email": email,
    "emailVisibility": true,
    "password": "12345678",
    "passwordConfirm": "12345678"
  };
  try {
    const record = await pb.collection("signers").create(data);
    console.log(record);
  } catch (error) {
    myerror(error);
    gotoPage("ErrorPage", { title: "Error in registration", msg: error.message });
    return;
  }
  try {
    console.log("Requesting verification");
    var result = await pb.collection("signers").requestVerification(email);
    console.log("After requesting verification:", result);
  } catch (error) {
    myerror(error);
    gotoPage("ErrorPage", { title: "Error requesting verification", msg: error.message });
    return;
  }
  alert("Registration requested. Please check your email for confirmation.");
  cleanReload();
}
window.MHR.register("LogoffPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    console.log("AuthStore is valid:", pb.authStore.isValid);
    console.log(pb.authStore.model);
    var email, verified;
    if (pb.authStore.isValid) {
      email = pb.authStore.model.email;
      verified = pb.authStore.model.verified;
    }
    var theHtml = html`
        <ion-card>
            <ion-card-header>
                <ion-card-title>Confirm logoff</ion-card-title>
            </ion-card-header>
    
            <ion-card-content>
    
                <div class="ion-margin-top">
                <ion-text class="ion-margin-top">Please confirm logoff.</ion-text>
                </div>
    
            </ion-card-content>
    
            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => {
      pb.authStore.clear();
      window.MHR.cleanReload();
    }}>
                    ${T("Logoff")}
                </ion-button>
            </div>
    
        </ion-card>
        `;
    this.render(theHtml, false);
  }
});
