import PocketBase from '../components/pocketbase.es.mjs'

const pb = new PocketBase(window.location.origin)

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html

window.MHR.register("IssuerLandingPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

        var theHtml = html`
        ${introduction()}
        <ion-grid>
            <ion-row>
                <ion-col size="12" size-md="6">
                    <ion-card>
                        <ion-card-header>
                            <ion-card-title>Obtain your Wallet</ion-card-title>
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
                            <ion-button href="https://issuersec.mycredential.eu/">
                                ${T("Logon as Legal representative")}
                            </ion-button>
                        </div>
        
                </ion-col>
            </ion-row>
        
        </ion-grid>
        
        `
        
        this.render(theHtml, false)

    }


})

function introduction() {
    return html`
<h1>Welcome to the Issuer of LEARCredentials</h1>
<p>This site is intended for Legal Representatives of companies who want to issue one or more LEARCredentials to one or more employees of the company.</p>
<p>A LEARCredential is a type of Verifiable Credential which enables an employee, nominated by a legal representative, to act on behalf of an organisation with restricted powers with respect to third-parties.
    <ol>
        <li>The issuer of the LEARCredential <b>must be a legal representative</b> of the company. The legal representative will sign the LEARCredential with an eIDAS digital certificate, which can be either a personal one or a certificate of representation.</li>
        <li>The receiver of the LEARCredential (both the subject and holder of the credential) <b>can be any employee (or contractor)</b> of the company. The legal representative will delegate a restricted set of powers to that person. Those restricted powers are included inside the credential and can be verified by any Relying party to whom the holder presents the LEARCredential.</li>
    </ol>
    
</p>
    
    
    `
}