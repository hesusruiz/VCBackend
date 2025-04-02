// @ts-check

/**
 * MicroWallet is the main page of the wallet application.
 * It shows the list of credentials stored in the wallet,
 * and allows the user to scan a QR code to add a new credential or authenticate
 * to a RelyingParty
 */

import { renderAnyCredentialCard } from "../components/renderAnyCredential";
import { getOrCreateDidKey, generateEd25519KeyPair } from "../components/crypto";
import { generateP256did as generateDidKeyDOME } from "../components/crypto_ec";
import { importFromJWK, verify, verifyJWT, signJWT } from "../components/crypto";
import { decodeUnsafeJWT } from "../components/jwt";
import { credentialsSave } from "../components/db";

// Enable to debug the application
var debug = false;

MHR.register(
   "MicroWallet",
   class extends MHR.AbstractPage {
      /**
       * @param {string} id
       */
      constructor(id) {
         super(id);
      }

      async enter() {
         mylog("MicroWallet", globalThis.document.location);

         // Check if we are debugging the application
         debug = localStorage.getItem("MHRdebug") == "true";

         // TODO: generate a default did:key the first time the wallet is used,
         // and give the user the possibility to create a new one when issuing
         // a new credential which has to be bound to the user.
         // And move the code to a component.

         // Generate a did:key if it does not exist yet
         var domedid;
         domedid = localStorage.getItem("domedid");
         if (domedid == null) {
            domedid = await generateDidKeyDOME();
            localStorage.setItem("domedid", JSON.stringify(domedid));
         } else {
            domedid = JSON.parse(domedid);
         }

         mylog("My DID", domedid.did);

         let html = this.html;

         // The wallet supports several ways to receive a QR code:
         // 1. Scanning with the camera. The QR is decoded with an image decoding
         //    engine, the type of QR is detected (issuance, authentication, other, ...)
         //    and the appropriate logic in the wallet is invoked.
         // 2. Pasting from the clipboard an image, which the user has captured somehow.
         //    The process of the image is virtually identical to the previous one, with the exception
         //    that the QR code engine is applied to a static image instead of a video stream.
         // 3. As part of the URL used to invoke the wallet. This is a special mechanism which is
         //    tied to the particular URL of the wallet and should be used only in special circumstances.
         //    If the URL specifies a QR then the wallet checks it and stores in local storage. Afterwards
         //    it cleans the URL and reloads the app.

         let params = new URL(globalThis.document.location.href).searchParams;

         // Some verifiers (eg. EBSI), for some authentication flows, use redirections during the flow.
         // We detect that this is the case by checking the URL
         if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
            mylog("Redirected with state:", document.URL);
            MHR.gotoPage("LoadAndSaveQRVC", document.URL);
            return;
         }

         if (document.URL.includes("code=")) {
            mylog("Redirected with code:", document.URL);
            MHR.gotoPage("LoadAndSaveQRVC", document.URL);
            return;
         }

         // This is an authentication request in the URL. Process and display it
         let scope = params.get("scope");
         if (scope !== null) {
            mylog("detected scope:", scope);
            MHR.gotoPage("AuthenticationRequestPage", document.URL);
            return;
         }

         // Check if we are authenticating
         let request_uri = params.get("request_uri");
         if (request_uri) {
            // Unescape the query parameter
            request_uri = decodeURIComponent(request_uri);
            mylog("MicroWallet request_uri", request_uri);
            MHR.gotoPage("AuthenticationRequestPage", document.URL);
            return;
         }

         // Check if we are in a credential issuance scenario
         let credential_offer_uri = params.get("credential_offer_uri");
         if (credential_offer_uri) {
            mylog("MicroWallet credential_offer_uri", credential_offer_uri);
            MHR.gotoPage("LoadAndSaveQRVC", document.location.href);
            return;
         }

         // The URL specifies a command
         let command = params.get("command");
         if (command) {
            mylog("MicroWallet command", command);
            switch (command) {
               case "getvc":
                  var vc_id = params.get("vcid");
                  await MHR.gotoPage("LoadAndSaveQRVC", vc_id);
                  return;

               default:
                  break;
            }
         }

         // Retrieve all recent credentials from storage (all for the moment)
         var credentials = await MHR.storage.credentialsGetAllRecent(-1);

         // We should get a result even if it is an empty array (no credentials match)
         // Otherwise, it is an error
         if (!credentials) {
            myerror("Error getting recent credentials");
            MHR.gotoPage("ErrorPage", {
               title: "Error",
               msg: "Error getting recent credentials",
            });
            return;
         }

         if (debug) {
            mylog(credentials);
         }

         // Pre-render each of the known credentials
         const theDivs = [];

         for (const vcraw of credentials) {
            // For the moment, we only understand the credentials in the "jwt_vc" format
            if (vcraw.type == "jwt_vc" || vcraw.type == "jwt_vc_json") {
               console.log(vcraw);

               // We use the hash of the credential as its unique ID
               const currentId = vcraw.hash;

               // Get the unencoded payload
               const vc = vcraw.decoded;

               const status = vcraw.status;

               // Render the credential
               const div = html`
                  <ion-card>
                     ${renderAnyCredentialCard(vc, vcraw.status)}

                     <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => MHR.gotoPage("DisplayVC", vcraw)}>
                           <ion-icon slot="start" name="construct"></ion-icon>
                           ${T("Details")}
                        </ion-button>

                        <ion-button
                           color="danger"
                           @click=${() => this.presentActionSheet(currentId)}
                        >
                           <ion-icon slot="start" name="trash"></ion-icon>
                           ${T("Delete")}
                        </ion-button>
                     </div>
                  </ion-card>
               `;

               theDivs.push(div);
            }
         }

         var theHtml;

         if (theDivs.length > 0) {
            theHtml = html`
               <ion-grid>
                  <ion-row>
                     <ion-col size="6">
                        <ion-card class="scanbutton">
                           <ion-card-content>
                              <h2>Use the camera to authenticate or receive a new credential.</h2>
                           </ion-card-content>

                           <div class="ion-margin-start ion-margin-bottom">
                              <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
                                 <ion-icon slot="start" name="camera"></ion-icon>
                                 ${T("Scan QR")}
                              </ion-button>
                           </div>
                        </ion-card>
                     </ion-col>
                     <ion-col size="6">
                        <ion-card class="scanbutton">
                           <ion-card-content>
                              <h2>Paste a QR code image you captured from elsewhere.</h2>
                           </ion-card-content>

                           <div class="ion-margin-start ion-margin-bottom">
                              <ion-button @click=${() => pasteImage()}>
                                 <ion-icon slot="start" name="clipboard"></ion-icon>
                                 ${T("Paste QR")}
                              </ion-button>
                           </div>
                        </ion-card>
                     </ion-col>
                  </ion-row>
               </ion-grid>

               ${theDivs}

               <ion-action-sheet
                  id="mw_actionSheet"
                  @ionActionSheetDidDismiss=${(ev) => this.deleteVC(ev)}
               >
               </ion-action-sheet>
               <style>
                  .scanbutton {
                     margin: 2px;
                  }
               </style>
            `;
         } else {
            mylog("No credentials");

            // We do not have a QR in the local storage
            theHtml = html`
               <ion-card>
                  <ion-card-header>
                     <ion-card-title>The wallet is empty</ion-card-title>
                  </ion-card-header>

                  <ion-card-content>
                     <div class="text-medium">
                        You need to obtain a Verifiable Credential from an Issuer, by scanning the
                        QR in the screen of the Issuer page
                     </div>
                  </ion-card-content>

                  <div class="ion-margin-start ion-margin-bottom">
                     <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
                        <ion-icon slot="start" name="camera"></ion-icon>
                        ${T("Scan a QR")}
                     </ion-button>
                     <ion-button @click=${() => pasteImage()}>
                        <ion-icon slot="start" name="clipboard"></ion-icon>
                        ${T("Paste from clipboard")}
                     </ion-button>
                  </div>
               </ion-card>
            `;
         }

         this.render(theHtml, false);
      }

      /**
       * @param {string} currentId
       */
      async presentActionSheet(currentId) {
         const actionSheet = document.getElementById("mw_actionSheet");
         // @ts-ignore
         actionSheet.header = "Confirm to delete credential";
         // @ts-ignore
         actionSheet.buttons = [
            {
               text: "Delete",
               role: "destructive",
               data: {
                  action: "delete",
               },
            },
            {
               text: "Cancel",
               role: "cancel",
               data: {
                  action: "cancel",
               },
            },
         ];

         this.credentialIdToDelete = currentId;
         // @ts-ignore
         await actionSheet.present();
      }

      async deleteVC(ev) {
         // Delete only if event is delete
         if (ev.detail.data) {
            if (ev.detail.data.action == "delete") {
               // Get the credential to delete
               const currentId = this.credentialIdToDelete;
               mylog("deleting credential", currentId);
               await MHR.storage.credentialsDelete(currentId);
               MHR.goHome();
               return;
            }
         }
      }
   }
);

async function test_generateDIDKeyProof(subjectDID, issuerID, nonce) {
   debugger;
   const subjectKid = subjectDID.did;

   // Create the headers of the JWT
   var jwtHeaders = {
      typ: "openid4vci-proof+jwt",
      alg: "ES256",
      kid: subjectKid,
   };

   // It expires in one day (it could be much shorter in many flows)
   const iat = Math.floor(Date.now() / 1000) - 2;
   const exp = iat + 86500;

   // The issuer of the JWT is the person who will receive the Verifiable Credential at the end of the OID4VCI flow.
   // This is why the 'iss' claim is set to the did:key of the Subject.
   // The JWT is intended for the entity that is issuing the Verifiable Credential in the OID4VCI flow. This is the
   // reason why the 'aud' claim is set to the did (whatever did method is used) of the VC Issuer.
   var jwtPayload = {
      // iss: subjectDID.did,
      aud: issuerID,
      iat: iat,
      exp: exp,
      nonce: nonce,
   };

   // The JWT is signed with the private key associated to the did:key of the creator of the JWT.
   const jwt = await signJWT(jwtHeaders, jwtPayload, subjectDID.privateKey);

   const ok = await verifyJWT(jwt, subjectDID.publicKey);

   return jwt;
}

function base64ToBytes(base64) {
   const binString = atob(base64);
   return Uint8Array.from(binString, (m) => m.codePointAt(0));
}

var rawIN2Header =
   "eyJhbGciOiJSUzI1NiIsImN0eSI6Impzb24iLCJraWQiOiJNSUhRTUlHM3BJRzBNSUd4TVNJd0lBWURWUVFEREJsRVNVZEpWRVZNSUZSVElFRkVWa0ZPUTBWRUlFTkJJRWN5TVJJd0VBWURWUVFGRXdsQ05EYzBORGMxTmpBeEt6QXBCZ05WQkFzTUlrUkpSMGxVUlV3Z1ZGTWdRMFZTVkVsR1NVTkJWRWxQVGlCQlZWUklUMUpKVkZreEtEQW1CZ05WQkFvTUgwUkpSMGxVUlV3Z1QwNGdWRkpWVTFSRlJDQlRSVkpXU1VORlV5QlRURlV4RXpBUkJnTlZCQWNNQ2xaaGJHeGhaRzlzYVdReEN6QUpCZ05WQkFZVEFrVlRBaFJraVFqbVlLNC95SzlIbGdrVURVNHoyZEo5OWc9PSIsIng1dCNTMjU2IjoidEZHZ19WWHVBdUc3NTZpUG52aWVTWjQ2ajl6S3VINW5TdmJKMHA5cFFaUSIsIng1YyI6WyJNSUlIL1RDQ0JlV2dBd0lCQWdJVVpJa0k1bUN1UDhpdlI1WUpGQTFPTTluU2ZmWXdEUVlKS29aSWh2Y05BUUVOQlFBd2diRXhJakFnQmdOVkJBTU1HVVJKUjBsVVJVd2dWRk1nUVVSV1FVNURSVVFnUTBFZ1J6SXhFakFRQmdOVkJBVVRDVUkwTnpRME56VTJNREVyTUNrR0ExVUVDd3dpUkVsSFNWUkZUQ0JVVXlCRFJWSlVTVVpKUTBGVVNVOU9JRUZWVkVoUFVrbFVXVEVvTUNZR0ExVUVDZ3dmUkVsSFNWUkZUQ0JQVGlCVVVsVlRWRVZFSUZORlVsWkpRMFZUSUZOTVZURVRNQkVHQTFVRUJ3d0tWbUZzYkdGa2IyeHBaREVMTUFrR0ExVUVCaE1DUlZNd0hoY05NalF3TmpJeE1EWTFOelUwV2hjTk1qY3dOakl4TURZMU56VXpXakNCcXpFVk1CTUdBMVVFQXd3TVdrVlZVeUJQVEVsTlVFOVRNUmd3RmdZRFZRUUZFdzlKUkVORlZTMDVPVGs1T1RrNU9WQXhEVEFMQmdOVkJDb01CRnBGVlZNeEVEQU9CZ05WQkFRTUIwOU1TVTFRVDFNeEh6QWRCZ05WQkFzTUZrUlBUVVVnUTNKbFpHVnVkR2xoYkNCSmMzTjFaWEl4R0RBV0JnTlZCR0VNRDFaQlZFVlZMVUk1T1RrNU9UazVPVEVQTUEwR0ExVUVDZ3dHVDB4SlRWQlBNUXN3Q1FZRFZRUUdFd0pGVlRDQ0FpSXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnSVBBRENDQWdvQ2dnSUJBTERkMGNGZ3A2dzdqV0dVNW9OU3hBWXVQejlodzMwWHdtQ3AxTldieTh4STBPN2I5blUwT0JwTTR1ZWRDKzdoSDd5Uk51ek9VTzF3S1IwZkpJcVkyc3picTExblZwNnNDTWl1eVlzb0d4NXJNQ3RMM3Y5TFBFdnU2MXhER0xRYVlBZnF0ZjVhTXdHL0QvOTQzdnUvTzJYZWQyc1VOYnIrZDFIYjZlUHVIRzU5ZS9YekRraTBuZUtPOHJSUllRakVlSzhDek50Z3N6NUN4cFBtZ3g5ZUVqMEYwZTEzRjErbzB5VGwzYUhET1FvVUErUWhjQzRYc2UzQkN0TXZnRTl1WTdWKzNlRUhFR2h5bUJjeldtbHVYeGpRMjJDZlREWFZvKzFEa0U3SWhkZU9pdGRBa2txT056VVRzVGwxa2gwTlByNDJaall3K1JaK3EybTI4QTYvbTVEbzBUdGlIaDFML2dHZkVaZjhBRzJUWWt6alhkSGEvdWRFY1hrTmlBeVpGZEo3RDlIYzZwZUhXdlFDZ2VES1dVakVtcExiMkx1c2pqVmRTYTdRc2hZbHZYS3I2b3FRcW5qZ0tOWTMwSXBvOTF2SUxZQ243MTJHRHlMR0x1ZEpxUXI0L0s5Y2cwR21sRUI1OGU4ZHdKRlhXK1o2c3lodW9CaEZESkRZNE9oZnFYeVQ2bnNPOEJ1WVl3YmFMQkFIZGprcmt5UUdpTFJDVk5oTDlBeHdBdXlhRkhjeU5ieXo5RDZ0ZUVXSThSWWFMN2JJNStpa0VBVkVJVWdnZlUxK1JCaFQwa3dDbmVTSk5BYUorSnN2WjA1czFNdTFhakZMWVhZMHI5clVlb1cyMkJDSmJuVXEyYjEzdS92dS9hRlZjTkpMdXE3OXp1YWZJUytybXQ2NUFqN3ZBZ01CQUFHamdnSVBNSUlDQ3pBTUJnTlZIUk1CQWY4RUFqQUFNQjhHQTFVZEl3UVlNQmFBRklJVG9hTUNsTTVpRGVBR3RqZFdRWEJjUmE0ck1IUUdDQ3NHQVFVRkJ3RUJCR2d3WmpBK0JnZ3JCZ0VGQlFjd0FvWXlhSFIwY0RvdkwzQnJhUzVrYVdkcGRHVnNkSE11WlhNdlJFbEhTVlJGVEZSVFVWVkJURWxHU1VWRVEwRkhNUzVqY25Rd0pBWUlLd1lCQlFVSE1BR0dHR2gwZEhBNkx5OXZZM053TG1ScFoybDBaV3gwY3k1bGN6Q0J3QVlEVlIwZ0JJRzRNSUcxTUlHeUJnc3JCZ0VFQVlPblVRb0RDekNCb2pBL0JnZ3JCZ0VGQlFjQ0FSWXphSFIwY0hNNkx5OXdhMmt1WkdsbmFYUmxiSFJ6TG1WekwyUndZeTlFU1VkSlZFVk1WRk5mUkZCRExuWXlMakV1Y0dSbU1GOEdDQ3NHQVFVRkJ3SUNNRk1NVVVObGNuUnBabWxqWVdSdklHTjFZV3hwWm1sallXUnZJR1JsSUdacGNtMWhJR1ZzWldOMGNtOXVhV05oSUdGMllXNTZZV1JoSUdSbElIQmxjbk52Ym1FZ1ptbHphV05oSUhacGJtTjFiR0ZrWVRBUEJna3JCZ0VGQlFjd0FRVUVBZ1VBTUIwR0ExVWRKUVFXTUJRR0NDc0dBUVVGQndNQ0JnZ3JCZ0VGQlFjREJEQkNCZ05WSFI4RU96QTVNRGVnTmFBemhqRm9kSFJ3T2k4dlkzSnNNUzV3YTJrdVpHbG5hWFJsYkhSekxtVnpMMFJVVTFGMVlXeHBabWxsWkVOQlJ6RXVZM0pzTUIwR0ExVWREZ1FXQkJSSnRva0hPWEYyMzVVSktZM0tPQVdhZ1NHZExEQU9CZ05WSFE4QkFmOEVCQU1DQnNBd0RRWUpLb1pJaHZjTkFRRU5CUUFEZ2dJQkFGME1nS1NHWXNiaURrUTVCQmZLc1VGWnpBd2xzTDhrRTYzUHlKMFBMajVzT2VUMEZMWTVJeTVmY0U2NmcwWEozSWsvUG0vYTFiK0hCd2l0bkx3ZGRKbVJwWm9ta09RSWxaYXRUQk9tQTlUd2M4OE5MdU5TdTdVM0F5cXV0akRSbFVDOFpGeWRDY1pUalF0bVVIM1FlU0d4RDYvRy82T0JGK2VVY3o1QTVkenJIMGtKNkQrYTQ3MjBjYitkZ01ycTA0OTBVbTVJcExReXRuOG5qSjNSWWtINnhVNmoxdEJpVmsrTVJ4TUZ6bUoxSlpLd1krd2pFdklidlZrVGt0eGRLWVFubFhGL1g2UlhnZjJ0MEJlK0YyRDU0R3pYcWlxeGMvRVVZM3k1Ni9rTUk1OW5ibGdia1ZPYTZHYVd3aUdPNnk1R3h2MVFlUmxVd2Z5TGZRRFR4Ykh6eXBrUysrcG55NXl2OU5kVytQR2loUVZubGFrdkFUS010M1B4WVZyYU91U3NWQVQyVVlVLy9sRGNJWU44Sk94NDB5amVubVVCci8yWE1yeDd2SzhpbkU1SzI0cmg4OXNZUVc3ZkZLM2RmQTRpeTEzblpRc1RzdWlEWVdBZWV6cTlMU3RObE9ncnFxd0RHRDdwLzRzbFh2RlhwTkxtcjlYaXVWRUtXQ0dmSXJnY0tPck5qV3hRREMwV1NsdGtNUFZTZzVrTlMwTW1GYmM0OHB3WXlmR3o2TkUvSmFVNVFzcXdBNnRtR3FLanhOUXJKRGptYXBheFltL3RYSjZhblhjY2sySWVudDRlc241UDhIdE1uK0wzQWQ0RFF4NWlkVWhPQmtsb1NWVlR2dWUvOXgrZTRQWXJDVHNiT3pBa1VtRTl3amFOSStLNW9jWmFvVEhDQTVDNyIsIk1JSUdWVENDQkQyZ0F3SUJBZ0lVRTZwM1hXYXFWOHdpZFQwR2dGZWNxOU1iSGw0d0RRWUpLb1pJaHZjTkFRRU5CUUF3Z2JFeElqQWdCZ05WQkFNTUdVUkpSMGxVUlV3Z1ZGTWdRVVJXUVU1RFJVUWdRMEVnUnpJeEVqQVFCZ05WQkFVVENVSTBOelEwTnpVMk1ERXJNQ2tHQTFVRUN3d2lSRWxIU1ZSRlRDQlVVeUJEUlZKVVNVWkpRMEZVU1U5T0lFRlZWRWhQVWtsVVdURW9NQ1lHQTFVRUNnd2ZSRWxIU1ZSRlRDQlBUaUJVVWxWVFZFVkVJRk5GVWxaSlEwVlRJRk5NVlRFVE1CRUdBMVVFQnd3S1ZtRnNiR0ZrYjJ4cFpERUxNQWtHQTFVRUJoTUNSVk13SGhjTk1qUXdOVEk1TVRJd01EUXdXaGNOTXpjd05USTJNVEl3TURNNVdqQ0JzVEVpTUNBR0ExVUVBd3daUkVsSFNWUkZUQ0JVVXlCQlJGWkJUa05GUkNCRFFTQkhNakVTTUJBR0ExVUVCUk1KUWpRM05EUTNOVFl3TVNzd0tRWURWUVFMRENKRVNVZEpWRVZNSUZSVElFTkZVbFJKUmtsRFFWUkpUMDRnUVZWVVNFOVNTVlJaTVNnd0pnWURWUVFLREI5RVNVZEpWRVZNSUU5T0lGUlNWVk5VUlVRZ1UwVlNWa2xEUlZNZ1UweFZNUk13RVFZRFZRUUhEQXBXWVd4c1lXUnZiR2xrTVFzd0NRWURWUVFHRXdKRlV6Q0NBaUl3RFFZSktvWklodmNOQVFFQkJRQURnZ0lQQURDQ0Fnb0NnZ0lCQU1PUWFCSkdVbkt2eDQwS1pENkVldVlNU3hBQWNjc0h5TkpXNnFNbms2N25PUEhCOTdnalJnbnNKeGVoVThRUGd4aE9iaHE3a1djMDJ2VzhuUUlTMnF5NzBIalcreTZJTWFPdGx5a3NvTlhPY3pRb1pDblZxQklpL2tEc09oRlYxcmNFWGFpQkVUL051SXJTS3ZHWUVJZHpBOUphcVlkZmkvSlEvbHJZYXlEZlAzZDczaHN1cStsSWpOMGQ5aCtwS2NZd0wvbUlJYksvY1F3bGxBVW1kZHJBdzlXRW1xa2wrNVJ1RFdxcGxEV2hodnBHSkZQWHQ0UnFLZ2FhVk41VFV3UzJPR0pTTnFDczZaSSthU2RuZVRnQ3FxUS8vODNoTjlRc20wbUIwTjhOTzlscVNwQ21QT2pZR09UcDdJazhpQjd0ZXgxT055ZVhNSGw5ektEY2lxVjE2MlpScEd0Sm0ycnU4NklVQ1NqUGxzcVRYTW5XMTQyTUt1Z3NXM1g3MVkwcXgzRFJVKzNMd2djSnFhTzFZLzlEMmtRRVFKM3Y1WmVpR1FhdVJXcWZqakFrRVJnaCs4bTNXWFhMcm56QW9GaHJRZGxCYTFRNjFJMlVxYnF4YkEwZFM5TGRPdDUrbkZGVlptK0U3QUFlVnlyOFVqVldUZEpRdlROM3VxMFZrTDBuMnBxMDMrSGI0Z1BSOHZycEQ3OUp5bHlVY0lSMFFOSWdNdEVGZTRlRkoraUM5K21iZU9qekhRa2w4Wkc1NTFYMkt5NnNsM09PbmY5M1hlZFFEMHZHMHJDWXBSR1orNTBrMDVqbHVLelJqY2lxQUNnTEhDRlNwY0x5QlNLZ3JYY0EwcWxwWURUSWJleDg5VHZSR1kxbm93ckM1bG1HTlQ4akpyeENZT1lEQWdNQkFBR2pZekJoTUE4R0ExVWRFd0VCL3dRRk1BTUJBZjh3SHdZRFZSMGpCQmd3Rm9BVWdoT2hvd0tVem1JTjRBYTJOMVpCY0Z4RnJpc3dIUVlEVlIwT0JCWUVGSUlUb2FNQ2xNNWlEZUFHdGpkV1FYQmNSYTRyTUE0R0ExVWREd0VCL3dRRUF3SUJoakFOQmdrcWhraUc5dzBCQVEwRkFBT0NBZ0VBSkdRS3JaMlUzSi9TcEdoUDd6V2p2d2VCWHhqVzV1U2R4MFY3bXd2NG12QzJWbEMxVHZ4RW41eVZuZEVVQ3BsR3AvbTBTM0EwN0J0UFoyNFpTdVJ3K21JcHRCbUNoYm5VMXZqMkJGcEZGVGhwc1FKRzBrRGpEMjNIbzZwM1J0TXJpYjhJaTBSbm9VYndwUDVOMkxpZU9idW9kOU9TOXEzTWdDbGh5OUY5OW1PV3ZEL3E1dkNWbyt1TFdadVE0YWN1VFROeGE1REh5aWpnQitHR28yT2hIbGRyU3BwK0xSZ1U1ZmtOS0cwTHpobElFR2RFQmFsMHB1Wi8rUXF0U3JyTERNVDRYUEtXTUo2Z3BzcjNsWGZiYTBFbDdiYi83NTZ0TVlBYlh6bW5ra1VxZGlPSTU3clZERlQ5Rkp4alZnbzVvVzhYT0tHU0xxTUgzMVhpSkNOb0g1ckpZOFZRM1ptTVN1aDk3a0FBaFh1RkliUVo3RnJrRjJ5K0dzS3BiMGE5WlVxRkJySmx6SHhDS2w4U1NUd2ZHRGdjcGVQWnhVSUlnUFBjSTRvWHdSb0IwSGJ0NTRJclJvRzdrV2s2OGdYMmNqS1YwWXRIbVZoRUVGcjNkaVpmTzdtQVRBNTRzTFpYOW4xbG9zbmY5eHJlRXpkRVlXYnlHVGhVd2wzM01QNlhMYUZSUGRiblFzaGJyb2VwemcrbmtzVTVWVksyWlpGSVdWWTZnK1JoSUNYVmRocWtCcE5tK2VLMCt3VUNBMXRYWXlSS29TVVZwTUZTQVpobnN5VWVaemFtUEhEZTRHa1RhbU1LNHFmWEtRT2I3RXRXVVdoNWZvVlN6YXF5dkZwcFU0Vk1wL2dLclBZSEQ2YldySEo1dkMvQjdXci9hUHRoTmtnWEZNR01yUjA9Il0sInR5cCI6Impvc2UiLCJzaWdUIjoiMjAyNC0xMS0wOFQxMTozMTozN1oiLCJjcml0IjpbInNpZ1QiXX0";

var rawIN2Body =
   "eyJzdWIiOiJkaWQ6a2V5OnpEbmFlaHRzcmdoNGlGdlBuUnpyYVdtZmJkcEVwQjlBWndSNXF2QWZKMTI2dmExTjkiLCJuYmYiOjE3MzEwNTc4MzUsImlzcyI6ImRpZDplbHNpOlZBVEVVLUI5OTk5OTk5OSIsImV4cCI6MTc2MjU5MzgzNSwiaWF0IjoxNzMxMDU3ODM1LCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3RydXN0LWZyYW1ld29yay5kb21lLW1hcmtldHBsYWNlLmV1L2NyZWRlbnRpYWxzL2xlYXJjcmVkZW50aWFsZW1wbG95ZWUvdjEiXSwiaWQiOiJjN2U3ZWJjMC1mZmIxLTRmOTYtYWJmOS0zZDE5NTU3ZTIxNTQiLCJ0eXBlIjpbIkxFQVJDcmVkZW50aWFsRW1wbG95ZWUiLCJWZXJpZmlhYmxlQ3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJtYW5kYXRlIjp7ImlkIjoiYzk1NDJhMTQtNDkyOC00ZWIwLWE4YjUtYjU0MTdkNmNhYzEwIiwibGlmZV9zcGFuIjp7ImVuZF9kYXRlX3RpbWUiOiIyMDI1LTExLTA4VDA5OjIzOjU1Ljk3NDAyMTc3MFoiLCJzdGFydF9kYXRlX3RpbWUiOiIyMDI0LTExLTA4VDA5OjIzOjU1Ljk3NDAyMTc3MFoifSwibWFuZGF0ZWUiOnsiaWQiOiJkaWQ6a2V5OnpEbmFlaHRzcmdoNGlGdlBuUnpyYVdtZmJkcEVwQjlBWndSNXF2QWZKMTI2dmExTjkiLCJlbWFpbCI6Implc3VzLnJ1aXpAaW4yLmVzIiwiZmlyc3RfbmFtZSI6Ikplc3VzIiwibGFzdF9uYW1lIjoiUnVpeiIsIm1vYmlsZV9waG9uZSI6IiszNCA2NDAwOTk5OTkifSwibWFuZGF0b3IiOnsiY29tbW9uTmFtZSI6IjU2NTY1NjU2UCBKZXN1cyBSdWl6IiwiY291bnRyeSI6IkVTIiwiZW1haWxBZGRyZXNzIjoiamVzdXMucnVpekBpbjIuZXMiLCJvcmdhbml6YXRpb24iOiJJTjIgSU5HRU5JRVJJQSBERSBMQSBJTkZPUk1BQ0lPTiIsIm9yZ2FuaXphdGlvbklkZW50aWZpZXIiOiJWQVRFUy1CNjA2NDU5MDAiLCJzZXJpYWxOdW1iZXIiOiJJRENFUy01NjU2NTY1NlAifSwicG93ZXIiOlt7ImlkIjoiYTBhMWFhMjQtN2ZmZi00ZTUyLWJkZDctNjViZWM4MjlkZTc1IiwidG1mX2FjdGlvbiI6IkV4ZWN1dGUiLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6Ik9uYm9hcmRpbmciLCJ0bWZfdHlwZSI6IkRvbWFpbiJ9LHsiaWQiOiI3OGJkMjI4NC02M2Y3LTQzZjctYmI3ZS1iMTBlZGZmNzdkNzAiLCJ0bWZfYWN0aW9uIjpbIkNyZWF0ZSIsIlVwZGF0ZSIsIkRlbGV0ZSJdLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6IlByb2R1Y3RPZmZlcmluZyIsInRtZl90eXBlIjoiRG9tYWluIn1dLCJzaWduZXIiOnsiY29tbW9uTmFtZSI6IlpFVVMgT0xJTVBPUyIsImNvdW50cnkiOiJFVSIsImVtYWlsQWRkcmVzcyI6ImRvbWVzdXBwb3J0QGluMi5lcyIsIm9yZ2FuaXphdGlvbiI6Ik9MSU1QTyIsIm9yZ2FuaXphdGlvbklkZW50aWZpZXIiOiJWQVRFVS1COTk5OTk5OTkiLCJzZXJpYWxOdW1iZXIiOiJJRENFVS05OTk5OTk5OVAifX19LCJleHBpcmF0aW9uRGF0ZSI6IjIwMjUtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiIsImlzc3VhbmNlRGF0ZSI6IjIwMjQtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiIsImlzc3VlciI6ImRpZDplbHNpOlZBVEVVLUI5OTk5OTk5OSIsInZhbGlkRnJvbSI6IjIwMjQtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiJ9LCJqdGkiOiJiODY5YmE0NS0wZjhlLTRiODgtOTQ4Yi1jZDYxMDlhYWU3ZjYifQ";

var rawIN2Signature =
   "A_-CkdPdD5LZr3kPFtNAbfG_sUsPbGeRMCBoGPCeCuB0f_Xdg5rDP-ryVUctmy3yWP_EUT7Pzone0JLaeQO-M09ES0X8xVjUJPzKTMJrNhzoD2pbS1VaaGEkJLMIx43kXIb7a47jsDXOKOv2BffOWuX1tM6_VGx5eT75UYbkaiPpPd2MmMfHOb41We5sn96BpSCAqOFf0fyxeKOb3XGzE9rZxswhzMN6_MHtilf3usya9zXM1vGhIDi_kAkAchIFkqr4v1Dt8u-GD_Pmv4wuCDDYu-Efd0vIwefMjfyffEHBgaChm_xCmAtHb3BJ1LS6Gnj8rPvYw2jqm7wCe46vnW5rax88aMED1rhT5fKoz-6NISSLijZ16n8pHTqO6bcr7oHDAhs1Uh806w08LPKugaGVi34haAcNmnXBzY5dG2QKrcHNG0Z_utRvkqD_HrLhCp0oTA_V7ceS1maNEXOJVB7SdgaifqhZKPeNOTA9skvo0URTLegiEjdE_NtriMemY8eGRPXmaMQnMhkInjBFPXxtN8cmiGl-XD-1S8kR-GBvSj22RMwqq5BzzJJAFRPgMG2X8aFrsSw6WdnkTsyMeyeauc-vvAB7tP82G6b7P8VFy8JZPUoQy8t-WMVWVU-h2wWeYrM0RtJx8uO_o-OLHrMyVSqgJkMNu38-hYykTTI";

var in2Credential =
   "eyJhbGciOiJSUzI1NiIsImtpZCI6Ik1JSFFNSUczcElHME1JR3hNU0l3SUFZRFZRUUREQmxFU1VkSlZFVk1JRlJUSUVGRVZrRk9RMFZFSUVOQklFY3lNUkl3RUFZRFZRUUZFd2xDTkRjME5EYzFOakF4S3pBcEJnTlZCQXNNSWtSSlIwbFVSVXdnVkZNZ1EwVlNWRWxHU1VOQlZFbFBUaUJCVlZSSVQxSkpWRmt4S0RBbUJnTlZCQW9NSDBSSlIwbFVSVXdnVDA0Z1ZGSlZVMVJGUkNCVFJWSldTVU5GVXlCVFRGVXhFekFSQmdOVkJBY01DbFpoYkd4aFpHOXNhV1F4Q3pBSkJnTlZCQVlUQWtWVEFoUWdhQUtFL3owd3paUzM5Y2J5SWZ1TGdrdHFHdz09IiwieDV0I1MyNTYiOiJIb0pEWGJzb2xaOTIwSWZHZWxqaEVFekxxOHZBTVBHTUZ4T2VRWUlIVEZnIiwieDVjIjpbIk1JSUcyVENDQk1HZ0F3SUJBZ0lVSUdnQ2hQODlNTTJVdC9YRzhpSDdpNEpMYWhzd0RRWUpLb1pJaHZjTkFRRU5CUUF3Z2JFeElqQWdCZ05WQkFNTUdVUkpSMGxVUlV3Z1ZGTWdRVVJXUVU1RFJVUWdRMEVnUnpJeEVqQVFCZ05WQkFVVENVSTBOelEwTnpVMk1ERXJNQ2tHQTFVRUN3d2lSRWxIU1ZSRlRDQlVVeUJEUlZKVVNVWkpRMEZVU1U5T0lFRlZWRWhQVWtsVVdURW9NQ1lHQTFVRUNnd2ZSRWxIU1ZSRlRDQlBUaUJVVWxWVFZFVkVJRk5GVWxaSlEwVlRJRk5NVlRFVE1CRUdBMVVFQnd3S1ZtRnNiR0ZrYjJ4cFpERUxNQWtHQTFVRUJoTUNSVk13SGhjTk1qVXdNekkzTURnek5UTTJXaGNOTWpnd016STJNRGd6TlRNMVdqQ0JtekUyTURRR0ExVUVBd3d0VTJWaGJDQlRhV2R1WVhSMWNtVWdRM0psWkdWdWRHbGhiSE1nYVc0Z1UwSllJR1p2Y2lCMFpYTjBhVzVuTVJnd0ZnWURWUVFGRXc5V1FWUkZVeTFDTmpBMk5EVTVNREF4R0RBV0JnTlZCR0VNRDFaQlZFVlRMVUkyTURZME5Ua3dNREVNTUFvR0ExVUVDZ3dEU1U0eU1SSXdFQVlEVlFRSERBbENZWEpqWld4dmJtRXhDekFKQmdOVkJBWVRBa1ZUTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFwSit6cEpPQnBCUzRtMUcwRkd6Ymx5WDRyQkp3bEM0WUxER2VKbHN4dkZpUXFzNDV2ZHNQYUdhMmNjaEl0aTNlTnlNWXI4SkU1aE9EUERneEY4bTViSGxxSTB1YVpCTnJaNXAxM3N2K0RwRjd1eVlNVXorQkl4dXQ4Ni9XdUYwdjlIM0pJbk1PTVN1STlIaWZ0aE11S25aeEc4NUEwU0ZhZllvL2xLTWR3akpKR2hJNkpYZit3YmVnemVIQVVHRDZmb2Z5Zm1IakxlZmcvVTNPYStnOVFNazNJT2syNzFISWloTkJXcHNjSzhnd1RPZTAyOFloQW12aTdEbENWNklVWnpDbjNSVTkxZHBtYjVOZkwwMUVzNG9ud2dXQjZ5YTJoR2J2ak4rd3ltSUFweG9JOVcrRE1wekJVazVtK1dDaUs4WnRNbE5KZXlnMnlDZ216TVlLOXdJREFRQUJvNElCK3pDQ0FmY3dEQVlEVlIwVEFRSC9CQUl3QURBZkJnTlZIU01FR0RBV2dCU0NFNkdqQXBUT1lnM2dCclkzVmtGd1hFV3VLekIwQmdnckJnRUZCUWNCQVFSb01HWXdQZ1lJS3dZQkJRVUhNQUtHTW1oMGRIQTZMeTl3YTJrdVpHbG5hWFJsYkhSekxtVnpMMFJKUjBsVVJVeFVVMUZWUVV4SlJrbEZSRU5CUnpFdVkzSjBNQ1FHQ0NzR0FRVUZCekFCaGhob2RIUndPaTh2YjJOemNDNWthV2RwZEdWc2RITXVaWE13Z2F3R0ExVWRJQVNCcERDQm9UQ0JuZ1lMS3dZQkJBR0RwMUVLQWdFd2dZNHdQd1lJS3dZQkJRVUhBZ0VXTTJoMGRIQnpPaTh2Y0d0cExtUnBaMmwwWld4MGN5NWxjeTlrY0dNdlJFbEhTVlJGVEZSVFgwUlFReTUyTWk0eExuQmtaakJMQmdnckJnRUZCUWNDQWpBL0REMURaWEowYVdacFkyRmtieUJqZFdGc2FXWnBZMkZrYnlCa1pTQnpaV3hzYnlCaGRtRnVlbUZrYnlCa1pTQndaWEp6YjI1aElHcDFjbWxrYVdOaE1BOEdDU3NHQVFVRkJ6QUJCUVFDQlFBd0hRWURWUjBsQkJZd0ZBWUlLd1lCQlFVSEF3SUdDQ3NHQVFVRkJ3TUVNRUlHQTFVZEh3UTdNRGt3TjZBMW9ET0dNV2gwZEhBNkx5OWpjbXd4TG5CcmFTNWthV2RwZEdWc2RITXVaWE12UkZSVFVYVmhiR2xtYVdWa1EwRkhNUzVqY213d0hRWURWUjBPQkJZRUZIOVV6QVlVZ1VzSHh1Rk5qY20vSzRLS1hSenJNQTRHQTFVZER3RUIvd1FFQXdJR3dEQU5CZ2txaGtpRzl3MEJBUTBGQUFPQ0FnRUFzdU8xMG9QdHJOMEFkc056MXErZ2lzMlZoVEYvM0E4TzkxL0o0R2dqNkhQM1VGa0pPQmRoRGsvWURlKytZSEo0M014d2kzZDJCeC92SHJnWDF3c25CVGwydUhmQ25xMDFZbWJla0s3TmZzbXlGc3R5blAxM3dsWm5SMGtvb0RUc3Z2aXFqRzliVlFWR0JoaDJqemFvMHMrRTJwM1gxUGhrNkRkZlNUTnBESklSL1Z3eTVBa0J0MWRoMjRvZjhKMjFVM3FVaWhDbmw0cVl6ZEkvcmV1Qi9lR25pMkc2Z0tlS2hzSUswejdzZkl6bGYrbW1wR0l2RFk4VExPV1dtWUttMHFEQTFDVU5tZ0tDdWZQa1V4dW92S3FxbXVKajhuZnJRL0hZSFh2UlJibktCVk0xZ2pmbnNmWURuaVRneUJxak8vK1U4UHZaOVZnVG04V2R5VjBFQ3h5YzVJMUV6ZDZtRHdROERaSGhjMWZ4Q2tnTGk4MGxPQ29zV1NseElORmExNWJIQjVIOGhtQTM3dmhxSzN6L3EwMW9VUTJiYnVqS3dpbFRXdXFhUUM0cGgrODkrRVY4UXNiM09nZWdtZElmZHBUWU5vS0M5YWNFZTJjbXh3MEhaK1RPamdqSHd0dWVYUTUyVUhIbTlncGpETllsNTFPSmU1NnpPZFQza2VJamtIcExKSGVYZHA5VnpaWnJGRVBySE14VzhaRkFjWDgweEkrM1EveXRqVnBZZlZUdkkwT2s5eXhuazh0R04xdFdiTVhOeTRENFhtUWlKMFhxR25DQWJNT2VGNDlzVld6RjRKNVY2Skpsa0U5eFZhU2s5eHRWOWxjcjlSenVTT1NYU0J4YlQwRHlnajJtMFFFT0taSzFYQ0ZmNllmRWxBd3o1dFltdU0rM2dZYz0iLCJNSUlHVlRDQ0JEMmdBd0lCQWdJVUU2cDNYV2FxVjh3aWRUMEdnRmVjcTlNYkhsNHdEUVlKS29aSWh2Y05BUUVOQlFBd2diRXhJakFnQmdOVkJBTU1HVVJKUjBsVVJVd2dWRk1nUVVSV1FVNURSVVFnUTBFZ1J6SXhFakFRQmdOVkJBVVRDVUkwTnpRME56VTJNREVyTUNrR0ExVUVDd3dpUkVsSFNWUkZUQ0JVVXlCRFJWSlVTVVpKUTBGVVNVOU9JRUZWVkVoUFVrbFVXVEVvTUNZR0ExVUVDZ3dmUkVsSFNWUkZUQ0JQVGlCVVVsVlRWRVZFSUZORlVsWkpRMFZUSUZOTVZURVRNQkVHQTFVRUJ3d0tWbUZzYkdGa2IyeHBaREVMTUFrR0ExVUVCaE1DUlZNd0hoY05NalF3TlRJNU1USXdNRFF3V2hjTk16Y3dOVEkyTVRJd01ETTVXakNCc1RFaU1DQUdBMVVFQXd3WlJFbEhTVlJGVENCVVV5QkJSRlpCVGtORlJDQkRRU0JITWpFU01CQUdBMVVFQlJNSlFqUTNORFEzTlRZd01Tc3dLUVlEVlFRTERDSkVTVWRKVkVWTUlGUlRJRU5GVWxSSlJrbERRVlJKVDA0Z1FWVlVTRTlTU1ZSWk1TZ3dKZ1lEVlFRS0RCOUVTVWRKVkVWTUlFOU9JRlJTVlZOVVJVUWdVMFZTVmtsRFJWTWdVMHhWTVJNd0VRWURWUVFIREFwV1lXeHNZV1J2Ykdsa01Rc3dDUVlEVlFRR0V3SkZVekNDQWlJd0RRWUpLb1pJaHZjTkFRRUJCUUFEZ2dJUEFEQ0NBZ29DZ2dJQkFNT1FhQkpHVW5Ldng0MEtaRDZFZXVZTVN4QUFjY3NIeU5KVzZxTW5rNjduT1BIQjk3Z2pSZ25zSnhlaFU4UVBneGhPYmhxN2tXYzAydlc4blFJUzJxeTcwSGpXK3k2SU1hT3RseWtzb05YT2N6UW9aQ25WcUJJaS9rRHNPaEZWMXJjRVhhaUJFVC9OdUlyU0t2R1lFSWR6QTlKYXFZZGZpL0pRL2xyWWF5RGZQM2Q3M2hzdXErbElqTjBkOWgrcEtjWXdML21JSWJLL2NRd2xsQVVtZGRyQXc5V0VtcWtsKzVSdURXcXBsRFdoaHZwR0pGUFh0NFJxS2dhYVZONVRVd1MyT0dKU05xQ3M2WkkrYVNkbmVUZ0NxcVEvLzgzaE45UXNtMG1CME44Tk85bHFTcENtUE9qWUdPVHA3SWs4aUI3dGV4MU9OeWVYTUhsOXpLRGNpcVYxNjJaUnBHdEptMnJ1ODZJVUNTalBsc3FUWE1uVzE0Mk1LdWdzVzNYNzFZMHF4M0RSVSszTHdnY0pxYU8xWS85RDJrUUVRSjN2NVplaUdRYXVSV3FmampBa0VSZ2grOG0zV1hYTHJuekFvRmhyUWRsQmExUTYxSTJVcWJxeGJBMGRTOUxkT3Q1K25GRlZabStFN0FBZVZ5cjhValZXVGRKUXZUTjN1cTBWa0wwbjJwcTAzK0hiNGdQUjh2cnBENzlKeWx5VWNJUjBRTklnTXRFRmU0ZUZKK2lDOSttYmVPanpIUWtsOFpHNTUxWDJLeTZzbDNPT25mOTNYZWRRRDB2RzByQ1lwUkdaKzUwazA1amx1S3pSamNpcUFDZ0xIQ0ZTcGNMeUJTS2dyWGNBMHFscFlEVEliZXg4OVR2UkdZMW5vd3JDNWxtR05UOGpKcnhDWU9ZREFnTUJBQUdqWXpCaE1BOEdBMVVkRXdFQi93UUZNQU1CQWY4d0h3WURWUjBqQkJnd0ZvQVVnaE9ob3dLVXptSU40QWEyTjFaQmNGeEZyaXN3SFFZRFZSME9CQllFRklJVG9hTUNsTTVpRGVBR3RqZFdRWEJjUmE0ck1BNEdBMVVkRHdFQi93UUVBd0lCaGpBTkJna3Foa2lHOXcwQkFRMEZBQU9DQWdFQUpHUUtyWjJVM0ovU3BHaFA3eldqdndlQlh4alc1dVNkeDBWN213djRtdkMyVmxDMVR2eEVuNXlWbmRFVUNwbEdwL20wUzNBMDdCdFBaMjRaU3VSdyttSXB0Qm1DaGJuVTF2ajJCRnBGRlRocHNRSkcwa0RqRDIzSG82cDNSdE1yaWI4SWkwUm5vVWJ3cFA1TjJMaWVPYnVvZDlPUzlxM01nQ2xoeTlGOTltT1d2RC9xNXZDVm8rdUxXWnVRNGFjdVRUTnhhNURIeWlqZ0IrR0dvMk9oSGxkclNwcCtMUmdVNWZrTktHMEx6aGxJRUdkRUJhbDBwdVovK1FxdFNyckxETVQ0WFBLV01KNmdwc3IzbFhmYmEwRWw3YmIvNzU2dE1ZQWJYem1ua2tVcWRpT0k1N3JWREZUOUZKeGpWZ281b1c4WE9LR1NMcU1IMzFYaUpDTm9INXJKWThWUTNabU1TdWg5N2tBQWhYdUZJYlFaN0Zya0YyeStHc0twYjBhOVpVcUZCckpsekh4Q0tsOFNTVHdmR0RnY3BlUFp4VUlJZ1BQY0k0b1h3Um9CMEhidDU0SXJSb0c3a1drNjhnWDJjaktWMFl0SG1WaEVFRnIzZGlaZk83bUFUQTU0c0xaWDluMWxvc25mOXhyZUV6ZEVZV2J5R1RoVXdsMzNNUDZYTGFGUlBkYm5Rc2hicm9lcHpnK25rc1U1VlZLMlpaRklXVlk2ZytSaElDWFZkaHFrQnBObStlSzArd1VDQTF0WFl5UktvU1VWcE1GU0FaaG5zeVVlWnphbVBIRGU0R2tUYW1NSzRxZlhLUU9iN0V0V1VXaDVmb1ZTemFxeXZGcHBVNFZNcC9nS3JQWUhENmJXckhKNXZDL0I3V3IvYVB0aE5rZ1hGTUdNclIwPSJdLCJ0eXAiOiJqb3NlIiwic2lnVCI6IjIwMjUtMDMtMzFUMDc6NTk6NTZaIiwiY3JpdCI6WyJzaWdUIl19.eyJzdWIiOiJkaWQ6a2V5OnpEbmFlakw5cUZYRFY1cEZhOFRwZHg5OU1hblE4anBLRG5SVmpncmtmNHF2Z0YxWkEiLCJuYmYiOjE3NDM0MDc4OTksImlzcyI6ImRpZDplbHNpOlZBVEVTLUI2MDY0NTkwMCIsImV4cCI6MTc3NDk0Mzg5OSwiaWF0IjoxNzQzNDA3ODk5LCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3d3dy5kb21lLW1hcmtldHBsYWNlLmV1LzIwMjUvY3JlZGVudGlhbHMvbGVhcmNyZWRlbnRpYWxlbXBsb3llZS92MiJdLCJpZCI6IjNlYTdjYzU1LWVmYWItNDljNi1iOWM0LTVkMTlmMzM0MDc5MyIsInR5cGUiOlsiTEVBUkNyZWRlbnRpYWxFbXBsb3llZSIsIlZlcmlmaWFibGVDcmVkZW50aWFsIl0sImRlc2NyaXB0aW9uIjoiVmVyaWZpYWJsZSBDcmVkZW50aWFsIGZvciBlbXBsb3llZXMgb2YgYW4gb3JnYW5pemF0aW9uIiwiY3JlZGVudGlhbFN1YmplY3QiOnsibWFuZGF0ZSI6eyJpZCI6ImQxNWNiN2QzLTRlMzktNGM0Yi04MjRmLTQ5N2Q2YzY5MGUyMiIsIm1hbmRhdGVlIjp7ImlkIjoiZGlkOmtleTp6RG5hZWpMOXFGWERWNXBGYThUcGR4OTlNYW5ROGpwS0RuUlZqZ3JrZjRxdmdGMVpBIiwiZW1haWwiOiJoZXN1cy5ydWl6QGdtYWlsLmNvbSIsImZpcnN0TmFtZSI6IkpvaG4iLCJsYXN0TmFtZSI6IkRvZSIsIm5hdGlvbmFsaXR5IjoiU3BhbmlzaCJ9LCJtYW5kYXRvciI6eyJjb21tb25OYW1lIjoiSmVzdXMgUnVpeiIsImNvdW50cnkiOiJTcGFpbiIsImVtYWlsQWRkcmVzcyI6Implc3VzQGFsYXN0cmlhLmlvIiwib3JnYW5pemF0aW9uIjoiQWlyIFF1YWxpdHkgQ2xvdWQiLCJvcmdhbml6YXRpb25JZGVudGlmaWVyIjoiVkFURVMtQjM1NjY0ODc1In0sInBvd2VyIjpbeyJpZCI6IjRlYjk5YTM0LTVkNzUtNDYzYy05OWI4LWFmMjM0ZGUzMzRiMyIsImFjdGlvbiI6ImV4ZWN1dGUiLCJkb21haW4iOiJET01FIiwiZnVuY3Rpb24iOiJPbmJvYXJkaW5nIiwidHlwZSI6ImRvbWFpbiJ9XX19LCJpc3N1ZXIiOnsiaWQiOiJkaWQ6ZWxzaTpWQVRFUy1CNjA2NDU5MDAiLCJvcmdhbml6YXRpb25JZGVudGlmaWVyIjoiVkFURVMtQjYwNjQ1OTAwIiwib3JnYW5pemF0aW9uIjoiSU4yIiwiY291bnRyeSI6IkVTIiwiY29tbW9uTmFtZSI6IlNlYWwgU2lnbmF0dXJlIENyZWRlbnRpYWxzIGluIFNCWCBmb3IgdGVzdGluZyIsImVtYWlsQWRkcmVzcyI6Implc3VzQGFsYXN0cmlhLmlvIiwic2VyaWFsTnVtYmVyIjoiQjQ3NDQ3NTYwIn0sInZhbGlkRnJvbSI6IjIwMjUtMDMtMzFUMDc6NTg6MTkuMTMwNzU1MTQ5WiIsInZhbGlkVW50aWwiOiIyMDI2LTAzLTMxVDA3OjU4OjE5LjEzMDc1NTE0OVoifSwianRpIjoiNmM3NTFjOWMtYTI1Zi00OGYwLThlYTItMzQ0MmIyMmM3OTEzIn0.JA82hLs5pYAbMHB8VJjpIr4kBAjturxILKhKWCeDlNeU1q97IJCa3lYPVUmd2v0kWlx5OYYCiD445QYmSVQogPtt4hzOU1UAkgq_pmh0RaS8vcDf_RkqgzXx4I35zUsIJIa7nWfTUCIQYuRzlYbol4XgDKy-FIvUWUpWNG47U3Kg_-IYOXalX_v28N2WO_i7UQ_3kYi0bVzIfjIgmLC1948SMSQgEfkQoZVWIyu4Nf4s_6c_fBzHd_xN42R3kfudbt8Mvmwtobou2cGo2swzly8obhpe5VT7qW5IA2BsLNyB72654eMCmdew5rqgkpCGKNyn5uHCPUk2Zx8SGuymEg";

MHR.register(
   "SaveIN2Credential",
   class extends MHR.AbstractPage {
      /**
       * @param {string} id
       */
      constructor(id) {
         super(id);
      }

      async enter() {
         var decodedBody;

         const decoded = decodeUnsafeJWT(in2Credential);

         // Prepare for saving the credential in the local storage
         var credStruct = {
            type: "jwt_vc_json",
            status: "signed",
            encoded: in2Credential,
            decoded: decoded.body?.vc,
            id: decoded.body.jti,
         };

         // Save the credential, if there is no other one with the same id
         var saved = await credentialsSave(credStruct, false);
         if (!saved) {
            return;
         }

         alert("Credential succesfully saved");
      }
   }
);

function atobUrl(input) {
   // Replace non-url compatible chars with base64 standard chars
   input = input.replace(/-/g, "+").replace(/_/g, "/");

   // Decode using the standard Javascript function
   let bstr = decodeURIComponent(escape(atob(input)));

   return bstr;
}

function btoaUrl(input) {
   // Encode using the standard Javascript function
   let astr = btoa(input);

   // Replace non-url compatible chars with base64 standard chars
   astr = astr.replace(/\+/g, "-").replace(/\//g, "_");

   return astr;
}

async function pasteImage() {
   try {
      const clipboardContents = await navigator.clipboard.read();
      for (const item of clipboardContents) {
         if (!item.types.includes("image/png")) {
            throw new Error("Clipboard does not contain PNG image data.");
         }
         const blob = await item.getType("image/png");
         var destinationImage = URL.createObjectURL(blob);
         const zxing = await import("@zxing/browser");
         const zxingReader = new zxing.BrowserQRCodeReader();
         const resultImage = await zxingReader.decodeFromImageUrl(destinationImage);
         mylog(resultImage.getText());
         detectQRtype(resultImage.getText());
      }
   } catch (error) {
      mylog(error.message);
   }
}

// Try to detect the type of data received
/**
 * @param {string} qrData
 */
function detectQRtype(qrData) {
   if (!qrData || !qrData.startsWith) {
      myerror("detectQRtype: data is not string");
      this.showError("Error", "detectQRtype: data is not string");
      return;
   }

   if (qrData.startsWith("openid4vp:")) {
      // An Authentication Request, for Verifiable Presentation
      mylog("Authentication Request");
      window.MHR.gotoPage("AuthenticationRequestPage", qrData);
      return;
   } else if (qrData.startsWith("openid-credential-offer://")) {
      // An OpenID Credential Issuance
      mylog("Credential Issuance");
      // Create a valid URL
      qrData = qrData.replace("openid-credential-offer://", "https://www.example.com/");
      window.MHR.gotoPage("LoadAndSaveQRVC", qrData);
      return;
   } else if (qrData.includes("credential_offer_uri=")) {
      mylog("Credential Issuance");
      // Create a valid URL
      qrData = qrData.replace("openid-credential-offer://", "https://www.example.com/");
      window.MHR.gotoPage("LoadAndSaveQRVC", qrData);
      return;
   } else if (qrData.startsWith("https")) {
      let params = new URL(qrData).searchParams;
      let jar = params.get("jar");
      if (jar == "yes") {
         mylog("Going to ", "AuthenticationRequestPage", qrData);
         window.MHR.gotoPage("AuthenticationRequestPage", qrData);
         return;
      }

      // Normal QR with a URL where the real data is located
      // We require secure connections with https, and do not accept http schemas
      mylog("Going to ", this.displayPage);
      window.MHR.gotoPage(this.displayPage, qrData);
      return true;
   } else {
      myerror("detectQRtype: unrecognized QR code");
      this.showError("Error", "detectQRtype: unrecognized QR code");
      return;
   }
}
