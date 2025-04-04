import { Base64 } from "js-base64";

import { decodeUnsafeJWT } from "../components/jwt";
import { renderAnyCredentialCard } from "../components/renderAnyCredential";
import { importFromJWK, verify, verifyJWT, signJWT } from "../components/crypto";

// @ts-ignore
const MHR = globalThis.MHR;

// Copy some globals to make code less verbose
let gotoPage = MHR.gotoPage;
let goHome = MHR.goHome;
let storage = MHR.storage;
let myerror = globalThis.MHR.storage.myerror;
let mylog = globalThis.MHR.storage.mylog;
let html = MHR.html;

var debug = localStorage.getItem("MHRdebug") == "true";

// Make all requests via the server instead of from the JavaScript client
const viaServer = true;

// We will perform SIOP/OpenID4VP Authentication flow
MHR.register(
   "AuthenticationRequestPage",
   class extends MHR.AbstractPage {
      WebAuthnSupported = false;
      PlatformAuthenticatorSupported = false;

      constructor(id) {
         super(id);
      }

      /**
       * @param {string} openIdUrl The url for an OID4VP Authentication Request
       */
      async enter(openIdUrl) {
         let html = this.html;

         if (debug) {
            alert(`SelectCredential: ${openIdUrl}`);
         }

         mylog("Inside AuthenticationRequestPage:", openIdUrl);
         if (openIdUrl == null) {
            myerror("No URL has been specified");
            this.showError("Error", "No URL has been specified");
            return;
         }

         // Check whether current browser supports WebAuthn
         if (globalThis.PublicKeyCredential) {
            console.log("WebAuthn is supported");
            this.WebAuthnSupported = true;

            // Check for PlatformAuthenticator
            let available =
               await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (available) {
               this.PlatformAuthenticatorSupported = true;
            }
         } else {
            console.log("WebAuthn NOT supported");
         }

         // Derive from the received URL a simple one ready for parsing.
         // We do not use the host name for anything, except to make happy the url parser.
         // The "interesting" part is in the query parameters.
         openIdUrl = openIdUrl.replace("openid4vp://?", "https://wallet.example.com/?");

         // Convert the input string to a URL object
         const inputURL = new URL(openIdUrl);
         if (debug) {
            alert(inputURL);
         }

         // The URL can have two formats:
         // 1. An OpenId url with an Authentication Request object specified in the query parameters
         // 2. A url specifying a reference to an Authentication Request object, using 'request_uri'
         //
         // We detect which one is it by looking at the query parameters:
         // 1. If 'request_uri' is in the url, then the AR is by reference, and the object can be retrieved
         //    by fetching the object.
         // 2. Otherwise, the AR object is in the url. We do not yet support this.

         // Get the relevant parameters from the query string
         const params = new URLSearchParams(inputURL.search);

         // The request_uri will be used to retrieve the AR from the Verifier
         var request_uri = params.get("request_uri");
         if (!request_uri) {
            gotoPage("ErrorPage", {
               title: "Error",
               msg: "'request_uri' parameter not found in URL",
            });
            return;
         }

         // It is URLEncoded
         request_uri = decodeURIComponent(request_uri);

         if (debug) {
            alert(request_uri);
         }

         // Retrieve the AR from the Verifier
         const authRequestJWT = await getAuthRequest(request_uri);
         if (!authRequestJWT) {
            mylog("authRequest is null, aborting");
            return;
         }
         if (authRequestJWT == "error") {
            alert("checking error after getAuthRequestDelegated");
            this.showError("Error", "Error fetching Authorization Request");
            return;
         }
         console.log(authRequestJWT);

         if (debug) {
            this.displayAR(authRequestJWT);
         } else {
            await this.displayCredentials(authRequestJWT);
         }
         return;
      }

      /**
       * Displays the Authentication Request (AR) details on the UI, for debugging purposes
       *
       * @param {string} authRequestJWT - The JWT containing the Authentication Request.
       * @returns {<void>}
       */
      displayAR(authRequestJWT) {
         let html = this.html;

         // The AR is in the payload of the received JWT
         const authRequest = decodeUnsafeJWT(authRequestJWT);
         mylog("Decoded authRequest", authRequest);
         var ar = authRequest.body;

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
                  <ion-button @click=${() => this.displayCredentials(authRequestJWT)}
                     >Continue
                  </ion-button>
               </div>
            </div>
         `;
         this.render(theHtml);
      }

      /**
       * Displays the credentials that the user has in the Wallet and that match the requested type in the AR.
       * The user must select the one he wants to send to the Verifier, or cancel the operation
       *
       * @param {string} authRequestJWT - The JWT containing the Authentication Request.
       * @returns {Promise<void>} A promise that resolves when the list of credentials are rendered.
       */
      async displayCredentials(authRequestJWT) {
         // TODO: verify the signature and that the signer is the expected one and that it is in the
         // corresponding trusted list.

         // The AR is in the payload of the received JWT
         const authRequest = decodeUnsafeJWT(authRequestJWT);
         mylog("Decoded authRequest", authRequest);
         var ar = authRequest.body;

         // response_uri is the endpoint where we have to send the Authentication Response
         // We are going to extract the RP identity from that URL
         var rpURL = new URL(ar.response_uri);
         mylog("rpURL", rpURL);
         var rpDomain = rpURL.hostname;

         // Retrieve all credentials from storage, to process them in memory
         var credStructs = await storage.credentialsGetAllRecent();
         if (!credStructs) {
            let theHtml = html`
               <div class="w3-panel w3-margin w3-card w3-center w3-round color-error">
                  <p>You do not have a Verifiable Credential.</p>
                  <p>Please go to an Issuer to obtain one.</p>
               </div>
            `;
            this.render(theHtml);
            return;
         }

         // We use scope to ask for a specific type of credential, using a hierarchical dotted path
         // Get the last segment of the credential type in 'scope'
         const scopeParts = ar.scope.split(".");
         if (scopeParts.length == 0) {
            myerror("Invalid scope specified");
            this.showError("Error", "Invalid scope specified");
            return;
         }
         const displayCredType = scopeParts[scopeParts.length - 1];

         // Select all credentials of the requested type
         var credentials = [];
         for (const cc of credStructs) {
            // The credential is of type 'vc_jwt_json'. The 'vc' claim was stored in the 'decoded' field in storage.
            const vc = cc.decoded;
            mylog(vc);

            // The type array of the VC
            const vctype = vc.type;
            mylog("vctype:", vctype);

            // The credential type requested by the Verifier must be in the type array of the VC
            if (vctype.includes(displayCredType)) {
               mylog("adding credential");
               credentials.push(cc);
            }
         }

         // Error message if no credentials satisfy the condition
         if (credentials.length == 0) {
            var msg = html`
               <p>
                  <b>${rpDomain}</b> has requested a Verifiable Credential of type
                  ${displayCredType}, but you do not have any credential of that type.
               </p>
               <p>Please go to an Issuer to obtain one.</p>
            `;
            this.showError("Error", msg);
            return;
         }

         let theHtml = html`
            <ion-card color="warning">
               <ion-card-header>
                  <ion-card-title>Authentication Request</ion-card-title>
               </ion-card-header>
               <ion-card-content>
                  <b>${rpDomain}</b> has requested a Verifiable Credential of type
                  ${displayCredType}. Use one of the credentials below to authenticate.
               </ion-card-content>
            </ion-card>

            ${credentials.map(
               (cred) =>
                  html`${vcToHtml(
                     cred,
                     ar.nonce,
                     ar.response_uri,
                     ar.state,
                     this.WebAuthnSupported
                  )}`
            )}
         `;
         this.render(theHtml);
      }
   }
);

// Render the credential with buttons so the user can select it for authentication
function vcToHtml(cc, nonce, response_uri, state, webAuthnSupported) {
   // TODO: retrieve the holder and its private key from DB

   // Get the holder that will present the credential
   // We get this from the credential subject
   mylog("in VCToHTML");
   const vc = cc.decoded;
   mylog(vc);
   const holder = vc.credentialSubject?.mandate?.mandatee?.id;
   mylog("holder:", holder);

   // A Verifiable Presentation can send more than one credential. We only send one.
   var credentials = [cc.encoded];

   // Each credential has a button to allow the user to send it to the Verifier
   const div = html`
      <ion-card>
         ${renderAnyCredentialCard(vc)}

         <div class="ion-margin-start ion-margin-bottom">
            <ion-button @click=${() => MHR.cleanReload()}>
               <ion-icon slot="start" name="chevron-back"></ion-icon>
               ${T("Cancel")}
            </ion-button>

            <ion-button
               @click=${(e) =>
                  sendAuthenticationResponse(
                     e,
                     holder,
                     response_uri,
                     credentials,
                     state,
                     nonce,
                     webAuthnSupported
                  )}
            >
               <ion-icon slot="start" name="paper-plane"></ion-icon>
               ${T("Send Credential")}
            </ion-button>
         </div>
      </ion-card>
   `;

   return div;
}

// sendAuthenticationResponse prepares an Authentication Response and sends it to the server as specified in the endpoint
async function sendAuthenticationResponse(
   e,
   holder,
   response_uri,
   credentials,
   state,
   nonce,
   webAuthnSupported
) {
   e.preventDefault();

   var domedid = localStorage.getItem("domedid");
   domedid = JSON.parse(domedid);

   const endpointURL = new URL(response_uri);
   const origin = endpointURL.origin;

   mylog("sending AuthenticationResponse to:", response_uri);

   const uuid = globalThis.crypto.randomUUID();
   const now = Math.floor(Date.now() / 1000);

   const didIdentifier = holder.substring("did:key:".length);

   var jwtHeaders = {
      kid: holder + "#" + didIdentifier,
      typ: "JWT",
      alg: "ES256",
   };

   // Create the vp_token structure
   var vpClaim = {
      context: ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      id: uuid,
      verifiableCredential: credentials,
      holder: holder,
   };

   var vp_token_payload = {
      jti: uuid,
      sub: holder,
      aud: "https://self-issued.me/v2",
      iat: now,
      nbf: now,
      exp: now + 480,
      iss: holder,
      nonce: nonce,
      vp: vpClaim,
   };

   const jwt = await signJWT(jwtHeaders, vp_token_payload, domedid.privateKey);
   const vp_token = Base64.encodeURI(jwt);
   mylog("The encoded vpToken ", vp_token);

   // var formBody =
   //    "vp_token=" +
   //    vp_token +
   //    "&state=" +
   //    state +
   //    "&presentation_submission=" +
   //    Base64.encodeURI(JSON.stringify(presentationSubmissionJSON()));
   var formBody = "vp_token=" + vp_token + "&state=" + state;
   mylog(formBody);

   debugger;
   const response = await doPOST(response_uri, formBody, "application/x-www-form-urlencoded");
   await gotoPage("AuthenticationResponseSuccess");
   return;
}

window.MHR.register(
   "AuthenticationResponseSuccess",
   class extends window.MHR.AbstractPage {
      constructor(id) {
         super(id);
      }

      enter(pageData) {
         let html = this.html;

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
                  <ion-button @click=${() => window.MHR.cleanReload()}>
                     <ion-icon slot="start" name="home"></ion-icon>
                     ${T("Home")}
                  </ion-button>
               </div>
            </ion-card>
         `;

         this.render(theHtml);
      }
   }
);

var apiPrefix = "/webauthn";

// registerUser asks the authenticator device where the wallet is running for a new WebAuthn credential
// and sends the new credential to the server, which will store it associated to the user+device
async function registerUser(origin, username, state) {
   try {
      // Get from the server the CredentialCreationOptions
      // It will be associated to the username that corresponds to the current state, which is the
      // username inside the credential that was sent to the Verifier
      var response = await fetch(
         origin + apiPrefix + "/register/begin/" + username + "?state=" + state,
         {
            mode: "cors",
         }
      );
      if (!response.ok) {
         var errorText = await response.text();
         mylog(errorText);
         return "error";
      }
      var responseJSON = await response.json();
      var credentialCreationOptions = responseJSON.options;

      // This request is associated to a session in the server. We will send the response associated to that session
      // so the server can match the reply with the request
      var session = responseJSON.session;

      mylog("Received CredentialCreationOptions", credentialCreationOptions);
      mylog("Session:", session);

      // Decode the fields that are b64Url encoded for transmission
      credentialCreationOptions.publicKey.challenge = bufferDecode(
         credentialCreationOptions.publicKey.challenge
      );
      credentialCreationOptions.publicKey.user.id = bufferDecode(
         credentialCreationOptions.publicKey.user.id
      );

      // Decode each of the excluded credentials
      // This is a list of existing credentials in the server, to avoid the authenticator creating a new one
      // if the server already has a credential for this authenticator
      if (credentialCreationOptions.publicKey.excludeCredentials) {
         for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
            credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(
               credentialCreationOptions.publicKey.excludeCredentials[i].id
            );
         }
      }

      // Make the Authenticator create the credential
      mylog("creating new Authenticator credential");
      try {
         var credential = await navigator.credentials.create({
            publicKey: credentialCreationOptions.publicKey,
         });
      } catch (error) {
         myerror(error);
         return error;
      }

      mylog("Authenticator created Credential", credential);

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
      };

      var wholeData = {
         response: data,
         session: session,
      };

      // Perform a POST to the server
      mylog("sending Authenticator credential to server");
      var response = await fetch(
         origin + apiPrefix + "/register/finish/" + username + "?state=" + state,
         {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               session_id: session,
            },
            mode: "cors",
            body: JSON.stringify(wholeData), // body data type must match "Content-Type" header
         }
      );
      if (!response.ok) {
         var errorText = await response.text();
         mylog(errorText);
         return "error";
      }

      mylog("Authenticator credential sent successfully to server");
      return;
   } catch (error) {
      myerror(error);
      return error;
   }
}

async function loginUser(origin, username, state) {
   try {
      // Get from the server the CredentialRequestOptions
      var response = await fetch(
         origin + apiPrefix + "/login/begin/" + username + "?state=" + state,
         {
            mode: "cors",
         }
      );
      if (!response.ok) {
         myerror("error requesting CredentialRequestOptions", response.status);
         return "error";
      }

      var responseJSON = await response.json();
      var credentialRequestOptions = responseJSON.options;
      var session = responseJSON.session;

      mylog("Received CredentialRequestOptions", credentialRequestOptions);

      // Decode the challenge from the server
      credentialRequestOptions.publicKey.challenge = bufferDecode(
         credentialRequestOptions.publicKey.challenge
      );

      // Decode each of the allowed credentials
      credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
         listItem.id = bufferDecode(listItem.id);
      });

      // Call the authenticator to create the assertion
      try {
         var assertion = await navigator.credentials.get({
            publicKey: credentialRequestOptions.publicKey,
         });
         if (assertion == null) {
            myerror("null assertion received from authenticator device");
            return "error";
         }
      } catch (error) {
         // Log and present the error page
         myerror(error);
         return error;
      }

      mylog("Authenticator created Assertion", assertion);

      // Get the fields that we should encode for transmission to the server
      let authData = assertion.response.authenticatorData;
      let clientDataJSON = assertion.response.clientDataJSON;
      let rawId = assertion.rawId;
      let sig = assertion.response.signature;
      let userHandle = assertion.response.userHandle;

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
      };

      // The wrapper object for the POST body
      var wholeData = {
         response: data,
         session: session,
      };

      // Perform a POST to the server
      try {
         var response = await fetch(
            origin + apiPrefix + "/login/finish/" + username + "?state=" + state,
            {
               method: "POST",
               headers: {
                  "Content-Type": "application/json",
                  session_id: session,
               },
               mode: "cors",
               body: JSON.stringify(wholeData),
            }
         );

         if (!response.ok) {
            var errorText = await response.text();
            mylog(errorText);
            return "error";
         }

         return;
      } catch (error) {
         myerror(error);
         return error;
      }
   } catch (error) {
      myerror(error);
      return error;
   }
}

// This is the predefined PresentationSubmission in DOME
function presentationSubmissionJSON() {
   return {
      definition_id: "SingleCredentialPresentation",
      id: "SingleCredentialSubmission",
      descriptor_map: [
         {
            id: "single_credential",
            path: "$",
            format: "jwt_vp_json",
            path_nested: {
               format: "jwt_vc_json",
               path: "$.verifiableCredential[0]",
            },
         },
      ],
   };
}

// Base64 to ArrayBuffer
function bufferDecode(value) {
   return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

// ArrayBuffer to URLBase64
function bufferEncode(value) {
   return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
}

/**
 * Retrieves the Authorization Request from the Verifier at the uri specified
 * https://www.rfc-editor.org/rfc/rfc9101.html#section-5.2.3
 *
 * @param {string} uri - The uri of the server
 * @returns {Promise<string>} The Authorization Request as a JWT
 */
async function getAuthRequest(uri) {
   mylog("Fetching AuthReq from", uri);

   var response = await fetch(uri);

   if (!response.ok) {
      var errorText = await response.text();
      myerror(errorText);
      throw Error("Error fetching Authorization Request: " + errorText);
   }

   // The response is plain text (actually, 'application/oauth-authz-req+jwt') but we do not check
   var responseText = await response.text();
   return responseText;
}

/**
 * Performs a POST request to the specified server URL either directly or via a server.
 * This is intended to support APIs which do not yet have enabled CORS. In that case,
 * we use an intermediate server to send the request.
 *
 * @param {string} serverURL - The URL of the server to send the POST request to.
 * @param {any} body - The body of the POST request. Can be a string or an object.
 * @param {string} mimetype - The MIME type of the request body. Defaults to "application/json".
 * @param {string} authorization - The authorization header value.
 * @returns {Promise<any>} The JSON response from the server, or undefined if the response is not JSON.
 * @throws {Error} If the server URL is not provided or if the request fails.
 */
async function doPOST(serverURL, body, mimetype = "application/json", authorization) {
   debugger;
   if (!serverURL) {
      throw new Error("No serverURL");
   }

   var response;
   if (viaServer) {
      let forwardBody = {
         method: "POST",
         url: serverURL,
         mimetype: mimetype,
         body: body,
      };
      if (authorization) {
         forwardBody["authorization"] = authorization;
      }
      response = await fetch("/serverhandler", {
         method: "POST",
         body: JSON.stringify(forwardBody),
         headers: {
            "Content-Type": "application/json",
         },
         cache: "no-cache",
      });
   } else {
      response = await fetch(serverURL, {
         method: "POST",
         body: JSON.stringify(body),
         headers: {
            "Content-Type": mimetype,
         },
         cache: "no-cache",
      });
   }
   console.log(response);

   if (response.ok) {
      try {
         var responseJSON = await response.json();
         console.log(responseJSON);
         mylog(`doPOST ${serverURL}:`, responseJSON);
         return responseJSON;
      } catch (error) {
         return;
      }
   } else {
      const errormsg = `doPOST ${serverURL}: ${response.status}`;
      myerror(errormsg, body);
      throw new Error(errormsg);
   }
}
