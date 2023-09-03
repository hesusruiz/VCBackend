import { log } from '../log'
import { Base64 } from 'js-base64';

// import * as db from "../components/db"
// import * as jwt from "../components/jwt"

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome

window.MHR.register("SIOPSelectCredential", class SIOPSelectCredential extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(qrData) {
        // qrData is the url for a SIOP/OpenID4VP Authentication Request
        let html = this.html

        log.log("Inside SIOPSelectCredential:", qrData)
        if (qrData == null) {
            log.error("No URL has been specified")
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "No URL has been specified"
            });
            return
        }

        // Create a simple URL ready for parsing
        qrData = qrData.replace("openid://?", "")

        // Get the relevant parameters from the query string
        var params = new URLSearchParams(qrData)
        var redirect_uri = params.get("redirect_uri")
        var state = params.get("state")
        var scope = params.get("scope")
        log.log("state", state, "redirect_uri", redirect_uri)
        log.log("redirect_uri", redirect_uri)
        log.log("scope", scope)
        var credentialType = "Employee"

        if (scope != "dsba.credentials.presentation.Employee") {
            log.error("invalid scope:", scope)
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "Invalid credential requested"
            });
            return
        }

        // Check if we have a certificate in local storage
        let total = 0
        if(!!window.localStorage.getItem("W3C_VC_LD_TOTAL")) {
          total = parseInt(window.localStorage.getItem("W3C_VC_LD_TOTAL"))
        }

        if (total < 1) {
            let theHtml = html`
            <div class="w3-panel w3-margin w3-card w3-center w3-round color-error">
            <p>You do not have a Verifiable Credential.</p>
            <p>Please go to an Issuer to obtain one.</p>
            </div>
            `;
            this.render(theHtml)
            return             
        }

        // Retrieve all credentials from storage
        let qrContent = []
        for (let i = 0; i < total; i++) { 
            const currentId = "W3C_VC_LD_"+i
            if(!!window.localStorage.getItem(currentId)) { 
                qrContent.push(window.localStorage.getItem(currentId))
            }
        }
        log.log("credential", qrContent)


        let theHtml = html`
        <p></p>
        <div class="w3-row">

            <div class="w3-half w3-container w3-margin-bottom">
                <div class="w3-card-4">
                    <div class=" w3-container w3-margin-bottom color-primary">
                        <h4>Authorization Request received</h4>
                    </div>

                    <div class=" w3-container">
                    <p>
                        The Verifier has requested a Verifiable Credential of type ${credentialType} to perform authentication.
                    </p>
                    <p>
                        If you want to send the credential, click the button "Send Credential".
                    </p>
                    </div>
        
                    <div class="w3-container w3-padding-16">
                        <btn-primary @click=${()=> sendCredential(redirect_uri, qrContent, state)}>${T("Send Credential")}</btn-primary>
                    </div>
        
                </div>
            </div>            
        </div>
        `

        this.render(theHtml)

    }

})

// sendCredential prepares an Authentication Response and sends it to the server as specified in the endpoint
async function sendCredential(backEndpoint, credential, state) {

    log.log("sending POST to:", backEndpoint + "?state=" + state)
    var ps = {
        id: "Placeholder - not yet evaluated.",
        definition_id: "Example definition." 
    }
    log.log("The credential: " + credential)

    // Create the vp_token structure
    var vpToken = {
        context: ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiablePresentation"],
        verifiableCredential: JSON.parse("[" + credential + "]"),
        // currently unverified
        holder: "did:my:wallet"
    }
    log.log("The encoded credential ", Base64.encodeURI(JSON.stringify(vpToken)))

    // Create the top-level structure for the Authentication Response
    var formAttributes = {
        'vp_token': Base64.encodeURI(JSON.stringify(vpToken)),
        'presentation_submission': Base64.encodeURI(JSON.stringify(ps))
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
            mode: "no-cors",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody,
        })

        // If we receive an HTTP status NotFound (404), it means the user does not have
        // an authenticator device registered with the server.
        if (response.status == 404) {

            // The server sent us the email of the user as a response
            var email = await response.text()
            log.log("credential sent, registering user", email)

            // Register new user with WebAuthn
            let error = await registerUser(email, state)

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
            let error = await loginUser(email, state)

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


async function registerUser(username, state) {

    try {

        // Get from the server the CredentialCreationOptions
        var response = await fetch(apiPrefix + '/register/begin/' + username + "?state=" + state, {credentials:'include'})
        if (!response.ok) {
            var errorText = await response.text()
            log.log(errorText)
            return "error"
        }
        var responseJSON = await response.json()
        var credentialCreationOptions = responseJSON.options
        var session = responseJSON.session
        
        log.log("Received CredentialCreationOptions", credentialCreationOptions)
        log.log("Session:", session)


        // Decode the fields that are B64Url encoded for transmission
        credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
        credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);

        // Decode each of the excluded credentials
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
        var response = await fetch(apiPrefix + '/register/finish/' + username + "?state=" + state, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'session_id': session
            },
            credentials: 'include',
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


async function loginUser(username, state) {

    try {

        // Get from the server the CredentialRequestOptions
        var response = await fetch(apiPrefix + '/login/begin/' + username + "?state=" + state, {credentials:'include'})
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
            
            var response = await fetch(apiPrefix + '/login/finish/' + username + "?state=" + state, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'session_id': session
                },
                credentials: 'include',
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
