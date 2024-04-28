import { Base64 } from 'js-base64';

import { decodeJWT } from '../components/jwt'
import { renderLEARCredentialCard } from '../components/renderLEAR';

// @ts-ignore
const MHR = window.MHR

// Copy some globals to make code less verbose
let gotoPage = MHR.gotoPage
let goHome = MHR.goHome
let storage = MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
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

        mylog("Inside SIOPSelectCredential:", openIdUrl)
        if (openIdUrl == null) {
            myerror("No URL has been specified")
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
        openIdUrl = openIdUrl.replace("openid4vp://?", "https://wallet.mycredential.eu//?")

        // Convert the input string to a URL object
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
        var request_uri = params.get("request_uri")
        if (!request_uri) {
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "'request_uri' parameter not found in URL"
            });
            return
        }

        request_uri = decodeURIComponent(request_uri)

        const authRequestJWT = await getAuthRequest(request_uri)
        console.log(authRequestJWT)
        if (authRequestJWT == "error") {
            this.showError("Error", "Error fetching Authorization Request")
            return    
        }
        const authRequest = decodeJWT(authRequestJWT)
        console.log("Decoded authRequest", authRequest)

        const scope = authRequest.body.scope
        const response_uri = authRequest.body.response_uri
        const state = authRequest.body.state

        mylog("state", state)
        mylog("request_uri", request_uri)
        mylog("scope", scope)

        // Get the last segment of the credential type in 'scope'
        const scopeParts = scope.split(".")
        if (scopeParts.length == 0) {
            myerror("Invalid scope specified")
            this.showError("Error", "Invalid scope specified")
            return
        }
        const displayCredType = scopeParts[scopeParts.length-1]       

        // response_uri is the endpoint where we have to send the Authentication Response
        // We are going to extract the RP identity from that URL
        var rpURL = new URL(response_uri)
        var rpDomain = rpURL.hostname 

        // Retrieve all credentials from storage, to process them in memory
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

        // Select all credentials of the requested type, specified in "scope"
        var credentials = []
        for (const cc of credStructs) {
            const vc = cc.decoded
            const vctype = vc.type
            if (vctype.includes(scope)) {
                console.log("found", cc.encoded)
                credentials.push(vc)
            }
        }

        // Error message if no credentials satisfy the condition 
        if (credentials.length == 0) {
            var msg = html`
                <p><b>${rpDomain}</b> has requested a Verifiable Credential of type ${displayCredType} to perform authentication,
                but you do not have any credential of that type.</p>
                <p>Please go to an Issuer to obtain one.</p>
            `
            this.showError("Error", msg)
            return
        }

        let theHtml = html`
        <ion-card color="warning">
                
            <ion-card-content>
            <div style="line-height:1.2"><b>${rpDomain}</b> <span class="text-small">has requested a Verifiable Credential of type ${displayCredType} to perform authentication.</span></div>
            </ion-card-content>
            
        </ion-card>

        ${credentials.map(cred => html`${vcToHtml(cred, response_uri, state, this.WebAuthnSupported)}`)}
        
        `

        this.render(theHtml)

    }

})

// Render the credential with buttons so the user can select it for authentication
function vcToHtml(vc, response_uri, state, webAuthnSupported) {

    // TODO: retrieve the holder and its private key from DB
    // Get the holder that will present the credential
    // We get this from the credential subject
    const holder = vc.credentialSubject.id

    var credentials = [vc]

    const div = html`
    <ion-card>
        ${renderLEARCredentialCard(vc)}

        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${()=> MHR.cleanReload()}>
                <ion-icon slot="start" name="chevron-back"></ion-icon>
                ${T("Cancel")}
            </ion-button>

            <ion-button @click=${(e)=> sendAuthenticationResponse(e, holder, response_uri, credentials, state, webAuthnSupported)}>
                <ion-icon slot="start" name="paper-plane"></ion-icon>
                ${T("Send Credential")}
            </ion-button>
        </div>
    </ion-card>
    `

    return div

}


// sendAuthenticationResponse prepares an Authentication Response and sends it to the server as specified in the endpoint
async function sendAuthenticationResponse(e, holder, backEndpoint, credentials, state, authSupported) {
    e.preventDefault();

    const endpointURL  = new URL(backEndpoint)
    const origin = endpointURL.origin

    mylog("sending AuthenticationResponse to:", backEndpoint + "?state=" + state)

    const uuid = self.crypto.randomUUID()

    // Create the vp_token structure
    var vpToken = {
        context: ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiablePresentation"],
        id: uuid,
        verifiableCredential: credentials,
        holder: holder
    }
    mylog("The encoded vpToken ", Base64.encodeURI(JSON.stringify(vpToken)))

    // Create the top-level structure for the Authentication Response
    var formAttributes = {
        'vp_token': Base64.encodeURI(JSON.stringify(vpToken)),
        'presentation_submission': Base64.encodeURI(JSON.stringify(presentationSubmissionJWT()))
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
    mylog("The body: " + formBody)

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
            mylog(res)

            // Check if the server requires the authenticator to be used
            if (res.authenticatorRequired == "yes") {

                res["origin"] = origin
                res["state"] = state

                mylog("Authenticator required")
                // The credential has been sent
                gotoPage("AuthenticatorPage", res);
                return
            } else {
                gotoPage("AuthenticatorSuccessPage")
                return
            }
        }

        // There was an error, present it
        myerror("error sending credential", response.status)
        const res = await response.text()
        mylog("response:", res)

        gotoPage("ErrorPage", {
            title: "Error",
            msg: "Error sending the credential"
        });
        return

    } catch (error) {
        // There was an error, present it
        myerror(error)
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
            var errorText = await response.text()
            mylog(errorText)
            return "error"
        }

        mylog("Authenticator credential sent successfully to server")
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

        // Call the authenticator to create the assertion
        try {
            var assertion = await navigator.credentials.get({
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

function presentationSubmissionJWT() {
    return {
        "definition_id": "SingleCredentialPresentation",
        "id": "SingleCredentialSubmission",
        "descriptor_map": [{
            "id": "single_credential",
            "path": "$",
            "format": "jwt_vp_json",
            "path_nested": {
                "format": "jwt_vc_json",
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
        mylog(errorText)
        return "error"
    }
    var responseText = await response.text()
    return responseText
}