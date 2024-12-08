import { Base64 } from 'js-base64';

import { decodeJWT } from '../components/jwt'
import { renderAnyCredentialCard } from '../components/renderAnyCredential';

// @ts-ignore
const MHR = window.MHR

// Copy some globals to make code less verbose
let gotoPage = MHR.gotoPage
let goHome = MHR.goHome
let storage = MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = MHR.html
let debug = MHR.debug

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

        if (debug) {
            alert("SelectCredential")
        }

        mylog("Inside SIOPSelectCredential:", openIdUrl)
        if (openIdUrl == null) {
            myerror("No URL has been specified")
            this.showError("Error", "No URL has been specified")
            return
        }

        // check whether current browser supports WebAuthn
        if (window.PublicKeyCredential) {
            console.log("WebAuthn is supported")
            this.WebAuthnSupported = true

            // Check for PlatformAuthenticator
            let available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
            if (available) {
                this.PlatformAuthenticatorSupported = true
            }
        } else {
            console.log("WebAuthn NOT supported")
        }

        // Derive from the received URL a simple one ready for parsing
        openIdUrl = openIdUrl.replace("openid4vp://?", "https://wallet.mycredential.eu/?")


        // Convert the input string to a URL object
        const inputURL = new URL(openIdUrl)
        if (debug) {
            alert(inputURL)
        }

        // The URL can have two formats:
        // 1. An OpenId url with an Authentication Request object specified in the query parameters
        // 2. A url specifying a reference to an Authentication Request object, using 'request_uri'
        //
        // We detect which one is it by looking at the query parameters:
        // 1. If 'request_uri' is in the url, then the AR is by reference, and the object can be retrieved
        //    by fetching the object.
        // 2. Otherwise, the AR object is in the url. We do not support this.

        // Get the relevant parameters from the query string
        const params = new URLSearchParams(inputURL.search)

        // The request_uri will be used to retrieve the AR from the Verifier
        var request_uri = params.get("request_uri")
        if (!request_uri) {
            gotoPage("ErrorPage", {
                title: "Error",
                msg: "'request_uri' parameter not found in URL"
            });
            return
        }

        // It is URLEncoded
        request_uri = decodeURIComponent(request_uri)

        if (debug) {
            alert(request_uri)
        }

        // Retrieve the AR from the Verifier
        // const authRequestJWT = await getAuthRequestDelegated(request_uri)
        const authRequestJWT = await getAuthRequest(request_uri)
        if (!authRequestJWT) {
            mylog("authRequest is null, aborting")
            return
        }
        if (authRequestJWT == "error") {
            alert("checking error after getAuthRequestDelegated")
            this.showError("Error", "Error fetching Authorization Request")
            return
        }
        console.log(authRequestJWT)

        if (debug) {
            await this.displayAR(authRequestJWT)
        } else {
            await this.displayCredentials(authRequestJWT)
        }
        return

    }

    async displayAR(authRequestJWT) {

        // openIdUrl is the url for a SIOP/OpenID4VP Authentication Request
        let html = this.html

        // The AR is in the payload of the received JWT
        const authRequest = decodeJWT(authRequestJWT)
        mylog("Decoded authRequest", authRequest)
        var ar = authRequest.body

        let theHtml = html`
        <div class="margin-small text-small">
            <p><b>client_id: </b>${ar.client_id}</p>
            <p><b>client_id_scheme: </b>${ar.client_id_schemne}</p>
            <p><b>response_uri: </b>${ar.response_uri}</p>
            <p><b>response_type: </b>${ar.response_type}</p>
            <p><b>response_mode: </b>${ar.response_mode}</p>
            <p><b>nonce: </b>${ar.nonce}</p>
            <p><b>state: </b>${ar.state}</p>
            <p><b>scope: </b>${ar.scope}</p>

            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => this.displayCredentials(authRequestJWT)}>Continue
                </ion-button>
            </div>

        </div>
        `
        this.render(theHtml)

    }

    async displayCredentials(authRequestJWT) {

        // The AR is in the payload of the received JWT
        const authRequest = decodeJWT(authRequestJWT)
        mylog("Decoded authRequest", authRequest)
        var ar = authRequest.body

        // response_uri is the endpoint where we have to send the Authentication Response
        // We are going to extract the RP identity from that URL
        var rpURL = new URL(ar.response_uri)
        mylog("rpURL", rpURL)
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

        // We use scope to ask for a specific type of credential, using a hierarchical dotted path
        // Get the last segment of the credential type in 'scope'
        const scopeParts = ar.scope.split(".")
        if (scopeParts.length == 0) {
            myerror("Invalid scope specified")
            this.showError("Error", "Invalid scope specified")
            return
        }
        const displayCredType = scopeParts[scopeParts.length - 1]

        // Select all credentials of the requested type
        var credentials = []
        for (const cc of credStructs) {
            // The credential is of type vc_jwt. The actual credential is in the vc object.
            // TODO: change generation of the JWT format to use the 'vc' claim for the credential
            // For the moment we are assuming the VC is the main payload of the JWT
            // const vc = cc.decoded.vc
            const vc = cc.decoded
            mylog(vc)

            // The type array of the VC
            const vctype = vc.type
            mylog("vctype:", vctype)

            // The credential type requested by the Verifier must be in the type array of the VC
            if (vctype.includes(displayCredType)) {
                mylog("adding credential")
                credentials.push(vc)
            }
        }

        // Error message if no credentials satisfy the condition 
        if (credentials.length == 0) {
            var msg = html`
                <p><b>${rpDomain}</b> has requested a Verifiable Credential of type ${displayCredType},
                but you do not have any credential of that type.</p>
                <p>Please go to an Issuer to obtain one.</p>
            `
            this.showError("Error", msg)
            return
        }

        let theHtml = html`
            <ion-card color="warning">
                    
                <ion-card-content>
                <div style="line-height:1.2"><b>${rpDomain}</b> <span class="text-small">has requested a Verifiable Credential of type ${displayCredType}.</span></div>
                </ion-card-content>
                
            </ion-card>

            ${credentials.map(cred => html`${vcToHtml(cred, ar.response_uri, ar.state, this.WebAuthnSupported)}`)}
        `
        this.render(theHtml)

    }

})

const bodyEncoded = 'vp_token=eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJob2xkZXIiOiJkaWQ6bXk6d2FsbGV0IiwidHlwZSI6WyJWZXJpZmlhYmxlUHJlc2VudGF0aW9uIl0sInZlcmlmaWFibGVDcmVkZW50aWFsIjpbeyJpZCI6IjBmYWM4ZWVmLTI2NjUtNDgxNS05NGI0LTRiYzNjMjgwOTIyNCIsInR5cGUiOlsiVmVyaWZpYWJsZUNyZWRlbnRpYWwiLCJMRUFSQ3JlZGVudGlhbEVtcGxveWVlIl0sImNyZWRlbnRpYWxTdWJqZWN0Ijp7Im1hbmRhdGUiOnsiaWQiOiI4N2FlYTY5NS04M2JhLTQ2MTktYmEzYS1iM2Q1NDFkOWMxMDYiLCJsaWZlX3NwYW4iOnsiZW5kX2RhdGVfdGltZSI6IjIwMjUtMDQtMDIgMDkyMzoyMi42MzczNDUxMjIgKzAwMDAgVVRDIiwic3RhcnRfZGF0ZV90aW1lIjoiMjAyNC0wNC0wMiAwOToyMzoyMi42MzczNDUxMjIgKzAwMDAgVVRDIn0sIm1hbmRhdGVlIjp7ImlkIjoiZGlkOmtleTp6RG5hZWZ4a1hNRlNxaXRUV2dyVjVEOUhtd2ZMZTJzQjZXcWVudzJGZWRVNVRGMVE1IiwiZW1haWwiOiJqZXN1cy5ydWl6QGluMi5lcyIsImZpcnN0X25hbWUiOiJKZXN1cyIsImdlbmRlciI6Ik0iLCJsYXN0X25hbWUiOiJSdWl6IiwibW9iaWxlX3Bob25lIjoiKzM0Njc2NDc3MTA0In0sIm1hbmRhdG9yIjp7ImNvbW1vbk5hbWUiOiJSVUlaIEpFU1VTIC0gODc2NTQzMjFLIiwiY291bnRyeSI6IkVTIiwiZW1haWxBZGRyZXNzIjoiamVzdXMucnVpekBpbjIuZXMiLCJvcmdhbml6YXRpb24iOiJJTjIsIEluZ2VuaWVyw61hIGRlIGxhIEluZm9ybWFjacOzbiwgUy5MLiIsIm9yZ2FuaXphdGlvbklkZW50aWZpZXIiOiJWQVRFUy1CNjA2NDU5MDAiLCJzZXJpYWxOdW1iZXIiOiJJRENFUy04NzY1NDMyMUsifSwicG93ZXIiOlt7ImlkIjoiNmI4ZjMxMzctYTU3YS00NmE1LTk3ZTctMTExN2EyMDE0MmZiIiwidG1mX2FjdGlvbiI6IkV4ZWN1dGUiLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6Ik9uYm9hcmRpbmciLCJ0bWZfdHlwZSI6IkRvbWFpbiJ9LHsiaWQiOiJhZDliMTUwOS02MGVhLTQ3ZDQtOTg3OC0xOGI1ODFkOGUxOWIiLCJ0bWZfYWN0aW9uIjpbIkNyZWF0ZSIsIlVwZGF0ZSJdLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6IlByb2R1Y3RPZmZlcmluZyIsInRtZl90eXBlIjoiRG9tYWluIn1dLCJzaWduZXIiOnsiY29tbW9uTmFtZSI6IklOMiIsImNvdW50cnkiOiJFUyIsImVtYWlsQWRkcmVzcyI6InJyaGhAaW4yLmVzIiwib3JnYW5pemF0aW9uIjoiSU4yLCBJbmdlbmllcsOtYSBkZSBsYSBJbmZvcm1hY2nDs24sIFMuTC4iLCJvcmdhbml6YXRpb25JZGVudGlmaWVyIjoiVkFURVMtQjYwNjQ1OTAwIiwic2VyaWFsTnVtYmVyIjoiQjYwNjQ1OTAwIn19fSwiZXhwaXJhdGlvbkRhdGUiOiIyMDI1LTA0LTAyIDA5OjIzOjIyLjYzNzM0NTEyMiArMDAwMCBVVEMiLCJpc3N1YW5jZURhdGUiOiIyMDI0LTA0LTAyIDA5OjIzOjIyLjYzNzM0NTEyMiArMDAwMCBVVEMiLCJpc3N1ZXIiOiJkaWQ6d2ViOmluMi5lcyIsInZhbGlkRnJvbSI6IjIwMjQtMDQtMDIgMDk6MjM6MjIuNjM3MzQ1MTIyICswMDAwIFVUQyJ9XX0'

const in2CredSerialised = `{"credentialSubject":{"mandate":{"id":"87aea695-83ba-4619-ba3a-b3d541d9c106","life_span":{"end_date_time":"2025-04-02 0923:22.637345122 +0000 UTC","start_date_time":"2024-04-02 09:23:22.637345122 +0000 UTC"},"mandatee":{"email":"jesus.ruiz@in2.es","first_name":"Jesus","gender":"M","id":"did:key:zDnaefxkXMFSqitTWgrV5D9HmwfLe2sB6Wqenw2FedU5TF1Q5","last_name":"Ruiz","mobile_phone":"+34676477104"},"mandator":{"commonName":"RUIZ JESUS - 87654321K","country":"ES","emailAddress":"jesus.ruiz@in2.es","organization":"IN2, Ingeniería de la Información, S.L.","organizationIdentifier":"VATES-B60645900","serialNumber":"IDCES-87654321K"},"power":[{"id":"6b8f3137-a57a-46a5-97e7-1117a20142fb","tmf_action":"Execute","tmf_domain":"DOME","tmf_function":"Onboarding","tmf_type":"Domain"},{"id":"ad9b1509-60ea-47d4-9878-18b581d8e19b","tmf_action":["Create","Update"],"tmf_domain":"DOME","tmf_function":"ProductOffering","tmf_type":"Domain"}],"signer":{"commonName":"IN2","country":"ES","emailAddress":"rrhh@in2.es","organization":"IN2, Ingeniería de la Información, S.L.","organizationIdentifier":"VATES-B60645900","serialNumber":"B60645900"}}},"expirationDate":"2025-04-02 09:23:22.637345122 +0000 UTC","id":"0fac8eef-2665-4815-94b4-4bc3c2809224","issuanceDate":"2024-04-02 09:23:22.637345122 +0000 UTC","issuer":"did:web:in2.es","type":["VerifiableCredential","LEARCredentialEmployee"],"validFrom":"2024-04-02 09:23:22.637345122 +0000 UTC"}`

var in2Credential = {
    "id": "urn:entities:credential:0fac8eef-2665-4815-94b4-4bc3c2809224",
    "type": [
        "LEARCredentialEmployee",
        "VerifiableCredential"
    ],
    "status": "VALID",
    "available_formats": [
        "json_vc",
        "jwt_vc"
    ],
    "credentialSubject": {
        "mandate": {
            "id": "87aea695-83ba-4619-ba3a-b3d541d9c106",
            "life_span": {
                "end_date_time": "2025-04-02 0923:22.637345122 +0000 UTC",
                "start_date_time": "2024-04-02 09:23:22.637345122 +0000 UTC"
            },
            "mandatee": {
                "id": "did:key:zDnaefxkXMFSqitTWgrV5D9HmwfLe2sB6Wqenw2FedU5TF1Q5",
                "email": "jesus.ruiz@in2.es",
                "first_name": "Jesus",
                "gender": "M",
                "last_name": "Ruiz",
                "mobile_phone": "+34676477104"
            },
            "mandator": {
                "commonName": "RUIZ JESUS - 87654321K",
                "country": "ES",
                "emailAddress": "jesus.ruiz@in2.es",
                "organization": "IN2, Ingeniería de la Información, S.L.",
                "organizationIdentifier": "VATES-B60645900",
                "serialNumber": "IDCES-87654321K"
            },
            "power": [
                {
                    "id": "6b8f3137-a57a-46a5-97e7-1117a20142fb",
                    "tmf_action": "Execute",
                    "tmf_domain": "DOME",
                    "tmf_function": "Onboarding",
                    "tmf_type": "Domain"
                },
                {
                    "id": "ad9b1509-60ea-47d4-9878-18b581d8e19b",
                    "tmf_action": [
                        "Create",
                        "Update"
                    ],
                    "tmf_domain": "DOME",
                    "tmf_function": "ProductOffering",
                    "tmf_type": "Domain"
                }
            ],
            "signer": {
                "commonName": "IN2",
                "country": "ES",
                "emailAddress": "rrhh@in2.es",
                "organization": "IN2, Ingeniería de la Información, S.L.",
                "organizationIdentifier": "VATES-B60645900",
                "serialNumber": "B60645900"
            }
        }
    },
    "expirationDate": "2025-04-02T09:23:22Z"
}



// Render the credential with buttons so the user can select it for authentication
function vcToHtml(vc, response_uri, state, webAuthnSupported) {

    // TODO: retrieve the holder and its private key from DB
    // Get the holder that will present the credential
    // We get this from the credential subject
    mylog("in VCToHTML")
    mylog(vc)
    const holder = vc.credentialSubject.id

    // A Verifiable Presentation can send more than one credential. We only send one.
    var credentials = [vc]

    // Each credential has a button to allow the user to send it to the Verifier
    const div = html`
    <ion-card>
        ${renderAnyCredentialCard(vc)}

        <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => MHR.cleanReload()}>
                <ion-icon slot="start" name="chevron-back"></ion-icon>
                ${T("Cancel")}
            </ion-button>

            <ion-button @click=${(e) => sendAuthenticationResponseOld(e, holder, response_uri, credentials, state, webAuthnSupported)}>
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

    const endpointURL = new URL(backEndpoint)
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

    // Encode as a form to send in the post
    var formBody = [];
    for (var property in formAttributes) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(formAttributes[property]);
        formBody.push(encodedKey + "=" + encodedValue);
    }

    formBody = formBody.join("&");
    mylog("The body: " + formBody)

    postDelegatedRequest(backEndpoint + "?state=" + state, formBody)

    // // Send the Authentication Response
    // try {
    //     let response = await fetch(backEndpoint + "?state=" + state, {
    //         method: "POST",
    //         mode: "cors",
    //         cache: "no-cache",
    //         headers: {
    //             'Content-Type': 'application/x-www-form-urlencoded',
    //         },
    //         body: formBody,
    //     })

    //     if (response.status == 200) {
    //         const res = await response.json()
    //         mylog(res)

    //         // Check if the server requires the authenticator to be used
    //         if (res.authenticatorRequired == "yes") {

    //             if (!authSupported) {
    //                 gotoPage("ErrorPage", {
    //                     title: "Error",
    //                     msg: "Authenticator not supported in this device"
    //                 });
    //                 return
    //             }

    //             res["origin"] = origin
    //             res["state"] = state

    //             mylog("Authenticator required")
    //             // The credential has been sent
    //             gotoPage("AuthenticatorPage", res);
    //             return
    //         } else {
    //             gotoPage("AuthenticatorSuccessPage")
    //             return
    //         }
    //     }

    //     // There was an error, present it
    //     myerror("error sending credential", response.status)
    //     const res = await response.text()
    //     mylog("response:", res)

    //     gotoPage("ErrorPage", {
    //         title: "Error",
    //         msg: "Error sending the credential"
    //     });
    //     return

    // } catch (error) {
    //     // There was an error, present it
    //     myerror(error)
    //     gotoPage("ErrorPage", {
    //         title: "Error",
    //         msg: "Error sending the credential"
    //     });
    //     return
    // }
}

// sendAuthenticationResponse prepares an Authentication Response and sends it to the server as specified in the endpoint
async function sendAuthenticationResponseOld(e, holder, backEndpoint, credentials, state, authSupported) {
    e.preventDefault();

    const endpointURL = new URL(backEndpoint)
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

        if (response.status == 200) {
            const res = await response.json()
            mylog(res)

            // Check if the server requires the authenticator to be used
            if (res.authenticatorRequired == "yes") {

                if (!authSupported) {
                    gotoPage("ErrorPage", {
                        title: "Error",
                        msg: "Authenticator not supported in this device"
                    });
                    return
                }

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

    try {
        if (debug) {
            alert("fetching " + uri)
        }
        var response = await fetch(uri,
            {
                // mode: "cors"
            })
        if (!response.ok) {
            var errorText = await response.text()
            alert(errorText)
            mylog(errorText)
            return "error"
        }
        var responseText = await response.text()
        return responseText

    } catch (error) {
        // There was an error, present it
        alert(error)
        gotoPage("ErrorPage", {
            title: "Error",
            msg: error
        });
        return
    }
}

async function getAuthRequestDelegated(uri) {

    var theBody = {
        method: "GET",
        url: uri
    }
    theBody = JSON.stringify(theBody)
    mylog(theBody)

    let response = await fetch("https://verifier.mycredential.eu/reqonbehalf", {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json',
        },
        body: theBody,
    })

    if (response.status != 200) {
        // There was an error, present it
        throw Error("Arrojado error sending request on behalf (" + response.status + ")")
    }

    const res = await response.text()
    mylog(res)
    return res

}

async function postDelegatedRequest(uri, body) {

    var theBody = {
        method: "POST",
        url: uri,
        body: body
    }

    let response = await fetch("https://verifier.mycredential.eu/reqonbehalf", {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json',
        },
        body: body,
    })

    if (response.status != 200) {
        // There was an error, present it
        throw Error("Arrojado error sending request on behalf (" + response.status + ")")
    }

    const res = await response.text()
    mylog(res)
    return res

}
