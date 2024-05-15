let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog

window.MHR.register("AuthenticatorPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter(pageData) {
        let html = this.html

        // We expect pageData to be an object with these fields:
        // "authenticatorRequired": "yes",
        // "authType":              "registration",
        // "email":                 email,
        // "origin":                origin,
        // "state":                 state

        // Provide a default title if the user did not set the title
        let title = T("Authenticator required")

        const authType = pageData.authType
        const email = pageData.email
        const origin = pageData.origin
        const state = pageData.state

        // Display the title and message, with a button that goes to the home page
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
                <ion-button expand="block" @click=${()=> webAuthn(authType, origin, email, state)}>
                    <ion-icon size="large" slot="start" name="finger-print"></ion-icon>
                    ${T("Click to use biometric authentication")}
                </ion-button>
            </div>

        </ion-card>            
        `
        this.render(theHtml)
    }
})


var apiPrefix = "/webauthn"

async function webAuthn(authType, origin, username, state) {
    var error 
    // Check if we have any WebAuthn credential in this device for that user
    const wkey = "wauth-" + username
    const wauthid = await window.MHR.storage.settingsGet(wkey)

    if (wauthid == null) {
        // Register new user in any case, if we do not have credentials in this device
        console.log("no webauthn credentials in local device, registering", username)
        error = await registerUser(origin, username, state)
        if (error) {
            myerror(error)
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "Error registering the user"
            });
            return
        }
    } else if (authType == "registration") {
        // Server does not have credentials for this user, requires registration
        console.log("no credentials in server, registering", username)
        error = await registerUser(origin, username, state)
        if (error) {
            myerror(error)
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "Error registering the user"
            });
            return
        }
    } else {
        // Server already has credentials for this user, requires login
        console.log("already credentials in server, loging", username)
        error = await loginUser(origin, username, state)
        if (error) {
            myerror(error)
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "Error loging user"
            });
            return
        }
    }

    // TODO: display a success page
    gotoPage("AuthenticatorSuccessPage")
    return
}

// registerUser asks the authenticator device where the wallet is running for a new WebAuthn credential
// and sends the new credential to the server, which will store it associated to the user+device 
async function registerUser(origin, username, state) {

    

    try {

        // Get from the server the CredentialCreationOptions
        // It will be associated to the username that corresponds to the current state, which is the
        // username inside the credential that was sent to the Verifier
        var response = await fetch(origin + apiPrefix + '/register/begin/' + username + "?state=" + state,
            {
                mode: "cors"
            })
        if (!response.ok) {
            var errorText = await response.text()
            mylog(errorText)
            return "error"
        }
        var responseJSON = await response.json()
        var credentialCreationOptions = responseJSON.options

        // This request is associated to a session in the server. We will send the response associated to that session
        // so the server can match the reply with the request
        var session = responseJSON.session
        
        mylog("Received CredentialCreationOptions", credentialCreationOptions)
        mylog("Session:", session)


        // Decode the fields that are b64Url encoded for transmission
        credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
        credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);

        // Decode each of the excluded credentials
        // This is a list of existing credentials in the server, to avoid the authenticator creating a new one
        // if the server already has a credential for this authenticator

        const wauthid = await window.MHR.storage.settingsGet("wauth-" + username)
        if (wauthid == null) {
            console.log("no credentials in local device, erasing excludeCredentials data")
            credentialCreationOptions.publicKey.excludeCredentials = []
        }

        if (credentialCreationOptions.publicKey.excludeCredentials) {
            for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
            }
        }

        // Make the Authenticator create the credential
        mylog("creating new Authenticator credential")
        try {
            var credential = await navigator.credentials.create({
                publicKey: credentialCreationOptions.publicKey
            })
        } catch (error) {
            myerror(error)
            return error
        }

        mylog("Authenticator created Credential", credential)

        // Get the fields that we should encode for transmission to the server
        let attestationObject = credential.response.attestationObject;
        let clientDataJSON = credential.response.clientDataJSON;
        let rawId = credential.rawId;

        // Create the object to send
        var data = {
            id: credential.id,
            rawId: bufferEncode(rawId),
            type: credential.type,
            response: {
                attestationObject: bufferEncode(attestationObject),
                clientDataJSON: bufferEncode(clientDataJSON),
            },
        }

        var wholeData = {
            response: data,
            session: session
        }

        // Perform a POST to the server
        mylog("sending Authenticator credential to server")
        var response = await fetch(origin + apiPrefix + '/register/finish/' + username + "?state=" + state, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'session_id': session
            },
            mode: 'cors',
            body: JSON.stringify(wholeData) // body data type must match "Content-Type" header
        });
        if (!response.ok) {
            mylog(errorText)
            var errorText = await response.text()
            return "error"
        }

        mylog("Authenticator credential sent successfully to server")

        // Record locally that an attestation was created
        const wkey = "wauth-" + username
        await window.MHR.storage.settingsPut(wkey, data.id)

        return


    } catch (error) {
        myerror(error)
        return error
    }

}


async function loginUser(origin, username, state) {

    try {

        // Get from the server the CredentialRequestOptions
        var response = await fetch(origin + apiPrefix + '/login/begin/' + username + "?state=" + state,
            {
                mode: "cors"
            })
        if (!response.ok) {
            myerror("error requesting CredentialRequestOptions", response.status)
            return "error"
        }

        var responseJSON = await response.json()
        var credentialRequestOptions = responseJSON.options
        var session = responseJSON.session

        mylog("Received CredentialRequestOptions", credentialRequestOptions)

        // Decode the challenge from the server
        credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge)

        // Decode each of the allowed credentials
        credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
            listItem.id = bufferDecode(listItem.id)
        });

        const discoverable = true
        var assertion

        if (discoverable) {
            credentialRequestOptions.publicKey.allowCredentials = []
            // Call the authenticator to create the assertion
            try {
                assertion = await navigator.credentials.get({
                    publicKey: credentialRequestOptions.publicKey
                })
                if (assertion == null) {
                    myerror("null assertion received from authenticator device")
                    return "error"
                }
            } catch (error) {
                // Log and present the error page
                myerror(error)
                return error
            }

            mylog("Discoverable Assertion created", assertion)

        } else {
            // Call the authenticator to create the assertion
            try {
                assertion = await navigator.credentials.get({
                    publicKey: credentialRequestOptions.publicKey
                })
                if (assertion == null) {
                    myerror("null assertion received from authenticator device")
                    return "error"
                }
            } catch (error) {
                // Log and present the error page
                myerror(error)
                return error
            }

        }

        mylog("Authenticator created Assertion", assertion)

        // Get the fields that we should encode for transmission to the server
        let authData = assertion.response.authenticatorData
        let clientDataJSON = assertion.response.clientDataJSON
        let rawId = assertion.rawId
        let sig = assertion.response.signature
        let userHandle = assertion.response.userHandle

        // Create the object to send
        var data = {
            id: assertion.id,
            rawId: bufferEncode(rawId),
            type: assertion.type,
            response: {
                authenticatorData: bufferEncode(authData),
                clientDataJSON: bufferEncode(clientDataJSON),
                signature: bufferEncode(sig),
                userHandle: bufferEncode(userHandle),
            },
        }

        // The wrapper object for the POST body
        var wholeData = {
            response: data,
            session: session
        }

        // Perform a POST to the server
        try {
            
            var response = await fetch(origin + apiPrefix + '/login/finish/' + username + "?state=" + state, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'session_id': session
                },
                mode: 'cors',
                body: JSON.stringify(wholeData)
            });

            if (!response.ok) {
                var errorText = await response.text()
                mylog(errorText)
                return "error"
            }

            return
    

        } catch (error) {
            myerror(error)
            return error        
        }

    } catch (error) {
        myerror(error)
        return error
    }


}


window.MHR.register("AuthenticatorSuccessPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter(pageData) {
        let html = this.html

        // Display the title and message, with a button that goes to the home page
        let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>Authentication success</ion-card-title>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">

                <div class="text-larger">The authentication process has been completed</div>

            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button @click=${()=> window.MHR.cleanReload()}>
                    <ion-icon slot="start" name="home"></ion-icon>
                    ${T("Home")}
                </ion-button>

            </div>
        </ion-card>
        `

        this.render(theHtml)
    }

})


// Base64 to ArrayBuffer
function bufferDecode(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

// ArrayBuffer to URLBase64
function bufferEncode(value) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");;
}
