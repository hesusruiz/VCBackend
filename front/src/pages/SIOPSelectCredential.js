
import { Base64 } from 'js-base64';
// @ts-ignore
import photo_man from '../img/photo_man.png'
// @ts-ignore
import photo_woman from '../img/photo_woman.png'

import { decodeJWT } from '../components/jwt'

// @ts-ignore
const MHR = window.MHR

// Copy some globals to make code less verbose
let gotoPage = MHR.gotoPage
let goHome = MHR.goHome
let storage = MHR.storage
let log = MHR.log
let html = MHR.html

// We will perform SIOP/OpenID4VP Authentication flow
MHR.register("SIOPSelectCredential", class extends MHR.AbstractPage {
    WebAuthnSupported = false
    PlatformAuthenticatorSupported = false

    constructor(id) {
        super(id)
    }

    /**
     * @param {string} openIdUrl
     */
    async enter(openIdUrl) {
        // openIdUrl is the url for a SIOP/OpenID4VP Authentication Request
        let html = this.html

        log.log("Inside SIOPSelectCredential:", openIdUrl)
        if (openIdUrl == null) {
            log.error("No URL has been specified")
            this.showError("Error", "No URL has been specified")
            return
        }

        // check whether current browser supports WebAuthn
        if (window.PublicKeyCredential) {
            this.WebAuthnSupported = true

            // Check for PlatformAuthenticator
            let available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
            if (available) {
                this.PlatformAuthenticatorSupported = true
            } 
        }

        // Derive from the received URL a simple one ready for parsing
        openIdUrl = openIdUrl.replace("openid://?", "")

        // Convert the input string to am URL object
        const inputURL = new URL(openIdUrl)

        // The URL can have two formats:
        // 1. An OpenId url with an Authentication Request object specified in the query parameters
        // 2. A url specifying a reference to an Authentication Request object
        //
        // We detect which one is it by looking at the query parameters:
        // 1. If 'scope' is in the url, then the AR object is in the url
        // 2. If 'jar' is in the url, then the AR is by reference, and the object can be retrieved
        //    by fetching the object.

        // Get the relevant parameters from the query string
        const params = new URLSearchParams(inputURL.search)
        var response_uri = params.get("response_uri")
        var state = params.get("state")
        var scope = params.get("scope")
        var jar = params.get("jar")

        log.log("state", state)
        log.log("response_uri", response_uri)
        log.log("scope", scope)
        log.log("jar", jar)

        if (jar == "yes") {
            const authRequestJWT = await getAuthRequest(openIdUrl)
            console.log(authRequestJWT)
            if (authRequestJWT == "error") {
                this.showError("Error", "Error fetching Authorization Request")
                return    
            }
            const authRequest = decodeJWT(authRequestJWT)
            console.log(authRequest)

            scope = authRequest.body.scope
            response_uri = authRequest.body.response_uri
            state = authRequest.body.state
        }

        // Get the last segment of the credential type in 'scope'
        const scopeParts = scope.split(".")
        if (scopeParts.length == 0) {
            log.error("Invalid scope specified")
            this.showError("Error", "Invalid scope specified")
            return
        }
        const credentialType = scopeParts[scopeParts.length-1]       

        // response_uri is the endpoint where we have to send the Authentication Response
        // We are going to extract the RP identity from that URL
        var rpURL = new URL(response_uri)
        var rpDomain = rpURL.hostname 

        // Retrieve all credentials from storage
        var credStructs = await storage.credentialsGetAllRecent()
        if (!credStructs) {
            let theHtml = html`
                <div class="w3-panel w3-margin w3-card w3-center w3-round color-error">
                <p>You do not have a Verifiable Credential.</p>
                <p>Please go to an Issuer to obtain one.</p>
                </div>
            `;
            this.render(theHtml)
            return
        }

        // Select credentials of the requested type, specified in "scope"
        var credentials = []
        for (const cc of credStructs) {
            const vc = JSON.parse(cc.encoded)
            const vctype = vc.type
            if (vctype.includes(scope)) {
                console.log("found", cc.encoded)
                credentials.push(vc)
                break
            }
        }

        // Error message if no credentials satisfy the condition 
        if (credentials.length == 0) {
            var msg = html`
                <p><b>${rpDomain}</b> has requested a Verifiable Credential of type ${credentialType} to perform authentication,
                but you do not have any credential of that type.</p>
                <p>Please go to an Issuer to obtain one.</p>
            `
            this.showError("Error", msg)
            return
        }

        let theHtml = html`
        <p></p>
        <div class="w3-row">
            <div class=" w3-container">
                <p>
                    <b>${rpDomain}</b> has requested a Verifiable Credential of type ${credentialType} to perform authentication.
                </p>
                <p>
                    If you want to send the credential, click the button "Send Credential".
                </p>
            </div>
            
            ${vcToHtml(credentials[0], response_uri, state, this.WebAuthnSupported)}

        </div>
        `

        this.render(theHtml)

    }

})

// Render a credential in HTML
function vcToHtml(vc, response_uri, state, webAuthnSupported) {

    // TODO: retrieve the holder and its private key from DB
    // Get the holder that will present the credential
    // We get this from the credential subject
    const holder = vc.credentialSubject.id

        var credentials = [vc]
    const vcs = vc.credentialSubject
    const pos = vcs.position
    var avatar = photo_man
    if (vcs.gender == "f") {
        avatar = photo_woman
    }

    const div = html`<div class="w3-half w3-container w3-margin-bottom">
        <div class="w3-card-4">
            <div class="w3-padding-left w3-margin-bottom color-primary">
                <h4>Employee</h4>
            </div>

            <div class="w3-container">
                <img src=${avatar} alt="Avatar" class="w3-left w3-circle w3-margin-right" style="width:60px">
                <p class="w3-large">${vcs.name}</p>
                <hr>
            <div class="w3-row-padding">

            <div class=" w3-container">
                <p class="w3-margin-bottom5">${pos.department}</p>
                <p class="w3-margin-bottom5">${pos.secretariat}</p>
                <p class="w3-margin-bottom5">${pos.directorate}</p>
                <p class="w3-margin-bottom5">${pos.subdirectorate}</p>
                <p class="w3-margin-bottom5">${pos.service}</p>
                <p class="w3-margin-bottom5">${pos.section}</p>
            </div>

            <div class="w3-padding-16">
              <btn-primary @click=${() => MHR.cleanReload()}>${T("Cancel")}</btn-primary>
              <btn-primary @click=${(e)=> sendAuthenticationResponse(e, holder, response_uri, credentials, state, webAuthnSupported)}>${T("Send Credential")}</btn-primary>
            </div>

        </div>
    </div>`

    return div

}


// sendAuthenticationResponse prepares an Authentication Response and sends it to the server as specified in the endpoint
async function sendAuthenticationResponse(e, holder, backEndpoint, credentials, state, authSupported) {
    e.preventDefault();

    const endpointURL  = new URL(backEndpoint)
    const origin = endpointURL.origin

    log.log("sending AUthenticationResponse to:", backEndpoint + "?state=" + state)
    log.log("The credentials: " + credentials)

    const uuid = self.crypto.randomUUID()

    // Create the vp_token structure
    var vpToken = {
        context: ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiablePresentation"],
        id: uuid,
        verifiableCredential: credentials,
        holder: holder
    }
    log.log("The encoded credential ", Base64.encodeURI(JSON.stringify(vpToken)))

    // Create the top-level structure for the Authentication Response
    var formAttributes = {
        'vp_token': Base64.encodeURI(JSON.stringify(vpToken)),
        'presentation_submission': Base64.encodeURI(JSON.stringify(presentationSubmission()))
    }
    // var formBody = [];
    // for (var property in formAttributes) {
    //     var encodedKey = encodeURIComponent(property);
    //     var encodedValue = encodeURIComponent(formAttributes[property]);
    //     formBody.push(encodedKey + "=" + encodedValue);
    // }

    // var formBody = formBody.join("&");

    // Encode in JSON to put it in the body of the POST
    var formBody = JSON.stringify(formAttributes)
    log.log("The body: " + formBody)

    // Send the Authentication Response
    try {
        let response = await fetch(backEndpoint + "?state=" + state, {
            method: "POST",
            mode: "cors",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody,
        })

        if (!authSupported) {
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "Authenticator not supported in this device"
            });
            return
        }

        if (response.status == 200) {
            const res = await response.json()
            log.log(res)

            if (res.authenticatorRequired == "yes") {

                res["origin"] = origin
                res["state"] = state

                log.log("Authenticator required")
                // The credential has been sent
                gotoPage("AuthenticatorPage", res);
                return
            }
        }

        // If we receive an HTTP status NotFound (404), it means the user does not have
        // an authenticator device registered with the server.
        if (response.status == 404) {

            // The server sent us the email of the user as a response
            var email = await response.text()
            log.log("credential sent, registering user", email)

            // Register new user with WebAuthn
            let error = await registerUser(origin, email, state)

            if (error == null) {

                log.log("Authenticator credential sent successfully to server")
                // The credential has been sent
                gotoPage("MessagePage", {
                    title: "Credential sent",
                    msg: "Registration successful"
                });

            } else {

                // There was an error, present it
                log.error(error)
                gotoPage("ErrorPage", {
                    title: "Error",
                    msg: "Error sending the credential"
                });

            }

            return
        }

        // If response status is OK (200), we have to use its authenticator device to finish login
        if (response.status == 200) {

            // The server sent us the email of the user as a response
            var email = await response.text()
            log.log("credential sent, authenticating user", email)
    
            // Authenticate user with WebAuthn
            let error = await loginUser(origin, email, state)

            if (error) {

                // There was an error, present it
                log.error(error)
                gotoPage("ErrorPage", {
                    title: "Error",
                    msg: "Error sending the credential"
                });

            } else {

                log.log("Authenticator credential sent successfully to server")
                // The credential has been sent
                gotoPage("MessagePage", {
                    title: "Credential sent",
                    msg: "Authentication successful"
                });
        

            }

            return
        }

        // There was an error, present it
        log.error("error sending credential", response.status)
        const res = await response.text()
        log.log("response:", res)

        gotoPage("ErrorPage", {
            title: "Error",
            msg: "Error sending the credential"
        });
        return

    } catch (error) {
        // There was an error, present it
        log.error(error)
        gotoPage("ErrorPage", {
            title: "Error",
            msg: "Error sending the credential"
        });
        return
    }
}

var apiPrefix = "/webauthn"

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
            log.log(errorText)
            return "error"
        }
        var responseJSON = await response.json()
        var credentialCreationOptions = responseJSON.options

        // This request is associated to a session in the server. We will send the response associated to that session
        // so the server can match the reply with the request
        var session = responseJSON.session
        
        log.log("Received CredentialCreationOptions", credentialCreationOptions)
        log.log("Session:", session)


        // Decode the fields that are b64Url encoded for transmission
        credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
        credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);

        // Decode each of the excluded credentials
        // This is a list of existing credentials in the server, to avoid the authenticator creating a new one
        // if the server already has a credential for this authenticator
        if (credentialCreationOptions.publicKey.excludeCredentials) {
            for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
            }
        }

        // Make the Authenticator create the credential
        log.log("creating new Authenticator credential")
        try {
            var credential = await navigator.credentials.create({
                publicKey: credentialCreationOptions.publicKey
            })
        } catch (error) {
            log.error(error)
            return error
        }

        log.log("Authenticator created Credential", credential)

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
        log.log("sending Authenticator credential to server")
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
            var errorText = await response.text()
            log.log(errorText)
            return "error"
        }

        log.log("Authenticator credential sent successfully to server")
        return


    } catch (error) {
        log.error(error)
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
            log.error("error requesting CredentialRequestOptions", response.status)
            return "error"
        }

        var responseJSON = await response.json()
        var credentialRequestOptions = responseJSON.options
        var session = responseJSON.session

        log.log("Received CredentialRequestOptions", credentialRequestOptions)

        // Decode the challenge from the server
        credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge)

        // Decode each of the allowed credentials
        credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
            listItem.id = bufferDecode(listItem.id)
        });

        // Call the authenticator to create the assertion
        try {
            var assertion = await navigator.credentials.get({
                publicKey: credentialRequestOptions.publicKey
            })
            if (assertion == null) {
                log.error("null assertion received from authenticator device")
                return "error"
            }
        } catch (error) {
            // Log and present the error page
            log.error(error)
            return error
        }

        log.log("Authenticator created Assertion", assertion)

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
                log.log(errorText)
                return "error"
            }

            return
    

        } catch (error) {
            log.error(error)
            return error        
        }

    } catch (error) {
        log.error(error)
        return error
    }


}

function presentationSubmission() {
    return {
        "definition_id": "SingleCredentialPresentation",
        "id": "SingleCredentialSubmission",
        "descriptor_map": [{
            "id": "single_credential",
            "path": "$",
            "format": "ldp_vp",
            "path_nested": {
                "format": "ldp_vc",
                "path": "$.verifiableCredential[0]"
            }
        }]
    }
}

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

async function getAuthRequest(uri) {
    var response = await fetch(uri,
        {
            mode: "cors"
        })
    if (!response.ok) {
        var errorText = await response.text()
        log.log(errorText)
        return "error"
    }
    var responseText = await response.text()
    return responseText
}