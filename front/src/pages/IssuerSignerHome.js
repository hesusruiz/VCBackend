import PocketBase from '../components/pocketbase.es.mjs'

const pb = new PocketBase(window.location.origin)

import { log } from '../log'

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html

window.MHR.register("IssuerSignerHome", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

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
                gotoPage("ListOfferingsPage")
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


async function logonScreen() {

    var certInfo
    // Create the credential but do not store anything yet in the server
    try {
        certInfo = await pb.send('/apiadmin/getcertinfo')
        var commonName = certInfo.common_name
        console.log(certInfo)            
    } catch (error) {
        console.error(error)
    }
    
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
                ${commonName ? html`<h2>Welcome ${commonName}</h2>` : null}
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
    const email = document.getElementById("email").value
    console.log(email)
    if (email.length == 0) {
        return
    } 

    // Make sure the authStore is cleared before loging in
    pb.authStore.clear()

    try {
        const authData = await pb.collection('signers').authWithPassword(
            email,
            "12345678",
        );
        console.log(authData)
            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error in logon", msg: error.message})
        return       
    }

    window.MHR.cleanReload()

}

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
        const record = await pb.collection('signers').create(data);
        console.log(record)            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error in registration", msg: error.message})
        return
    }

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
