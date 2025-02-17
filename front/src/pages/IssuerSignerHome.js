// @ts-check

/**
 * IssuerSignerHome is the home page for the Issuer
 * It needs to be served under a reverse proxy that requests TLS client authentication,
 * so the browser requests to the user to select one of the certificates installed in
 * the user machine.
 */

import PocketBase from '../components/pocketbase.es.mjs'

const pb = new PocketBase(window.location.origin)

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html
let cleanReload = window.MHR.cleanReload

window.MHR.register("IssuerSignerHome", class extends window.MHR.AbstractPage {

    /**
     * @param {string} id
     */
    constructor(id) {
        super(id)
    }

    async enter() {
        var theHtml

        // Make sure the authStore is cleared before loging in
        pb.authStore.clear()

        // Authenticate with the server using implicitly the certificate in the TLS session.
        try {
            const authData = await pb.send('/apisigner/loginwithcert')
            debugger

            if (authData.token) {
                // We receive the token if the user was already registered, including a verified email

                // Store the token and user in the auth store and go to display the available certs
                pb.authStore.save(authData.token, authData.record)

                console.log(authData)

                gotoPage("ListOfferingsPage")
                return

            } else {

                if (authData.not_verified) {
                    // The signer is waiting confirmation of the email
                    console.log("waiting for confirmation")
                    gotoPage("ErrorPage", {
                        title: "Waiting for confirmation",
                        msg: "Please, check your email for a confirmation message.",
                        back: false,
                        level: "info"
                    })
                    return

                }

                // The certificate was not yet in the db, ask user to register
                theHtml = await registerScreen(authData)
                this.render(theHtml, false)
                return
            }

        } catch (error) {
            console.log("error in loginwithcert:", error)
            // Other errors are displayed as usual
            gotoPage("ErrorPage", { title: "Error in logon", msg: error.message })
            return
        }

    }

})


/**
 * @param {{ organization_identifier: any; organization: any; serial_number: any; common_name: any; }} authData
 */
async function registerScreen(authData) {

    const organization_identifier = authData.organization_identifier
    const organization = authData.organization
    const serial_number = authData.serial_number
    const common_name = authData.common_name

    // A certificate without an organization identifier is a personal certificate.
    // A certificate with both organizationIdentifier and serialNumber is a legal representative certificate.
    // A certificate with organizationIdentifier and without serialNumber is a seal certificate.
    var certificate_type = "personal"
    if (organization_identifier) {
        if (serial_number) {
            certificate_type = "legalRepresentative"
        } else {
            certificate_type = "seal"
        }
    }

    var introMessage

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
            `

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
            `

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
            `

            break;

    }

    // Create and present the registration    
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
    `
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

    // Prepare data to be sent to the server. The password is not used, but the server requires it (for the moment)
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
        gotoPage("ErrorPage", { title: "Error in registration", msg: error.message })
        return
    }

    // Request automatically a verification of the email
    try {
        console.log("Requesting verification")
        var result = await pb.collection('signers').requestVerification(email)
        console.log("After requesting verification:", result)
    } catch (error) {
        myerror(error)
        gotoPage("ErrorPage", { title: "Error requesting verification", msg: error.message })
        return
    }

    alert("Registration requested. Please check your email for confirmation.")

    cleanReload()
}



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
            gotoPage("ErrorPage", { title: "Error retrieving eIDAS certificate info", msg: "eIDAS certificate does not have Common Name" })
            return
        }
    } catch (error) {
        myerror(error)
        gotoPage("ErrorPage", { title: "Error retrieving eIDAS certificate info", msg: error.message })
        return
    }

    if (certInfo.organization_identifier) {
        var introMessage = html`
        <ion-card>
        <ion-card-header>
            <ion-card-subtitle>Organisation</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>

            <p>You have authenticated with a certificate with the following information:</p>
            <ul>
                <li>Organization: <b>${certInfo.organization}</b></li>
                <li>Organization identifier: <b>${certInfo.organization_identifier}</b></li>
            </ul>
        </ion-card-content>
        </ion-card>

        `

    } else {
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
            <p>In this case, we will simulate a "fictitious" organisation with an identifier equal to your serial number (which is <b>${certInfo.serial_number}</b>).</p>

        </ion-card-content>
        </ion-card>
        `
    }

    // Create and present the logon screen    
    return html`
    <div>
        <style>
            me {margin:auto;max-width: 800px;}
        </style>
    
        <div class="w3-panel w3-card-2">
            <h1>Welcome ${commonName}</h1>

            ${introMessage}

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
    
                <ion-button id="login" @click=${() => logonWithEmail()}>
                    ${T("Logon (if you are already registered)")}
                </ion-button>

                ${certInfo.registered_email_address ? null : html`
                <ion-button color="secondary" @click=${() => registerEmail()}>
                    ${T("Register (if this is the first time)")}
                </ion-button>`
        }

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
                <ion-card-title>Welcome ${email}</ion-card-title>
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
        gotoPage("ErrorPage", { title: "Error in logon", msg: error.message })
        return
    } finally {
        loader.dismiss()
    }

    // Reload the page
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
                <ion-button @click=${() => { pb.authStore.clear(); window.MHR.cleanReload() }}>
                    ${T("Logoff")}
                </ion-button>
            </div>
    
        </ion-card>
        `

        this.render(theHtml, false)

    }


})
