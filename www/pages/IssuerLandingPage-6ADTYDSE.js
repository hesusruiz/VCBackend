import {
  Client
} from "../chunks/chunk-J6D2DG7T.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/IssuerLandingPage.js
var pb = new Client(window.location.origin);
var gotoPage = window.MHR.gotoPage;
var goHome = window.MHR.goHome;
var storage = window.MHR.storage;
var myerror = window.MHR.storage.myerror;
var mylog = window.MHR.storage.mylog;
var html = window.MHR.html;
window.MHR.register("IssuerLandingPage", class extends window.MHR.AbstractPage {
  constructor(id) {
    super(id);
  }
  async enter() {
    var theHtml = html`
        <ion-grid>
            <ion-row>
                <ion-col size="12" size-md="6">
                    <ion-card>
                        <ion-card-header>
                            <ion-card-title>Logon as Employee</ion-card-title>
                        </ion-card-header>
                
                        <ion-card-content>
                
                            <h2>
                                You need to register and verify your email before being able to logon and use this system.
                            </h2>
                
                        </ion-card-content>
                
                        <div class="ion-margin-start ion-margin-bottom">
                            <ion-button @click=${() => logonWithEmail()}>
                                ${T("Logon as Employee")}
                            </ion-button>
                        </div>
                
                    </ion-card>
                
                </ion-col>
        
                <ion-col size="12" size-md="6">
        
                    <ion-card>
                        <ion-card-header>
                            <ion-card-title>Logon as Legal Representative</ion-card-title>
                        </ion-card-header>
                
                        <ion-card-content>
                
                            <h2>
                                You need an eIDAS certificate to be able to use the system.
                                In addition you wil have to register your email.
                            </h2>
                
                        </ion-card-content>
                
                        <div class="ion-margin-start ion-margin-bottom">
                            <ion-button href="https://issuersec.mycredential.eu/issuer.html">
                                ${T("Logon as Legal representative")}
                            </ion-button>
                        </div>
        
                </ion-col>
            </ion-row>
        
        </ion-grid>
        
        `;
    this.render(theHtml, false);
  }
});
