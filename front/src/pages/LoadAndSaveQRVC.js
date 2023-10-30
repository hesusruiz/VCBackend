import { credentialsSave } from '../components/db';
import { decodeJWT } from '../components/jwt';

import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'
import { log } from '../log';

// Setup some local variables for convenience
let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let html = window.MHR.html
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog

const PRE_AUTHORIZED_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

window.MHR.register("LoadAndSaveQRVC", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(qrData) {
        let html = this.html
        log.log("LoadAndSaveQRVC received:", qrData)

        // We should have received a URL that was scanned as a QR code or as a redirection
        // Perform some sanity checks on the parameter
        if (qrData == null || !qrData.startsWith) {
            console.log("The scanned QR does not contain a valid URL")
            gotoPage("ErrorPage", { "title": "No data received", "msg": "The scanned QR does not contain a valid URL" })
            return
        }

        // Make sure it is a fully qualified URL
        if (!qrData.startsWith("https://") && !qrData.startsWith("http://")) {
            console.log("The scanned QR does not contain a valid URL")
            gotoPage("ErrorPage", { "title": "No data received", "msg": "The scanned QR does not contain a valid URL" })
            return
        }

        if (qrData.includes("state=") && qrData.includes("auth-mock")) {
            gotoPage("EBSIRedirect", qrData)
            return
        }

        if (qrData.includes("code=")) {
            gotoPage("EBSIRedirectCode", qrData)
            return
        }
        

        // The QR points to an an OpenIDVCI credential issuance offer
        if (qrData.includes("credential_offer_uri=")) {

            // Retrieve the credential offer from the Issuer
            var credentialOffer = await getCredentialOffer(qrData);
            this.credentialOffer = credentialOffer
            await storage.settingsPut("credentialOffer", credentialOffer)
            console.log("credentialOffer", credentialOffer)

            // Get the credential_issuer url to retrieve its metadata
            const credential_issuer = credentialOffer["credential_issuer"]
            if (!credential_issuer) {
                let msg = "credential_issuer object not found in credentialOffer"
                myerror(msg)
                gotoPage("ErrorPage", { "title": "Invalid credentialOffer", "msg": msg })
                return
            }

            // Get the Issuer metadata from the well-known endpoint of the Issuer
            var issuerMetaData = await getIssuerMetadata(credential_issuer)
            this.issuerMetaData = issuerMetaData
            await storage.settingsPut("issuerMetaData", issuerMetaData)

            // Check that the credential endpoint url exists in the metadata
            var credentialEndpoint = issuerMetaData["credential_endpoint"]
            if (!credentialEndpoint) {
                let msg = "credentialEndpoint object not found in issuerMetaData"
                myerror(msg)
                gotoPage("ErrorPage", { "title": "Invalid issuerMetaData", "msg": msg })
                return
            }

            var authorizationServer = issuerMetaData["authorization_server"]
            if (!authorizationServer) {
                let msg = "authorizationServer object not found in issuerMetaData"
                myerror(msg)
                gotoPage("ErrorPage", { "title": "Invalid issuerMetaData", "msg": msg })
                return
            }

            // Get the AuthServer metadata from the well-known endpoint of the Authentication Server
            var authServerMetaData = await getAuthServerMetadata(authorizationServer)
            this.authServerMetaData = authServerMetaData
            await storage.settingsPut("authServerMetaData", authServerMetaData)

            // The grant object in the credential offer will determine the type of flow to execute
            const grants = credentialOffer["grants"]
            if (!grants) {
                let msg = "grants object not found in credentialOffer"
                myerror(msg)
                gotoPage("ErrorPage", { "title": "Invalid credentialOffer", "msg": msg })
                return
            }

            // Check the type of authorization flows supported by Issuer
            const authorization_code = grants["authorization_code"]
            if (authorization_code) {
                await this.renderAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData)
                return
            } else if (grants[PRE_AUTHORIZED_CODE_GRANT_TYPE]) {
                await this.startPreAuthorizedCodeFlow()
                return
            } else {
                let msg = "No authorization flow type found in grants"
                myerror(msg)
                gotoPage("ErrorPage", { "title": "Invalid grants", "msg": msg })
                return
            }

        } else {
            // This is a non-standard nechanism to issue credentials (easier in controlled environments).
            // We have received a URL that was scanned as a QR code.
            // First we should do a GET to the URL to retrieve the VC.
            this.VC = await getVerifiableCredentialLD(qrData);
            this.VCType = "DOME"
            this.renderedVC = this.renderEmployeeCredential(this.VC)
        }

        // Ask the user if we should store the VC
        let theHtml = html`
        <ion-card color="warning">
                
            <ion-card-content>
            <p><b>
            ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
            </b></p>
            </ion-card-content>
            
        </ion-card>

        ${this.renderedVC}
        `
        this.render(theHtml)
    }

    // startPreAuthorizedCodeFlow asks the user for the PIN (required) and then processes the flow
    async startPreAuthorizedCodeFlow() {

        let theHtml = html`
        <ion-card style="max-width:600px">
            <ion-card-content>
            <p>Enter the PIN shown in the EBSI screen.<b>
            <ion-input id="thepin" label="PIN" label-placement="stacked" type="number" placeholder="0000"></ion-input>
            </ion-card-content>
            
            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${async () => {
                    const ionpin = document.getElementById("thepin")
                    const nativepin = await ionpin.getInputElement()
                    const pin = nativepin.value
                    if (pin.length > 0) {this.renderPreAuthorizedCodeFlow(pin)}
                } }>
                ${T("Continue")}
                </ion-button>
            </div>

        </ion-card>
        `
        this.render(theHtml)

    }

    async renderPreAuthorizedCodeFlow(user_pin) {
        this.user_pin = user_pin
        const jwtCredential = await performPreAuthorizedCodeFlow(
            this.credentialOffer,
            this.issuerMetaData,
            this.authServerMetaData, user_pin)
        
        // Store in an instance variable
        this.VC = jwtCredential
        this.VCType = "EBSI"

        // Decode and render the credencial
        const decoded = decodeJWT(jwtCredential)
        this.renderedVC = this.renderEBSICredential(decoded)

        // Ask the user if we should store the VC
        let theHtml = html`
        <ion-card color="warning">
            <ion-card-content>
            <p><b>
            ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
            </b></p>
            </ion-card-content>
        </ion-card>

        ${this.renderedVC}
        `
        this.render(theHtml)

    }

    async renderAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {

        const jwtCredential = await performAuthCodeFlow(
            credentialOffer,
            issuerMetaData,
            authServerMetaData)
        
        // Store in an instance variable
        this.VC = jwtCredential
        this.VCType = "EBSI"

        // Decode and render the credencial
        const decoded = decodeJWT(jwtCredential)
        this.renderedVC = this.renderEBSICredential(decoded)

        // Ask the user if we should store the VC
        let theHtml = html`
        <ion-card color="warning">
            <ion-card-content>
            <p><b>
            ${T("You received a Verifiable Credential")}. ${T("You can save it in this device for easy access later, or cancel the operation.")}
            </b></p>
            </ion-card-content>
        </ion-card>

        ${this.renderedVC}
        `
        this.render(theHtml)

    }


    async saveVC() {
        console.log("Save VC " + this.VC)

        if (this.VCType == "EBSI") {
            const decodedJWT = decodeJWT(this.VC)
            const decoded = decodedJWT.body.vc

            var credStruct = {
                type: "EBSI",
                encoded: this.VC,
                decoded: decoded
            }
    
        } else {
            const decoded = JSON.parse(this.VC)

            var credStruct = {
                type: "w3cvc",
                encoded: this.VC,
                decoded: decoded
            }
    
        }
        
        var saved = await credentialsSave(credStruct)
        if (!saved) {
            return
        }

        // Reload the application with a clean URL
        location = window.location.origin + window.location.pathname
        return
    }

    cleanReload() {
        // Reload the application with a clean URL
        location = window.location.origin + window.location.pathname
        return
    }

    renderEBSICredential(vcdecoded) {

        const vc = vcdecoded.body.vc
        const vcTypeArray = vc["type"]
        const vcType = vcTypeArray[vcTypeArray.length -1]
    
        const div = html`
        <ion-card>
    
            <ion-card-header>
                <ion-card-title>${vcType}</ion-card-title>
                <ion-card-subtitle>EBSI</ion-card-subtitle>
            </ion-card-header>
    
            <ion-card-content class="ion-padding-bottom">
    
                <div>
                    <p>Issuer: ${vc.issuer}</p>
                </div>
    
            </ion-card-content>
    
            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => this.cleanReload()}>
                    <ion-icon slot="start" name="chevron-back"></ion-icon>
                    ${T("Do not save")}
                </ion-button>
    
                <ion-button @click=${() => this.saveVC()}>
                    <ion-icon slot="start" name="person-add"></ion-icon>
                    ${T("Save credential")}
                </ion-button>
            </div>
        </ion-card>
        `
        return div
    
    }
    
    renderEmployeeCredential(vcencoded) {
        let html = this.html

        const vc = JSON.parse(vcencoded)
        const vcs = vc.credentialSubject
        const pos = vcs.position
        var avatar = photo_man
        if (vcs.gender == "f") {
            avatar = photo_woman
        }

        const div = html`
        <ion-card>

            <ion-card-header>
                <ion-card-title>${vcs.name}</ion-card-title>
                <ion-card-subtitle>Employee</ion-card-subtitle>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">

                <ion-avatar>
                    <img alt="Avatar" src=${avatar} />
                </ion-avatar>

                <div>
                    <p>${pos.department}</p>
                    <p>${pos.secretariat}</p>
                    <p>${pos.directorate}</p>
                    <p>${pos.subdirectorate}</p>
                    <p>${pos.service}</p>
                    <p>${pos.section}</p>
                </div>

            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">
                <ion-button @click=${() => this.cleanReload()}>
                    <ion-icon slot="start" name="chevron-back"></ion-icon>
                    ${T("Do not save")}
                </ion-button>

                <ion-button @click=${() => this.saveVC()}>
                    <ion-icon slot="start" name="person-add"></ion-icon>
                    ${T("Save credential")}
                </ion-button>
            </div>
        </ion-card>
        `
        return div

    }

})


async function performAuthCodeFlow(credentialOffer, issuerMetaData, authServerMetaData) {

    // Get the credential supported by issuer
    const credentialTypes = credentialOffer.credentials[0].types

    // The state will be used by the issuer to match request/reply
    const issuer_state = credentialOffer["grants"]["authorization_code"]["issuer_state"]

    // This is the url of the Authorization Server
    const authorization_endpoint = authServerMetaData["authorization_endpoint"]

    // Get my DID
    const myDID = await window.MHR.storage.didFirst()

    // **************************************
    // **************************************
    // Step 1: GET Authorization Request
    // **************************************
    // **************************************
    console.log("Step 1: GET Authorization Request")

    // It has the following form:
    //
    // GET from https://api-conformance.ebsi.eu/conformance/v3/auth-mock/authorize
    // ?response_type=code
    // &scope=openid
    // &state=tracker%3Dvcfghhj
    // &client_id=did%3Akey%3Az2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbsEYvdrjxMjQ4tpnje9BDBTzuNDP3knn6qLZErzd4bJ5go2CChoPjd5GAH3zpFJP5fuwSk66U5Pq6EhF4nKnHzDnznEP8fX99nZGgwbAh1o7Gj1X52Tdhf7U4KTk66xsA5r
    // &authorization_details=%5B%7B%22type%22%3A%22openid_credential%22%2C%22format%22%3A%22jwt_vc%22%2C%22types%22%3A%5B%22VerifiableCredential%22%2C%22VerifiableAttestation%22%2C%22CTWalletInTime%22%5D%7D%5D
    // &redirect_uri=openid%3A
    // &nonce=glkFFoisdfEui43
    // &code_challenge=YjI0ZTQ4NTBhMzJmMmZhNjZkZDFkYzVhNzlhNGMyZDdjZDlkMTM4YTY4NjcyMTA5M2Q2OWQ3YjNjOGJlZDBlMSAgLQo%3D
    // &code_challenge_method=S256
    // &client_metadata=%7B%22vp_formats_supported%22%3A%7B%22jwt_vp%22%3A%7B%22alg%22%3A%5B%22ES256%22%5D%7D%2C%22jwt_vc%22%3A%7B%22alg%22%3A%5B%22ES256%22%5D%7D%7D%2C%22response_types_supported%22%3A%5B%22vp_token%22%2C%22id_token%22%5D%2C%22authorization_endpoint%22%3A%22openid%3A%22%7D

    // Calculate a code_challenge as BASE64URL-ENCODE(SHA256(code_verifier as UTF-8 string))
    // Where code_verifier is a secure random, which will be used with token endpoint.
    // It is between 43 and 128 characters long, and contains characters A-Z, a-z, 0-9, hyphen, period, underscore, and tilde.
    // See RFC 7636 for more information
    // TODO: should generate a random string
    const code_verifier = "this_is_a_code_verifierthis_is_a_code_verifierthis_is_a_code_verifier"
    const code_challenge = await hashFromString(code_verifier)
    console.log("code_challenge", code_challenge)

    // Specify what we are requesting
    var authorization_details = [
        {
            "type": "openid_credential",
            "format": "jwt_vc",
            "types": credentialTypes
        }
    ]

    // If the Credential Issuer metadata contains an authorization_server parameter,
    // the authorization detail's locations common data field MUST be set to the Credential Issuer Identifier value.
    var authorizationServer = issuerMetaData["authorization_server"]
    if (authorizationServer) {
        authorization_details[0]["locations"] = [
            issuerMetaData["credential_issuer"]
        ]
    }

    var client_metadata = {
        "vp_formats_supported":{
            "jwt_vp":{"alg":["ES256"]},
            "jwt_vc":{"alg":["ES256"]}
        },
        "response_types_supported":["vp_token","id_token"],
        "authorization_endpoint": window.location.origin
    }

    var formAttributes = {
        'response_type': 'code',
        'scope': 'openid',
        'issuer_state': issuer_state,
        'client_id': myDID.did,
        'authorization_details': JSON.stringify(authorization_details),
        'redirect_uri': window.location.origin,
        'nonce': 'thisisthenonce',
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'client_metadata': JSON.stringify(client_metadata),
    }
    var formBody = [];
    for (var property in formAttributes) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(formAttributes[property]);
        formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");

    // There will be an HTTP 302 Redirection after this
    // We will receive the url to invoke as a result from the POST
    console.log("AuthRequest", authorization_endpoint + "?" + formBody)
    let resp = await fetch(authorization_endpoint + "?" + formBody, {
        cache: "no-cache",
        mode: "cors"
    });

    // Throw an error if something went wrong
    if (!resp.ok || !resp.redirected) {
        throw new Error("error retrieving OpenID metadata")
    }

    var redirectedURL = resp.url

    // The redirected URL contains the authorization type in the response_type. The URL can be of two types:
    //
    // Type 1: with response_type=vp_token, the AuthServer is expecting a VP. The credentials requires are specified
    // in the presentation_definition parameter. This URL looks like:
    //
    // https://wallet.mycredential.eu/?
    // state=66685746-05f4-4d3d-896d-877ad0043115&
    // client_id=https://api-conformance.ebsi.eu/conformance/v3/auth-mock&
    // redirect_uri=https://api-conformance.ebsi.eu/conformance/v3/auth-mock/direct_post&
    // response_type=vp_token&
    // response_mode=direct_post&
    // scope=openid&
    // nonce=560bc48c-e597-41d5-ab10-066a25a3758d&
    // presentation_definition={....}&
    // request=eyJ0eXAiOiJKV1QiLCJhbGciOi
    //
    // Type 2: with response_type=id_token, the AuthServer is expecting an ID Token. No credentials are needed.
    // The URL looks like:
    //
    // https://wallet.mycredential.eu/?
    // state=e6379c7f-1919-41aa-8194-9767295e1896&
    // client_id=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock&
    // redirect_uri=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock%2Fdirect_post&
    // response_type=id_token&
    // response_mode=direct_post&
    // scope=openid&
    // nonce=a8612b8a-8e8b-461c-a21e-e4b09988fc87&
    // request_uri=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock%2Frequest_uri%2F3e3a4bb3-3b22-4b14-92bb-3e198658fbf5


    mylog(redirectedURL)
    var urlParams = new URL(redirectedURL).searchParams;

    const response_type = decodeURIComponent(urlParams.get('response_type'))
    if (response_type == "vp_token") {
        throw new Error("Response type vp_token not implemented yet")
    } else if (response_type == "id_token") {

    } else {
        throw new Error("Invalid response_type: " + response_type)
    }

    // **************************************
    // **************************************
    // Step 2: ID Token Request
    //
    // The authorization server requests an ID Token from the Wallet to authenticate the DID without any claims.
    // The request from the Auth Server comes in the redirected URL received as a response of the authorization request.
    // 
    // **************************************
    // **************************************
    console.log("Step 2: ID Token Request")

    const redirect_uri = decodeURIComponent(urlParams.get('redirect_uri'))
    console.log("redirect_uri", redirect_uri)
    const client_id = decodeURIComponent(urlParams.get('client_id'))
    const state = decodeURIComponent(urlParams.get('state'))
    var nonce = decodeURIComponent(urlParams.get('nonce'))

    // Generate the ID Token according to the request from the authorization server
    const signedstring = await generateEBSIIDToken(myDID.did, client_id, state, nonce)
    const IDToken = signedstring.signedString
    console.log("IDToken", IDToken)

    // **************************************
    // **************************************
    // Step 3: Send ID Token Response to Authorization Server
    //
    // The Wallet answers the ID Token Request by providing the id_token in the redirect_uri as instructed by response_mode
    // of direct_post. The id_token must be signed with the DID document's authentication key.
    // The state parameter is mandatory for the ID Token Response when it is present in the ID Token Request sent by
    // the Authorization Server. In such cases, the Wallet must ensure that the values of the state parameter are identical in both.
    // 
    // **************************************
    // **************************************
    console.log("Step 2: ID Token Request")

    var formAttributes = {
        id_token: IDToken,
        state: state,
    }

    formBody = [];
    for (var property in formAttributes) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(formAttributes[property]);
        formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");
    console.log("Body", formBody)

    // There will be an HTTP 302 Redirection after this
    // We will receive the url to invoke as a result from the POST
    resp = await fetch(redirect_uri, {
        method: "POST",
        redirect: "follow",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody,
        mode: "cors"
    });

    // Throw an error if something went wrong
    if (!resp.ok || !resp.redirected) {
        throw new Error(resp.statusText)
    }

    redirectedURL = resp.url

    // **************************************
    // **************************************
    // Step 4: Receive Authorization response
    //
    // The redirected URL contains the Authorization Response, with the authorization code. The url is something like:
    // https://wallet.mycredential.eu?code=530dfe71-845b-4310-acb6-06023a036ff5
    // 
    // **************************************
    // **************************************
    console.log("Step 4: Receive Authorization response")
    mylog(redirectedURL)
    var urlParams = new URL(redirectedURL).searchParams;

    // Get the authorization code from the URL
    const code = decodeURIComponent(urlParams.get('code'))
    console.log("code", code)

    // **************************************
    // **************************************
    // Step 5: Request Access Token from Authorization Server
    //
    // The Wallet (Relying Party) proceeds with the code flow by calling the Token Endpoint with the required details
    // and providing a code_verifier corresponding to the initial Authorisation Request code_challenge.
    // 
    // **************************************
    // **************************************
    console.log("Step 5: Request Access Token from Authorization Server")

    const tokenEndpoint = authServerMetaData.token_endpoint

    var formAttributes = {
        grant_type: "authorization_code",
        client_id: myDID.did,
        code: code,
        code_verifier: code_verifier
    }
    formBody = encodeFormAttributes(formAttributes)
    console.log(tokenEndpoint)
    console.log(formBody)

    // This request is a normal one and will not be redirected
    resp = await fetch(tokenEndpoint, {
        method: "POST",
        redirect: "follow",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody,
        mode: "cors"
    });

    if (!resp.ok) {
        throw new Error(resp.statusText)
    }

    // **************************************
    // **************************************
    // Step 6: Receive Access Token from Authorization Server
    //
    // The Access Token is delivered inside a response payload from a successful Token Endpoint initiation.
    // c_nonce (Challenge Nonce) must be stored until a new one is given. The response looks like:
    //
    // Content-Type: application/json
    // {
    //     "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp..sHQ",
    //     "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI4a5k..zEF",
    //     "token_type": "bearer",
    //     "expires_in": 86400,
    //     "id_token": "eyJodHRwOi8vbWF0dHIvdGVuYW50L..3Mz",
    //     "c_nonce": "PAPPf3h9lexTv3WYHZx8ajTe",
    //     "c_nonce_expires_in": 86400
    // }
    // **************************************
    // **************************************
    console.log("Step 6: Receive Access Token from Authorization Server")

    const authTokenObject = await resp.json()
    console.log("Auth Token object:", authTokenObject)

    // Get the nonce and access token from the retrieved object
    var nonce = authTokenObject.c_nonce
    const access_token = authTokenObject.access_token

    // **************************************
    // **************************************
    // Step 7: Send a Credential Request
    //
    // At this point, the Wallet has successfully obtained a valid Access Token, which can be used to gain access to
    // the Credential's Issuer.
    // The Relying Party proceeds by requesting issuance of the Verifiable Credential from the Issuer Mock.
    // The requested Credential must match the granted access. The DID document's authentication key must be used
    // for signing the JWT proof, where the DID must also match the one used for authentication.
    //
    // **************************************
    // **************************************
    console.log("Step 7: Send a Credential Request")

    // Get the proof object that we have to include in the Credential Request
    const proofObject = await generateEBSIProof(myDID.did, issuerMetaData.credential_issuer, nonce)
    const proof = proofObject.signedString

    // Get the credential from EBSI
    var credentialResponse = await requestEBSICredential(proof, access_token, issuerMetaData.credential_endpoint, credentialTypes)

    var acceptance_token = credentialResponse["acceptance_token"]
    const max_iterations = 10
    var iterations = 0

    while (acceptance_token && iterations < max_iterations) {
        
        console.log("Waiting for credential ...")
        await delay(1000)
        console.log("Finished waiting for credential")

        // Get the credential from EBSI
        
        var credentialResponse = await requestDeferredEBSICredential(acceptance_token, issuerMetaData["deferred_credential_endpoint"])
        var acceptance_token = credentialResponse["acceptance_token"]
    }


    // **************************************
    // **************************************
    // Step 8: Receive the credential
    //
    // After a successful request, the response payload will contain the requested credential. It looks like:
    //
    // Content-Type: application/json
    // {
    //   "format": "jwt_vc",
    //   "credential": "eyJ0eXAiOiJKV1QiLCJhbGciOi...Y5kwU_qJzvBWEVsBP8QvRlLvcWJDwyyGJF0YluuK2Cog",
    // }
    //
    // **************************************
    // **************************************
    console.log("Step 8: Receive the credential")

    return credentialResponse.credential


}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function performPreAuthorizedCodeFlow(credentialOffer, issuerMetaData, authServerMetaData, user_pin) {
    console.log("credentialOffer")
    console.log(credentialOffer)

    console.log("issuerMetaData")
    console.log(issuerMetaData)

    console.log("authServerMetaData")
    console.log(authServerMetaData)

    // Get the credential supported by issuer
    const credentialTypes = credentialOffer.credentials[0].types

    // Get an accesstoken for retrieving the credential
    const tokenEndpoint = authServerMetaData["token_endpoint"]
    const code = credentialOffer["grants"][PRE_AUTHORIZED_CODE_GRANT_TYPE]["pre-authorized_code"]
    const authTokenObject = await getPreAuthToken(tokenEndpoint, code, user_pin)

    // Get the nonce and access token from the retrieved object
    const nonce = authTokenObject.c_nonce
    const access_token = authTokenObject.access_token

    // Get my DID
    const myDID = await window.MHR.storage.didFirst()

    // Get the proof object that we have to include in the Credential Request
    const proofObject = await generateEBSIProof(myDID.did, issuerMetaData.credential_issuer, nonce)
    const proof = proofObject.signedString

    // Get the credential from EBSI
    const credentialResponse = await requestEBSICredential(proof, access_token, issuerMetaData.credential_endpoint, credentialTypes)

   return credentialResponse.credential
}

async function getPreAuthToken(tokenEndpoint, preAuthCode, user_pin) {
    try {
        var formAttributes = {
            'grant_type': PRE_AUTHORIZED_CODE_GRANT_TYPE,
            'user_pin': user_pin,
            'pre-authorized_code': preAuthCode
        }
        var formBody = [];
        for (var property in formAttributes) {
            var encodedKey = encodeURIComponent(property);
            var encodedValue = encodeURIComponent(formAttributes[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        formBody = formBody.join("&");
        console.log("The body: " + formBody)

        let response = await fetch(tokenEndpoint, {
            method: "POST",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody,
            mode: "cors"
        });
        if (response.ok) {
            var tokenBody = await response.json();
        } else {
            if (response.status == 403) {
                alert("error 403");
                window.MHR.goHome();
                return "Error 403";
            }
            var error = await response.text();
            myerror(error);
            window.MHR.goHome();
            alert(error);
            return null;
        }
    } catch (error2) {
        myerror(error2);
        alert(error2);
        return null;
    }
    console.log(tokenBody);
    return tokenBody;
}

async function generateEBSIProof(subjectDID, issuerID, nonce) {

    const keyStr = subjectDID.replace("did:key:", "")
    const subjectKid = subjectDID + "#" + keyStr

    // Create the request proof for authenticating this request
    var jwtHeaders = {
        typ: 'openid4vci-proof+jwt',
        alg: 'ES256',
        kid: subjectKid
    }
    const encodedHeaders = JSON.stringify(jwtHeaders)

    const iat = Math.floor(Date.now()/1000) - 2
    const exp = iat + 86500

    var jwtPayload = {
        iss: subjectDID,
        aud: issuerID,
        iat: iat,
        exp: exp,
        nonce: nonce
    }
    const encodedPayload = JSON.stringify(jwtPayload)

    // Build the string to be signed
    // const stringToSign = `${encodedHeaders}.${encodedPayload}`

    var requestBody = {
        subjectDID: subjectDID,
        headers: encodedHeaders,
        payload: encodedPayload
    }
    const body = JSON.stringify(requestBody)
    mylog("generateEBSICredentialRequest")
    mylog(body)

    // Sign the token in the server with the associated private key
    let response = await fetch("/signtoken", {
        method: "POST",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json'
        },
        body: body,
        mode: "cors"
    });
    if (response.ok) {
        // The reply is the complete JWT
        const jwt = await response.json();
        mylog(jwt)
        return jwt
    } else {
        throw new Error(response.statusText)
    }

}


async function requestEBSICredential(proof, accessToken, credentialEndpoint, credentialTypes) {

    var credentialReq = {
        types: credentialTypes,
        format: 'jwt_vc',
        proof: {
            proof_type: 'jwt',
            jwt: proof
        }
    }

    console.log("Body " + JSON.stringify(credentialReq))
    let response = await fetch(credentialEndpoint, {
        method: "POST",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(credentialReq),
        mode: "cors"
    });


    if (response.ok) {
        // The reply is the complete JWT
        const credentialResponse = await response.json();
        mylog(credentialResponse)
        return credentialResponse
    } else {
        throw new Error(response.statusText)
    }

}


async function requestDeferredEBSICredential(acceptance_token, deferredCredentialEndpoint) {

    let response = await fetch(deferredCredentialEndpoint, {
        method: "POST",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + acceptance_token
        },
        mode: "cors"
    });

    if (response.ok) {
        // The reply is the complete JWT
        const credentialResponse = await response.json();
        mylog(credentialResponse)
        return credentialResponse
    } else {
        throw new Error(response.statusText)
    }

}



async function getCredentialOIDC4VCI(credentialEndpoint, accessToken, format, credential_type) {
    try {
        var credentialReq = {
            format: format,
            types: credential_type
        }
        console.log("Body " + JSON.stringify(credentialReq))
        let response = await fetch(credentialEndpoint, {
            method: "POST",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify(credentialReq),
            mode: "cors"
        });
        if (response.ok) {
            var credentialBody = await response.json();
        } else {
            if (response.status == 403) {
                alert.apply("error 403");
                window.MHR.goHome();
                return "Error 403";
            }
            var error = await response.text();
            myerror(error);
            window.MHR.goHome();
            alert(error);
            return null;
        }
    } catch (error2) {
        myerror(error2);
        alert(error2);
        return null;
    }
    console.log(credentialBody);
    return credentialBody;
}


// getIssuerOpenIdConfig retrieves the OpenID metadata for an Issuer
async function getIssuerMetadata(issuerAddress) {
    mylog("IssuerMetadata at", issuerAddress)
    let response = await fetch(issuerAddress + "/.well-known/openid-credential-issuer", {
        cache: "no-cache",
        mode: "cors"
    });
    if (response.ok) {
        var openIdInfo = await response.json();
        mylog("IssuerMetadata",openIdInfo);
        return openIdInfo;
    } else {
        throw new Error("error retrieving OpenID metadata")
    }
}

// getAuthServerOpenIdConfig retrieves the OpenID metadata for a server
async function getAuthServerMetadata(authServerAddress) {
    mylog("AuthServerMetadata at", authServerAddress)
    let response = await fetch(authServerAddress + "/.well-known/openid-configuration", {
        cache: "no-cache",
        mode: "cors"
    });
    if (response.ok) {
        var openIdInfo = await response.json();
        console.log(openIdInfo)
        mylog("AuthServerMetadata", openIdInfo);
        return openIdInfo;
    } else {
        throw new Error("error retrieving OpenID metadata")
    }
}


async function getVerifiableCredentialLD(backEndpoint) {
    try {
        let response = await fetch(backEndpoint, {
            mode: "cors"
        });
        if (response.ok) {
            var vc = await response.text();
        } else {
            if (response.status == 403) {
                alert.apply("error 403");
                window.MHR.goHome();
                return "Error 403";
            }
            var error = await response.text();
            myerror(error);
            window.MHR.goHome();
            alert(error);
            return null;
        }
    } catch (error) {
        myerror(error);
        alert(error);
        return null;
    }
    console.log(vc);
    return vc;
}

async function getCredentialOffer(url) {
    const urlParams = new URL(url).searchParams;
    const credentialOfferURI = decodeURIComponent(urlParams.get('credential_offer_uri'));
    console.log("Get: " + credentialOfferURI)
    let response = await fetch(credentialOfferURI, {
        cache: "no-cache",
        mode: "cors"
    });
    if (response.ok) {
        const credentialOffer = await response.json();
        mylog("CredentialOffer", credentialOffer);
        return credentialOffer;
    } else {
        const errorText = await response.text()
        myerror(response.status + " " + response.statusText + "->" + errorText)
        throw new Error(response.status + " " + response.statusText + "->" + errorText)
    }
}

async function hashFromString(string) {
    const hash = await crypto.subtle.digest("SHA-256", (new TextEncoder()).encode(string))
    let astr = btoa(String.fromCharCode(...new Uint8Array(hash)))

    // Remove padding equal characters
    astr = astr.replace(/=+$/, '');

    // Replace non-url compatible chars with base64 standard chars
    astr = astr.replace(/\+/g, '-').replace(/\//g, '_');

    return astr;

}

function btoaUrl(input) {

    // Encode using the standard Javascript function
    let astr = btoa(input)

    // Replace non-url compatible chars with base64 standard chars
    astr = astr.replace(/\+/g, '-').replace(/\//g, '_');

    return astr;
}

// async function sendEBSIIDToken(redirectedURL) {
//     // The url should be something like the following:
//     //
//     // https://wallet.mycredential.eu/?
//     // state=e6379c7f-1919-41aa-8194-9767295e1896&
//     // client_id=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock&
//     // redirect_uri=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock%2Fdirect_post&
//     // response_type=id_token&
//     // response_mode=direct_post&
//     // scope=openid&
//     // nonce=a8612b8a-8e8b-461c-a21e-e4b09988fc87&
//     // request_uri=https%3A%2F%2Fapi-conformance.ebsi.eu%2Fconformance%2Fv3%2Fauth-mock%2Frequest_uri%2F3e3a4bb3-3b22-4b14-92bb-3e198658fbf5

//     mylog(redirectedURL)
//     const urlParams = new URL(redirectedURL).searchParams;

//     const redirect_uri = decodeURIComponent(urlParams.get('redirect_uri'))
//     console.log("redirect_uri", redirect_uri)
//     const client_id = decodeURIComponent(urlParams.get('client_id'))
//     const state = decodeURIComponent(urlParams.get('state'))
//     const nonce = decodeURIComponent(urlParams.get('nonce'))

//     // Get my DID
//     const myDID = await window.MHR.storage.didFirst()

//     const signedstring = await generateEBSIIDToken(myDID.did, client_id, state, nonce)
//     const IDToken = signedstring.signedString
//     console.log("IDToken", IDToken)

//     var formAttributes = {
//         id_token: IDToken,
//         state: state,
//     }

//     var formBody = [];
//     for (var property in formAttributes) {
//         var encodedKey = encodeURIComponent(property);
//         var encodedValue = encodeURIComponent(formAttributes[property]);
//         formBody.push(encodedKey + "=" + encodedValue);
//     }
//     formBody = formBody.join("&");
//     console.log("Body", formBody)

//     let resp = await fetch(redirect_uri, {
//         method: "POST",
//         redirect: "follow",
//         cache: "no-cache",
//         headers: {
//             'Content-Type': 'application/x-www-form-urlencoded'
//         },
//         body: formBody,
//         mode: "cors"
//     });

//     if (resp.ok && resp.redirected) {
//         // The reply is the complete JWT
//         debugger
//         await getEBSIAccessToken(resp.url, client_id)
//         return
//     } else {
//         throw new Error(resp.statusText)
//     }

// }

// async function getEBSIAccessToken(redirectedURL, client_id) {
//     // The received url is something like:
//     //
//     // https://wallet.mycredential.eu/?
//     // code=d3f7532d-3cd3-4c96-80a4-8876c61b505b

//     mylog(redirectedURL)
//     const urlParams = new URL(redirectedURL).searchParams;

//     const code = decodeURIComponent(urlParams.get('code'))
//     console.log("code", code)

//     // Get my DID
//     const myDID = await window.MHR.storage.didFirst()

//     const authServerMetaData = await storage.settingsGet("authServerMetaData")
//     const tokenEndpoint = authServerMetaData.token_endpoint

//     var formAttributes = {
//         grant_type: "authorization_code",
//         client_id: myDID.did,
//         code: code,
//         code_verifier: "this_is_a_code_verifierthis_is_a_code_verifierthis_is_a_code_verifier"
//     }
//     const formBody = encodeFormAttributes(formAttributes)
//     console.log(tokenEndpoint)
//     console.log(formBody)

//     let resp = await fetch(tokenEndpoint, {
//         method: "POST",
//         redirect: "follow",
//         cache: "no-cache",
//         headers: {
//             'Content-Type': 'application/x-www-form-urlencoded'
//         },
//         body: formBody,
//         mode: "cors"
//     });

//     if (!resp.ok) {
//         throw new Error(resp.statusText)
//     }

//     // The reply is the complete JWT
//     const authTokenObject = await resp.json()
//     console.log("Auth Token object:", authTokenObject)
//     debugger

//     // Get the nonce and access token from the retrieved object
//     const nonce = authTokenObject.c_nonce
//     const access_token = authTokenObject.access_token

//     // Retrieve the issuer metadata
//     const issuerMetaData = await storage.settingsGet("issuerMetaData")

//     // Get the proof object that we have to include in the Credential Request
//     const proofObject = await generateEBSIProof(myDID.did, issuerMetaData.credential_issuer, nonce)
//     const proof = proofObject.signedString

//     // Get the credential supported by issuer
//     const credentialOffer = await storage.settingsGet("credentialOffer")
//     const credentialTypes = credentialOffer.credentials[0].types


//     // Get the credential from EBSI
//     const credentialResponse = await requestEBSICredential(proof, access_token, issuerMetaData.credential_endpoint, credentialTypes)

//     return credentialResponse.credential
    

// }

function encodeFormAttributes(formAttributes) {
    var formBody = [];
    for (var property in formAttributes) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(formAttributes[property]);
        formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");
    return formBody

}

window.MHR.register("EBSIRedirect", class extends window.MHR.AbstractPage {

    constructor(id) {
        console.log("EBSIRedirect constructor")
        super(id)
    }

    async enter(qrData) {
        mylog(qrData)
        const urlParams = new URL(qrData).searchParams;

        const redirect_uri = decodeURIComponent(urlParams.get('redirect_uri'))
        console.log("redirect_uri", redirect_uri)
        const client_id = decodeURIComponent(urlParams.get('client_id'))
        const state = decodeURIComponent(urlParams.get('state'))
        const nonce = decodeURIComponent(urlParams.get('nonce'))

        // Get my DID
        const myDID = await window.MHR.storage.didFirst()

        const signedstring = await generateEBSIIDToken(myDID.did, client_id, state, nonce)
        const IDToken = signedstring.signedString
        console.log("IDToken", IDToken)

        var formAttributes = {
            id_token: IDToken,
            state: state,
        }

        var formBody = [];
        for (var property in formAttributes) {
            var encodedKey = encodeURIComponent(property);
            var encodedValue = encodeURIComponent(formAttributes[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        formBody = formBody.join("&");
        console.log("Body", formBody)

        let resp = await fetch(redirect_uri, {
            method: "POST",
            redirect: "follow",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody,
            mode: "cors"
        });


        if (resp.ok && resp.redirected) {
            // The reply is the complete JWT
            debugger        
            console.log(resp.url)
            location = resp.url
            return
        } else {
            throw new Error(resp.statusText)
        }

    }
})

async function generateEBSIIDToken(subjectDID, issuerID, state, nonce) {

    const keyStr = subjectDID.replace("did:key:", "")
    const subjectKid = subjectDID + "#" + keyStr

    // Create the request proof for authenticating this request
    var jwtHeaders = {
        typ: 'JWT',
        alg: 'ES256',
        kid: subjectKid
    }
    const encodedHeaders = JSON.stringify(jwtHeaders)

    const iat = Math.floor(Date.now()/1000) - 2
    const exp = iat + 86500

    var jwtPayload = {
        iss: subjectDID,
        sub: subjectDID,
        aud: issuerID,
        iat: iat,
        exp: exp,
        state: state,
        nonce: nonce
    }
    const encodedPayload = JSON.stringify(jwtPayload)

    // Build the string to be signed
    // const stringToSign = `${encodedHeaders}.${encodedPayload}`

    var requestBody = {
        subjectDID: subjectDID,
        headers: encodedHeaders,
        payload: encodedPayload
    }
    const body = JSON.stringify(requestBody)
    mylog("generateEBSICredentialRequest")
    mylog(body)

    // Sign the token in the server with the associated private key
    let response = await fetch("/signtoken", {
        method: "POST",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/json'
        },
        body: body,
        mode: "cors"
    });
    if (response.ok) {
        // The reply is the complete JWT
        const jwt = await response.json();
        mylog(jwt)
        return jwt
    } else {
        throw new Error(response.statusText)
    }

}


window.MHR.register("EBSIRedirectCode", class extends window.MHR.AbstractPage {

    constructor(id) {
        console.log("EBSIRedirectCode constructor")
        super(id)
    }

    async enter(qrData) {
        mylog(qrData)
        const urlParams = new URL(qrData).searchParams;
        debugger

        const code = decodeURIComponent(urlParams.get('code'))
        console.log("redirect_uri", redirect_uri)

        // Get my DID
        const myDID = await window.MHR.storage.didFirst()

        const signedstring = await generateEBSIIDToken(myDID.did, client_id, state, nonce)
        const IDToken = signedstring.signedString
        console.log("IDToken", IDToken)
        debugger        

        var formAttributes = {
            id_token: IDToken,
            state: state,
        }

        var formBody = [];
        for (var property in formAttributes) {
            var encodedKey = encodeURIComponent(property);
            var encodedValue = encodeURIComponent(formAttributes[property]);
            formBody.push(encodedKey + "=" + encodedValue);
        }
        formBody = formBody.join("&");
        console.log("Body", formBody)

        let response = await fetch(redirect_uri, {
            method: "POST",
            cache: "no-cache",
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody,
            mode: "cors"
        });


        if (response.ok) {
            // The reply is the complete JWT
            return
        } else {
            throw new Error(response.statusText)
        }

    }
})
