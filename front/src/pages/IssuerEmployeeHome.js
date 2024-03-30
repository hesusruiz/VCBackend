import PocketBase from '../components/pocketbase.es.mjs'
const pb = new PocketBase(window.location.origin)

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html

// This is the page where employees can logon to the Issuer
window.MHR.register("IssuerEmployeeHome", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

        console.log(document.location)

        // Check for redirect during the authentication flow
        if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
            console.log("************Redirected with state**************")
            gotoPage("LoadAndSaveQRVC", document.URL)
            return;
        }

        var email, verified
        if (pb.authStore.isValid) {
            email = pb.authStore.model.email
            verified = pb.authStore.model.verified
        }

        var theHtml


        // Present a different screen depending on the status of the user
        if (!pb.authStore.isValid) {
            // If the authStore is not yet valid, try to logon
            
            theHtml = await logonScreen()

        } else {

            if (!verified) {
                theHtml = validateEmailScreen()
            } else {
                gotoPage("IssuerLandingPage")
                return
            }

        }

        this.render(theHtml, false)

    }

})


function validateEmailScreen() {

    var email, verified
    if (pb.authStore.isValid) {
        email = pb.authStore.model.email
        verified = pb.authStore.model.verified
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
    `

}

async function requestVerification(email) {

    console.log("Requesting verification")
    const result = await pb.collection('signers').requestVerification(email)
    console.log("After requesting verification:", result)

}

// logonScreen allows the employee two things:
// 1. Logon to the system if she already has registered
// 2. Start the process of registering and validating her email address, so she will be able to perform logon after validation 
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
            <ion-button @click=${()=> logonWithEmail()}>
                ${T("Logon")}
            </ion-button>
            <ion-button @click=${()=> registerEmail()}>
                ${T("Register")}
            </ion-button>
        </div>
    
    </ion-card>
    `

}

async function logonWithEmail() {

    let params = new URL(document.location).searchParams
    let txcode = params.get("transaction_code")
    mylog(`txcode: ${txcode}`)

    // Retrieve the content of the email entry field
    const email = document.getElementById("email").value
    console.log(email)
    if (email.length == 0) {
        return
    } 

    // Make sure the authStore is cleared before loging in
    pb.authStore.clear()

    // Logon with a default password (we do not use the password so it is not a security problem) and reload the page
    try {
        const authData = await pb.collection('signers').authWithPassword(
            email,
            txcode,
        );
        console.log(authData)
            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error in logon", msg: error.message})
        return       
    }

    // Everything OK, reload the page, which will be in the logged-on status
    window.MHR.cleanReload()

}

// registerEmail starts the process of registration of the employee email
async function registerEmail() {
    const email = document.getElementById("email").value
    console.log(email)
    if (email.length == 0) {
        return
    } 

    const data = {
        "email": email,
        "emailVisibility": true,
        "password": "12345678",
        "passwordConfirm": "12345678",
    };

    try {
        console.log("Requesting verification")
        var result = await pb.collection('signers').requestVerification(email)
        console.log("After requesting verification:", result)            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error requesting verification", msg: error.message})
        return        
    }

    alert("Registration requested. Please check your email for confirmation.")

    window.MHR.cleanReload()
}

