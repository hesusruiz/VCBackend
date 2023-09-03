import { log } from '../log'
import { html, render } from 'uhtml'

var apiPrefix = "/webauthn"

window.MHR.register("AuthInit", class AuthInit extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(pageData) {

        let msg = ""
        let msgType = ""
        console.log(pageData)
        if (pageData) {
            if (pageData.msg) {
                msg = T(pageData.msg)
            }
            if (pageData.type) {
                msgType = pageData.type
            }    
        }

        // check whether current browser supports WebAuthn
        if (!window.PublicKeyCredential) {
            this.render(window.MHR.ErrorPanel("Error", "This browser does not support WebAuthn"))
            return
        }

/*         // We require platform authenticator (integrated with the device)
        let available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        if (!available) {
            console.log("WebAuthn supported, Platform Authenticator *not* supported.");
            this.render(window.MHR.ErrorPanel("Error", "This browser does not support WebAuthn Platform Authenticator"))
            return      
        }
 */
        let theHtml = html`
<div class="w3-container w3-padding-48">
    <div class="w3-card-4 w3-half-centered">

        <div class="w3-container w3-margin-bottom color-primary">
        <h4>Login</h4>
        </div>
        
        <form class="w3-container">
        <label>Email</label>
        <input class="w3-input w3-border w3-margin-bottom" type="text" name="username" id="email" placeholder="i.e. foo@bar.com">

        <div id="errormessage" class="w3-container color-error">
        </div>
        <div id="normalmessage" class="w3-container">
        </div>
        <div id="successmessage" class="w3-container color-success">
        </div>

        </form>

        <div class="w3-container w3-padding-16">
            <btn-primary style="width:45%" onclick="registerUser()">Register</btn-primary>
            <btn-primary class="w3-right" style="width:45%" onclick=${() => loginUser(pageData)}>Login</btn-primary>
        </div>

    </div>
</div>
`;

        this.render(theHtml)
        hideMessages()

    }


})



async function registerUser() {

    try {

        hideMessages()

        var username = document.querySelector('#email').value
        if (username === "") {
            errorMessage("Please enter a username")
            return;
        }

        // Get from the server the CredentialCreationOptions
        var response = await fetch(apiPrefix + '/register/begin/' + username, {credentials:'include'})
        if (!response.ok) {
            var errorText = await response.text()
            console.log(errorText)
            throw new Error(errorText);
        }
        var responseJSON = await response.json()
        var credentialCreationOptions = responseJSON.options
        var session = responseJSON.session
        
        console.log("Received CredentialCreationOptions", credentialCreationOptions)
        console.log("Session:", session)


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
        try {
            var credential = await navigator.credentials.create({
                publicKey: credentialCreationOptions.publicKey
            })
        } catch (error) {
            // InvalidStateError
            errorMessage(error.message)
            console.log(error)
            return
        }
        console.log("Authenticator created Credential", credential)

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
        var response = await fetch(apiPrefix + '/register/finish/' + username, {
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
            console.log(errorText)
            throw new Error(errorText);
        }
        successMessage("successfully registered " + username)


    } catch (error) {
        errorMessage(error.message)
        return
    }

}


async function loginUser(pageData) {

    try {

        hideMessages()

        var username = document.querySelector('#email').value
        if (username === "") {
            errorMessage("Please enter a username")
            return;
        }

        // Get from the server the CredentialRequestOptions
        var response = await fetch(apiPrefix + '/login/begin/' + username, {credentials:'include'})
        if (!response.ok) {
            if (response.status === 404) {
                errorMessage("Ha sido un 404")
                return
            }
            var errorText = await response.text()
            console.log(errorText)
            throw new Error(errorText);
        }
        var responseJSON = await response.json()
        var credentialRequestOptions = responseJSON.options
        var session = responseJSON.session

        console.log("Received CredentialRequestOptions", credentialRequestOptions)

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
        } catch (error) {
            // InvalidStateError
            errorMessage(error.message)
            console.log(error)
            return
        }
        console.log("Authenticator created Assertion", assertion)

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

        var wholeData = {
            response: data,
            session: session
        }

        // Perform a POST to the server
        var response = await fetch(apiPrefix + '/login/finish/' + username, {
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
            console.log(errorText)
            throw new Error(errorText);
        }
        successMessage("successfully logged in " + username)
        if (pageData.returnTo)
        window.MHR.gotoPage(pageData.returnTo)


    } catch (error) {
        errorMessage(error.message)
        return
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

async function getCredentialList(backEndpoint) {
    backEndpoint = "http://127.0.0.1:8080/api/allcredentials"

    try {
        let response = await fetch(backEndpoint)
        var cards = await response.json()
    } catch (error) {
        log.error(error)
        return null
    }

    return cards

}

function normalMessage(text) {
    document.querySelector('#normalmessage').innerHTML = text
}
function errorMessage(text) {
    document.querySelector('#errormessage').innerHTML = text
}
function successMessage(text) {
    document.querySelector('#successmessage').innerHTML = text
}
function hideMessages() {
    document.querySelector('#normalmessage').innerHTML = ""
    document.querySelector('#errormessage').innerHTML = ""
    document.querySelector('#successmessage').innerHTML = ""
}

function prueba() {
    var mainElem = document.querySelector('main')
    if (mainElem) {
        var theHtml = html`<p>Hola</p>`
        render(mainElem, theHtml)
    }    
}


window.registerUser = registerUser
window.loginUser = loginUser
window.prueba = prueba