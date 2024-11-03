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
                            <ion-card-title>Login with your LEAR Credential</ion-card-title>
                        </ion-card-header>
                
                        <ion-card-content>
                
                            <h2>
                                You will use your Wallet and your LEARCredential to login in the system.
                            </h2>
                
                        </ion-card-content>
                
                        <div class="ion-margin-start ion-margin-bottom">
                            <ion-button @click=${() => logonWithEmail()}>
                                ${T("Login with your Wallet")}
                            </ion-button>
                        </div>
                
                    </ion-card>
                
                </ion-col>
        
                <ion-col size="12" size-md="6">
        
                    <ion-card>
                        <ion-card-header>
                            <ion-card-title>Login with your certificate</ion-card-title>
                        </ion-card-header>
                
                        <ion-card-content>
                
                            <h2>
                                You need an eIDAS certificate of representation to be able to use the system.
                                In addition you wil have to register your email.
                            </h2>
                
                        </ion-card-content>
                
                        <div class="ion-margin-start ion-margin-bottom">
                            <ion-button href="https://issuersec.mycredential.eu/">
                                ${T("Login with your certificate")}
                            </ion-button>
                        </div>
                    </ion-card>
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
<p>This site is intended for Legal Representatives or LEARs of companies who want to issue one or more LEARCredentials to one or more employees of the company.</p>
`

}