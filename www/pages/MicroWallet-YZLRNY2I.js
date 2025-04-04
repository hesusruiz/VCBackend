import {
  credentialsSave
} from "../chunks/chunk-XVNNYFGL.js";
import "../chunks/chunk-BFXLU5VG.js";
import {
  renderAnyCredentialCard
} from "../chunks/chunk-TEA6LPUJ.js";
import {
  decodeUnsafeJWT
} from "../chunks/chunk-3475HZHE.js";
import "../chunks/chunk-CJ4ZD2TO.js";
import "../chunks/chunk-NZLE2WMY.js";

// front/src/components/crypto_ec.js
async function generateP256did() {
  const nativeKeyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    true,
    ["sign", "verify"]
  );
  let privateKeyJWK = await crypto.subtle.exportKey("jwk", nativeKeyPair.privateKey);
  let publicKeyJWK = await crypto.subtle.exportKey("jwk", nativeKeyPair.publicKey);
  const privateKeyHex = await generateP256PrivateKeyHex(nativeKeyPair);
  const publicKeyHex = await generateP256PublicKeyHex(nativeKeyPair);
  const did = await generateDidKey(publicKeyHex);
  return { did, privateKey: privateKeyJWK, publicKey: publicKeyJWK };
}
async function generateP256PrivateKeyHex(keyPair) {
  const privateKeyPkcs8 = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const privateKeyPkcs8Bytes = new Uint8Array(privateKeyPkcs8);
  const privateKeyPkcs8Hex = bytesToHexString(privateKeyPkcs8Bytes);
  console.log("Private Key P-256 (Secp256r1) PKCS#8 (HEX): ", privateKeyPkcs8Hex);
  const privateKeyBytes = privateKeyPkcs8Bytes.slice(36, 36 + 32);
  const privateKeyHexBytes = bytesToHexString(privateKeyBytes);
  return privateKeyHexBytes;
}
async function generateP256PublicKeyHex(keyPair) {
  const publicKey = await window.crypto.subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyBytes = new Uint8Array(publicKey);
  return bytesToHexString(publicKeyBytes);
}
async function generateDidKey(publicKeyHex) {
  const publicKeyHexWithout0xAndPrefix = publicKeyHex.slice(4);
  const publicKeyX = publicKeyHexWithout0xAndPrefix.slice(0, 64);
  const publicKeyY = publicKeyHexWithout0xAndPrefix.slice(64);
  const isPublicKeyYEven = isHexNumberEven(publicKeyY);
  const compressedPublicKeyX = (isPublicKeyYEven ? "02" : "03") + publicKeyX;
  const multicodecHex = "8024" + compressedPublicKeyX;
  const multicodecBytes = multicodecHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16));
  var b58MAP = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const multicodecBase58 = base58encode(multicodecBytes, b58MAP);
  return "did:key:z" + multicodecBase58;
}
function bytesToHexString(bytesToTransform) {
  return `0x${Array.from(bytesToTransform).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function isHexNumberEven(hexNumber) {
  const decimalNumber = BigInt("0x" + hexNumber);
  const stringNumber = decimalNumber.toString();
  const lastNumPosition = stringNumber.length - 1;
  const lastNumDecimal = parseInt(stringNumber[lastNumPosition]);
  const isEven = lastNumDecimal % 2 === 0;
  return isEven;
}
function base58encode(B, A) {
  var d = [], s = "", i, j, c, n;
  for (i in B) {
    j = 0, //reset the base58 digit iterator
    c = B[i];
    s += c || s.length ^ i ? "" : 1;
    while (j in d || c) {
      n = d[j];
      n = n ? n * 256 + c : c;
      c = n / 58 | 0;
      d[j] = n % 58;
      j++;
    }
  }
  while (j--)
    s += A[d[j]];
  return s;
}

// front/src/pages/MicroWallet.js
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
      debug = localStorage.getItem("MHRdebug") == "true";
      var domedid;
      domedid = localStorage.getItem("domedid");
      if (domedid == null) {
        domedid = await generateP256did();
        localStorage.setItem("domedid", JSON.stringify(domedid));
      } else {
        domedid = JSON.parse(domedid);
      }
      mylog("My DID", domedid.did);
      let html = this.html;
      let params = new URL(globalThis.document.location.href).searchParams;
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
      let scope = params.get("scope");
      if (scope !== null) {
        mylog("detected scope:", scope);
        MHR.gotoPage("AuthenticationRequestPage", document.URL);
        return;
      }
      let request_uri = params.get("request_uri");
      if (request_uri) {
        request_uri = decodeURIComponent(request_uri);
        mylog("MicroWallet request_uri", request_uri);
        MHR.gotoPage("AuthenticationRequestPage", document.URL);
        return;
      }
      let credential_offer_uri = params.get("credential_offer_uri");
      if (credential_offer_uri) {
        mylog("MicroWallet credential_offer_uri", credential_offer_uri);
        MHR.gotoPage("LoadAndSaveQRVC", document.location.href);
        return;
      }
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
      var credentials = await MHR.storage.credentialsGetAllRecent(-1);
      if (!credentials) {
        myerror("Error getting recent credentials");
        MHR.gotoPage("ErrorPage", {
          title: "Error",
          msg: "Error getting recent credentials"
        });
        return;
      }
      if (debug) {
        mylog(credentials);
      }
      const theDivs = [];
      for (const vcraw of credentials) {
        if (vcraw.type == "jwt_vc" || vcraw.type == "jwt_vc_json") {
          console.log(vcraw);
          const currentId = vcraw.hash;
          const vc = vcraw.decoded;
          const status = vcraw.status;
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
      actionSheet.header = "Confirm to delete credential";
      actionSheet.buttons = [
        {
          text: "Delete",
          role: "destructive",
          data: {
            action: "delete"
          }
        },
        {
          text: "Cancel",
          role: "cancel",
          data: {
            action: "cancel"
          }
        }
      ];
      this.credentialIdToDelete = currentId;
      await actionSheet.present();
    }
    async deleteVC(ev) {
      if (ev.detail.data) {
        if (ev.detail.data.action == "delete") {
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
var in2Credential = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ik1JSFFNSUczcElHME1JR3hNU0l3SUFZRFZRUUREQmxFU1VkSlZFVk1JRlJUSUVGRVZrRk9RMFZFSUVOQklFY3lNUkl3RUFZRFZRUUZFd2xDTkRjME5EYzFOakF4S3pBcEJnTlZCQXNNSWtSSlIwbFVSVXdnVkZNZ1EwVlNWRWxHU1VOQlZFbFBUaUJCVlZSSVQxSkpWRmt4S0RBbUJnTlZCQW9NSDBSSlIwbFVSVXdnVDA0Z1ZGSlZVMVJGUkNCVFJWSldTVU5GVXlCVFRGVXhFekFSQmdOVkJBY01DbFpoYkd4aFpHOXNhV1F4Q3pBSkJnTlZCQVlUQWtWVEFoUWdhQUtFL3owd3paUzM5Y2J5SWZ1TGdrdHFHdz09IiwieDV0I1MyNTYiOiJIb0pEWGJzb2xaOTIwSWZHZWxqaEVFekxxOHZBTVBHTUZ4T2VRWUlIVEZnIiwieDVjIjpbIk1JSUcyVENDQk1HZ0F3SUJBZ0lVSUdnQ2hQODlNTTJVdC9YRzhpSDdpNEpMYWhzd0RRWUpLb1pJaHZjTkFRRU5CUUF3Z2JFeElqQWdCZ05WQkFNTUdVUkpSMGxVUlV3Z1ZGTWdRVVJXUVU1RFJVUWdRMEVnUnpJeEVqQVFCZ05WQkFVVENVSTBOelEwTnpVMk1ERXJNQ2tHQTFVRUN3d2lSRWxIU1ZSRlRDQlVVeUJEUlZKVVNVWkpRMEZVU1U5T0lFRlZWRWhQVWtsVVdURW9NQ1lHQTFVRUNnd2ZSRWxIU1ZSRlRDQlBUaUJVVWxWVFZFVkVJRk5GVWxaSlEwVlRJRk5NVlRFVE1CRUdBMVVFQnd3S1ZtRnNiR0ZrYjJ4cFpERUxNQWtHQTFVRUJoTUNSVk13SGhjTk1qVXdNekkzTURnek5UTTJXaGNOTWpnd016STJNRGd6TlRNMVdqQ0JtekUyTURRR0ExVUVBd3d0VTJWaGJDQlRhV2R1WVhSMWNtVWdRM0psWkdWdWRHbGhiSE1nYVc0Z1UwSllJR1p2Y2lCMFpYTjBhVzVuTVJnd0ZnWURWUVFGRXc5V1FWUkZVeTFDTmpBMk5EVTVNREF4R0RBV0JnTlZCR0VNRDFaQlZFVlRMVUkyTURZME5Ua3dNREVNTUFvR0ExVUVDZ3dEU1U0eU1SSXdFQVlEVlFRSERBbENZWEpqWld4dmJtRXhDekFKQmdOVkJBWVRBa1ZUTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUFwSit6cEpPQnBCUzRtMUcwRkd6Ymx5WDRyQkp3bEM0WUxER2VKbHN4dkZpUXFzNDV2ZHNQYUdhMmNjaEl0aTNlTnlNWXI4SkU1aE9EUERneEY4bTViSGxxSTB1YVpCTnJaNXAxM3N2K0RwRjd1eVlNVXorQkl4dXQ4Ni9XdUYwdjlIM0pJbk1PTVN1STlIaWZ0aE11S25aeEc4NUEwU0ZhZllvL2xLTWR3akpKR2hJNkpYZit3YmVnemVIQVVHRDZmb2Z5Zm1IakxlZmcvVTNPYStnOVFNazNJT2syNzFISWloTkJXcHNjSzhnd1RPZTAyOFloQW12aTdEbENWNklVWnpDbjNSVTkxZHBtYjVOZkwwMUVzNG9ud2dXQjZ5YTJoR2J2ak4rd3ltSUFweG9JOVcrRE1wekJVazVtK1dDaUs4WnRNbE5KZXlnMnlDZ216TVlLOXdJREFRQUJvNElCK3pDQ0FmY3dEQVlEVlIwVEFRSC9CQUl3QURBZkJnTlZIU01FR0RBV2dCU0NFNkdqQXBUT1lnM2dCclkzVmtGd1hFV3VLekIwQmdnckJnRUZCUWNCQVFSb01HWXdQZ1lJS3dZQkJRVUhNQUtHTW1oMGRIQTZMeTl3YTJrdVpHbG5hWFJsYkhSekxtVnpMMFJKUjBsVVJVeFVVMUZWUVV4SlJrbEZSRU5CUnpFdVkzSjBNQ1FHQ0NzR0FRVUZCekFCaGhob2RIUndPaTh2YjJOemNDNWthV2RwZEdWc2RITXVaWE13Z2F3R0ExVWRJQVNCcERDQm9UQ0JuZ1lMS3dZQkJBR0RwMUVLQWdFd2dZNHdQd1lJS3dZQkJRVUhBZ0VXTTJoMGRIQnpPaTh2Y0d0cExtUnBaMmwwWld4MGN5NWxjeTlrY0dNdlJFbEhTVlJGVEZSVFgwUlFReTUyTWk0eExuQmtaakJMQmdnckJnRUZCUWNDQWpBL0REMURaWEowYVdacFkyRmtieUJqZFdGc2FXWnBZMkZrYnlCa1pTQnpaV3hzYnlCaGRtRnVlbUZrYnlCa1pTQndaWEp6YjI1aElHcDFjbWxrYVdOaE1BOEdDU3NHQVFVRkJ6QUJCUVFDQlFBd0hRWURWUjBsQkJZd0ZBWUlLd1lCQlFVSEF3SUdDQ3NHQVFVRkJ3TUVNRUlHQTFVZEh3UTdNRGt3TjZBMW9ET0dNV2gwZEhBNkx5OWpjbXd4TG5CcmFTNWthV2RwZEdWc2RITXVaWE12UkZSVFVYVmhiR2xtYVdWa1EwRkhNUzVqY213d0hRWURWUjBPQkJZRUZIOVV6QVlVZ1VzSHh1Rk5qY20vSzRLS1hSenJNQTRHQTFVZER3RUIvd1FFQXdJR3dEQU5CZ2txaGtpRzl3MEJBUTBGQUFPQ0FnRUFzdU8xMG9QdHJOMEFkc056MXErZ2lzMlZoVEYvM0E4TzkxL0o0R2dqNkhQM1VGa0pPQmRoRGsvWURlKytZSEo0M014d2kzZDJCeC92SHJnWDF3c25CVGwydUhmQ25xMDFZbWJla0s3TmZzbXlGc3R5blAxM3dsWm5SMGtvb0RUc3Z2aXFqRzliVlFWR0JoaDJqemFvMHMrRTJwM1gxUGhrNkRkZlNUTnBESklSL1Z3eTVBa0J0MWRoMjRvZjhKMjFVM3FVaWhDbmw0cVl6ZEkvcmV1Qi9lR25pMkc2Z0tlS2hzSUswejdzZkl6bGYrbW1wR0l2RFk4VExPV1dtWUttMHFEQTFDVU5tZ0tDdWZQa1V4dW92S3FxbXVKajhuZnJRL0hZSFh2UlJibktCVk0xZ2pmbnNmWURuaVRneUJxak8vK1U4UHZaOVZnVG04V2R5VjBFQ3h5YzVJMUV6ZDZtRHdROERaSGhjMWZ4Q2tnTGk4MGxPQ29zV1NseElORmExNWJIQjVIOGhtQTM3dmhxSzN6L3EwMW9VUTJiYnVqS3dpbFRXdXFhUUM0cGgrODkrRVY4UXNiM09nZWdtZElmZHBUWU5vS0M5YWNFZTJjbXh3MEhaK1RPamdqSHd0dWVYUTUyVUhIbTlncGpETllsNTFPSmU1NnpPZFQza2VJamtIcExKSGVYZHA5VnpaWnJGRVBySE14VzhaRkFjWDgweEkrM1EveXRqVnBZZlZUdkkwT2s5eXhuazh0R04xdFdiTVhOeTRENFhtUWlKMFhxR25DQWJNT2VGNDlzVld6RjRKNVY2Skpsa0U5eFZhU2s5eHRWOWxjcjlSenVTT1NYU0J4YlQwRHlnajJtMFFFT0taSzFYQ0ZmNllmRWxBd3o1dFltdU0rM2dZYz0iLCJNSUlHVlRDQ0JEMmdBd0lCQWdJVUU2cDNYV2FxVjh3aWRUMEdnRmVjcTlNYkhsNHdEUVlKS29aSWh2Y05BUUVOQlFBd2diRXhJakFnQmdOVkJBTU1HVVJKUjBsVVJVd2dWRk1nUVVSV1FVNURSVVFnUTBFZ1J6SXhFakFRQmdOVkJBVVRDVUkwTnpRME56VTJNREVyTUNrR0ExVUVDd3dpUkVsSFNWUkZUQ0JVVXlCRFJWSlVTVVpKUTBGVVNVOU9JRUZWVkVoUFVrbFVXVEVvTUNZR0ExVUVDZ3dmUkVsSFNWUkZUQ0JQVGlCVVVsVlRWRVZFSUZORlVsWkpRMFZUSUZOTVZURVRNQkVHQTFVRUJ3d0tWbUZzYkdGa2IyeHBaREVMTUFrR0ExVUVCaE1DUlZNd0hoY05NalF3TlRJNU1USXdNRFF3V2hjTk16Y3dOVEkyTVRJd01ETTVXakNCc1RFaU1DQUdBMVVFQXd3WlJFbEhTVlJGVENCVVV5QkJSRlpCVGtORlJDQkRRU0JITWpFU01CQUdBMVVFQlJNSlFqUTNORFEzTlRZd01Tc3dLUVlEVlFRTERDSkVTVWRKVkVWTUlGUlRJRU5GVWxSSlJrbERRVlJKVDA0Z1FWVlVTRTlTU1ZSWk1TZ3dKZ1lEVlFRS0RCOUVTVWRKVkVWTUlFOU9JRlJTVlZOVVJVUWdVMFZTVmtsRFJWTWdVMHhWTVJNd0VRWURWUVFIREFwV1lXeHNZV1J2Ykdsa01Rc3dDUVlEVlFRR0V3SkZVekNDQWlJd0RRWUpLb1pJaHZjTkFRRUJCUUFEZ2dJUEFEQ0NBZ29DZ2dJQkFNT1FhQkpHVW5Ldng0MEtaRDZFZXVZTVN4QUFjY3NIeU5KVzZxTW5rNjduT1BIQjk3Z2pSZ25zSnhlaFU4UVBneGhPYmhxN2tXYzAydlc4blFJUzJxeTcwSGpXK3k2SU1hT3RseWtzb05YT2N6UW9aQ25WcUJJaS9rRHNPaEZWMXJjRVhhaUJFVC9OdUlyU0t2R1lFSWR6QTlKYXFZZGZpL0pRL2xyWWF5RGZQM2Q3M2hzdXErbElqTjBkOWgrcEtjWXdML21JSWJLL2NRd2xsQVVtZGRyQXc5V0VtcWtsKzVSdURXcXBsRFdoaHZwR0pGUFh0NFJxS2dhYVZONVRVd1MyT0dKU05xQ3M2WkkrYVNkbmVUZ0NxcVEvLzgzaE45UXNtMG1CME44Tk85bHFTcENtUE9qWUdPVHA3SWs4aUI3dGV4MU9OeWVYTUhsOXpLRGNpcVYxNjJaUnBHdEptMnJ1ODZJVUNTalBsc3FUWE1uVzE0Mk1LdWdzVzNYNzFZMHF4M0RSVSszTHdnY0pxYU8xWS85RDJrUUVRSjN2NVplaUdRYXVSV3FmampBa0VSZ2grOG0zV1hYTHJuekFvRmhyUWRsQmExUTYxSTJVcWJxeGJBMGRTOUxkT3Q1K25GRlZabStFN0FBZVZ5cjhValZXVGRKUXZUTjN1cTBWa0wwbjJwcTAzK0hiNGdQUjh2cnBENzlKeWx5VWNJUjBRTklnTXRFRmU0ZUZKK2lDOSttYmVPanpIUWtsOFpHNTUxWDJLeTZzbDNPT25mOTNYZWRRRDB2RzByQ1lwUkdaKzUwazA1amx1S3pSamNpcUFDZ0xIQ0ZTcGNMeUJTS2dyWGNBMHFscFlEVEliZXg4OVR2UkdZMW5vd3JDNWxtR05UOGpKcnhDWU9ZREFnTUJBQUdqWXpCaE1BOEdBMVVkRXdFQi93UUZNQU1CQWY4d0h3WURWUjBqQkJnd0ZvQVVnaE9ob3dLVXptSU40QWEyTjFaQmNGeEZyaXN3SFFZRFZSME9CQllFRklJVG9hTUNsTTVpRGVBR3RqZFdRWEJjUmE0ck1BNEdBMVVkRHdFQi93UUVBd0lCaGpBTkJna3Foa2lHOXcwQkFRMEZBQU9DQWdFQUpHUUtyWjJVM0ovU3BHaFA3eldqdndlQlh4alc1dVNkeDBWN213djRtdkMyVmxDMVR2eEVuNXlWbmRFVUNwbEdwL20wUzNBMDdCdFBaMjRaU3VSdyttSXB0Qm1DaGJuVTF2ajJCRnBGRlRocHNRSkcwa0RqRDIzSG82cDNSdE1yaWI4SWkwUm5vVWJ3cFA1TjJMaWVPYnVvZDlPUzlxM01nQ2xoeTlGOTltT1d2RC9xNXZDVm8rdUxXWnVRNGFjdVRUTnhhNURIeWlqZ0IrR0dvMk9oSGxkclNwcCtMUmdVNWZrTktHMEx6aGxJRUdkRUJhbDBwdVovK1FxdFNyckxETVQ0WFBLV01KNmdwc3IzbFhmYmEwRWw3YmIvNzU2dE1ZQWJYem1ua2tVcWRpT0k1N3JWREZUOUZKeGpWZ281b1c4WE9LR1NMcU1IMzFYaUpDTm9INXJKWThWUTNabU1TdWg5N2tBQWhYdUZJYlFaN0Zya0YyeStHc0twYjBhOVpVcUZCckpsekh4Q0tsOFNTVHdmR0RnY3BlUFp4VUlJZ1BQY0k0b1h3Um9CMEhidDU0SXJSb0c3a1drNjhnWDJjaktWMFl0SG1WaEVFRnIzZGlaZk83bUFUQTU0c0xaWDluMWxvc25mOXhyZUV6ZEVZV2J5R1RoVXdsMzNNUDZYTGFGUlBkYm5Rc2hicm9lcHpnK25rc1U1VlZLMlpaRklXVlk2ZytSaElDWFZkaHFrQnBObStlSzArd1VDQTF0WFl5UktvU1VWcE1GU0FaaG5zeVVlWnphbVBIRGU0R2tUYW1NSzRxZlhLUU9iN0V0V1VXaDVmb1ZTemFxeXZGcHBVNFZNcC9nS3JQWUhENmJXckhKNXZDL0I3V3IvYVB0aE5rZ1hGTUdNclIwPSJdLCJ0eXAiOiJqb3NlIiwic2lnVCI6IjIwMjUtMDMtMzFUMDc6NTk6NTZaIiwiY3JpdCI6WyJzaWdUIl19.eyJzdWIiOiJkaWQ6a2V5OnpEbmFlakw5cUZYRFY1cEZhOFRwZHg5OU1hblE4anBLRG5SVmpncmtmNHF2Z0YxWkEiLCJuYmYiOjE3NDM0MDc4OTksImlzcyI6ImRpZDplbHNpOlZBVEVTLUI2MDY0NTkwMCIsImV4cCI6MTc3NDk0Mzg5OSwiaWF0IjoxNzQzNDA3ODk5LCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3d3dy5kb21lLW1hcmtldHBsYWNlLmV1LzIwMjUvY3JlZGVudGlhbHMvbGVhcmNyZWRlbnRpYWxlbXBsb3llZS92MiJdLCJpZCI6IjNlYTdjYzU1LWVmYWItNDljNi1iOWM0LTVkMTlmMzM0MDc5MyIsInR5cGUiOlsiTEVBUkNyZWRlbnRpYWxFbXBsb3llZSIsIlZlcmlmaWFibGVDcmVkZW50aWFsIl0sImRlc2NyaXB0aW9uIjoiVmVyaWZpYWJsZSBDcmVkZW50aWFsIGZvciBlbXBsb3llZXMgb2YgYW4gb3JnYW5pemF0aW9uIiwiY3JlZGVudGlhbFN1YmplY3QiOnsibWFuZGF0ZSI6eyJpZCI6ImQxNWNiN2QzLTRlMzktNGM0Yi04MjRmLTQ5N2Q2YzY5MGUyMiIsIm1hbmRhdGVlIjp7ImlkIjoiZGlkOmtleTp6RG5hZWpMOXFGWERWNXBGYThUcGR4OTlNYW5ROGpwS0RuUlZqZ3JrZjRxdmdGMVpBIiwiZW1haWwiOiJoZXN1cy5ydWl6QGdtYWlsLmNvbSIsImZpcnN0TmFtZSI6IkpvaG4iLCJsYXN0TmFtZSI6IkRvZSIsIm5hdGlvbmFsaXR5IjoiU3BhbmlzaCJ9LCJtYW5kYXRvciI6eyJjb21tb25OYW1lIjoiSmVzdXMgUnVpeiIsImNvdW50cnkiOiJTcGFpbiIsImVtYWlsQWRkcmVzcyI6Implc3VzQGFsYXN0cmlhLmlvIiwib3JnYW5pemF0aW9uIjoiQWlyIFF1YWxpdHkgQ2xvdWQiLCJvcmdhbml6YXRpb25JZGVudGlmaWVyIjoiVkFURVMtQjM1NjY0ODc1In0sInBvd2VyIjpbeyJpZCI6IjRlYjk5YTM0LTVkNzUtNDYzYy05OWI4LWFmMjM0ZGUzMzRiMyIsImFjdGlvbiI6ImV4ZWN1dGUiLCJkb21haW4iOiJET01FIiwiZnVuY3Rpb24iOiJPbmJvYXJkaW5nIiwidHlwZSI6ImRvbWFpbiJ9XX19LCJpc3N1ZXIiOnsiaWQiOiJkaWQ6ZWxzaTpWQVRFUy1CNjA2NDU5MDAiLCJvcmdhbml6YXRpb25JZGVudGlmaWVyIjoiVkFURVMtQjYwNjQ1OTAwIiwib3JnYW5pemF0aW9uIjoiSU4yIiwiY291bnRyeSI6IkVTIiwiY29tbW9uTmFtZSI6IlNlYWwgU2lnbmF0dXJlIENyZWRlbnRpYWxzIGluIFNCWCBmb3IgdGVzdGluZyIsImVtYWlsQWRkcmVzcyI6Implc3VzQGFsYXN0cmlhLmlvIiwic2VyaWFsTnVtYmVyIjoiQjQ3NDQ3NTYwIn0sInZhbGlkRnJvbSI6IjIwMjUtMDMtMzFUMDc6NTg6MTkuMTMwNzU1MTQ5WiIsInZhbGlkVW50aWwiOiIyMDI2LTAzLTMxVDA3OjU4OjE5LjEzMDc1NTE0OVoifSwianRpIjoiNmM3NTFjOWMtYTI1Zi00OGYwLThlYTItMzQ0MmIyMmM3OTEzIn0.JA82hLs5pYAbMHB8VJjpIr4kBAjturxILKhKWCeDlNeU1q97IJCa3lYPVUmd2v0kWlx5OYYCiD445QYmSVQogPtt4hzOU1UAkgq_pmh0RaS8vcDf_RkqgzXx4I35zUsIJIa7nWfTUCIQYuRzlYbol4XgDKy-FIvUWUpWNG47U3Kg_-IYOXalX_v28N2WO_i7UQ_3kYi0bVzIfjIgmLC1948SMSQgEfkQoZVWIyu4Nf4s_6c_fBzHd_xN42R3kfudbt8Mvmwtobou2cGo2swzly8obhpe5VT7qW5IA2BsLNyB72654eMCmdew5rqgkpCGKNyn5uHCPUk2Zx8SGuymEg";
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
      var credStruct = {
        type: "jwt_vc_json",
        status: "signed",
        encoded: in2Credential,
        decoded: decoded.body?.vc,
        id: decoded.body.jti
      };
      var saved = await credentialsSave(credStruct, false);
      if (!saved) {
        return;
      }
      alert("Credential succesfully saved");
    }
  }
);
async function pasteImage() {
  try {
    const clipboardContents = await navigator.clipboard.read();
    for (const item of clipboardContents) {
      if (!item.types.includes("image/png")) {
        throw new Error("Clipboard does not contain PNG image data.");
      }
      const blob = await item.getType("image/png");
      var destinationImage = URL.createObjectURL(blob);
      const zxing = await import("../chunks/esm-AO7YE4TC.js");
      const zxingReader = new zxing.BrowserQRCodeReader();
      const resultImage = await zxingReader.decodeFromImageUrl(destinationImage);
      mylog(resultImage.getText());
      detectQRtype(resultImage.getText());
    }
  } catch (error) {
    mylog(error.message);
  }
}
function detectQRtype(qrData) {
  if (!qrData || !qrData.startsWith) {
    myerror("detectQRtype: data is not string");
    this.showError("Error", "detectQRtype: data is not string");
    return;
  }
  if (qrData.startsWith("openid4vp:")) {
    mylog("Authentication Request");
    window.MHR.gotoPage("AuthenticationRequestPage", qrData);
    return;
  } else if (qrData.startsWith("openid-credential-offer://")) {
    mylog("Credential Issuance");
    qrData = qrData.replace("openid-credential-offer://", "https://www.example.com/");
    window.MHR.gotoPage("LoadAndSaveQRVC", qrData);
    return;
  } else if (qrData.includes("credential_offer_uri=")) {
    mylog("Credential Issuance");
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
    mylog("Going to ", this.displayPage);
    window.MHR.gotoPage(this.displayPage, qrData);
    return true;
  } else {
    myerror("detectQRtype: unrecognized QR code");
    this.showError("Error", "detectQRtype: unrecognized QR code");
    return;
  }
}
