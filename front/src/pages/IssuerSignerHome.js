// @ts-check
import PocketBase from '../components/pocketbase.es.mjs'

const pb = new PocketBase(window.location.origin)

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html
let cleanReload = window.MHR.cleanReload

// This is the home page for the Issuer.
// It needs to be served under a reverse proxy that requests TLS client authentication,
// so the browser requests to the user to select one of the certificates installed in
// the user machine.
window.MHR.register("IssuerSignerHome", class extends window.MHR.AbstractPage {

    /**
     * @param {string} id
     */
    constructor(id) {
        super(id)
    }

    async enter() {
        var theHtml

        // There are three possibilities:
        // 1. The authstore is valid and the email is already verified: the user is already logged in and
        // there is a valid session, so we can proceed directly to present the main Verifiable Credentials page.
        // 2. The authstrore is valid but the email lacks verification: we go to the email verification screen.
        // 3. The authstore is not valid: we go to the login/registration screen.

        if (pb.authStore.isValid) {
            if (pb.authStore.model.verified) {
                gotoPage("ListOfferingsPage")
            } else {
                theHtml = validateEmailScreen()
                this.render(theHtml, false)
            }
        } else {
            theHtml = await logonScreen()
            this.render(theHtml, false)
        }

    }

})

async function logonScreen() {

    var certInfo
    // Ask the server to provide info about the eIDAS certificate used by the user for TLS client authentication
    // We will use the Subject Common Name as the user name for display purposes.
    // The Subject of the eIDAS certificate is the "official" info of the legal representative of the company.
    try {
        certInfo = await pb.send('/apisigner/getcertinfo')
        var commonName = certInfo.common_name
        mylog(certInfo)
        if (!certInfo.common_name) {
            myerror("eIDAS certificate does not have Common Name")
            gotoPage("ErrorPage", {title: "Error retrieving eIDAS certificate info", msg: "eIDAS certificate does not have Common Name"})
            return           
        }
    } catch (error) {
        myerror(error)
        gotoPage("ErrorPage", {title: "Error retrieving eIDAS certificate info", msg: error.message})
        return       
    }

    // Create and present the logon screen    
    return html`
    <div>
        <style>
            me {margin:auto;max-width: 800px;}
        </style>
    
        <div class="w3-panel w3-card-2">
            <h1>Welcome ${commonName}</h1>

            <p>The information above is coming directly from your eIDAS certificate.</p>
            <p>
                If this is your first time here, you can type your company email and click the <b>Register</b> button.
                We will use the email and some information inside your certificate to register you in the platform, so you will be able to start issuing LEARCredentials to one or more of your employees or contractors.
            </p>
            <p>If you have already registered your email, just enter it and click the <b>Logon</b> button.</p>

            <h3>Enter your email to logon or to register</h3>

            <ion-loading id="loadingmsg" message="Logging on..."></ion-loading>

            <ion-list>

                <ion-item>
                    <ion-input id="email" type="email" label="Email:"></ion-input>
                </ion-item>

            </ion-list>

            <div class="ion-margin">
                <ion-text color="danger"><p id="errortext"></p></ion-text>
    
                <ion-button id="login" @click=${()=> logonWithEmail()}>
                    ${T("Logon (if you are already registered)")}
                </ion-button>

                <ion-button color="secondary" @click=${()=> registerEmail()}>
                    ${T("Register (if this is the first time)")}
                </ion-button>

            </div>
        </div>
    </div>
    `
}


function validateEmailScreen() {

    var email, verified
    if (pb.authStore.isValid) {
        email = pb.authStore.model.email
        verified = pb.authStore.model.verified
    }

    return html`
    <div>
    
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
                <ion-button @click=${()=> requestVerification(email)}>
                    ${T("Request verification")}
                </ion-button>
                <ion-button @click=${()=> pb.authStore.clear()}>
                    ${T("Logoff")}
                </ion-button>
            </div>
    
        </ion-card>
    </div>
    `

}

async function requestVerification(email) {

    console.log("Requesting verification")
    const result = await pb.collection('signers').requestVerification(email)
    console.log("After requesting verification:", result)

}


// logonWithEmail is called from the Logon button on the logon page
async function logonWithEmail() {

    // Clear any error message
    me("#errortext").innerText = ""

    // Get the email that the user entered
    const email = me("#email").value
    console.log("email:", email)

    if (email.length == 0) {
        console.log("email not specified")
        me("#errortext").innerText = "Enter your email"
        return
    }

    // Make sure the authStore is cleared before loging in
    pb.authStore.clear()

    // Present a spinner while the server is busy
    const loader = me("#loadingmsg")
    loader.present()

    // Authenticate with the server. The password is not used, but the server requires it.
    try {
        const authData = await pb.collection('signers').authWithPassword(
            email,
            "12345678",
        );
        console.log(authData)
            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error in logon", msg: error.message})
        return       
    } finally {
        loader.dismiss()
    }

    // Reload the page
    cleanReload()

}

// registerEmail is called from the Register button in the Logon page
async function registerEmail() {
    // Clear any error message
    me("#errortext").innerText = ""

    // Get the email that the user entered
    const email = me("#email").value
    console.log("email:", email)

    if (email.length == 0) {
        console.log("email not specified")
        me("#errortext").innerText = "Enter your email"
        return
    } 

    // Prepare data to be sent to the server. The password is not used, but the server requires it
    const data = {
        "email": email,
        "emailVisibility": true,
        "password": "12345678",
        "passwordConfirm": "12345678",
    };

    // Create a record for the legal representative in the server
    try {
        const record = await pb.collection('signers').create(data);
        console.log(record)            
    } catch (error) {
        myerror(error)
        gotoPage("ErrorPage", {title: "Error in registration", msg: error.message})
        return
    }

    // Request automatically a verification of the email
    try {
        console.log("Requesting verification")
        var result = await pb.collection('signers').requestVerification(email)
        console.log("After requesting verification:", result)            
    } catch (error) {
        myerror(error)
        gotoPage("ErrorPage", {title: "Error requesting verification", msg: error.message})
        return        
    }

    alert("Registration requested. Please check your email for confirmation.")

    cleanReload()
}


window.MHR.register("LogoffPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

        console.log("AuthStore is valid:", pb.authStore.isValid)
        console.log(pb.authStore.model)
        var email, verified
        if (pb.authStore.isValid) {
            email = pb.authStore.model.email
            verified = pb.authStore.model.verified
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
                <ion-button @click=${() => {pb.authStore.clear();window.MHR.cleanReload()}}>
                    ${T("Logoff")}
                </ion-button>
            </div>
    
        </ion-card>
        `

        this.render(theHtml, false)

    }


})
