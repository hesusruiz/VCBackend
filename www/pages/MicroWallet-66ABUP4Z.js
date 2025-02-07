import {
  getOrCreateDidKey
} from "../chunks/chunk-WQKVU4B3.js";
import {
  renderAnyCredentialCard
} from "../chunks/chunk-32NCLNVQ.js";
import "../chunks/chunk-25UXO2KX.js";
import "../chunks/chunk-CJ4ZD2TO.js";
import "../chunks/chunk-U5RRZUYZ.js";

// front/src/pages/MicroWallet.js
MHR.register("MicroWallet", class extends MHR.AbstractPage {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(id);
  }
  async enter() {
    const mydid = await getOrCreateDidKey();
    console.log("My DID", mydid);
    let html = this.html;
    let params = new URL(globalThis.document.location.href).searchParams;
    console.log("MicroWallet", globalThis.document.location);
    if (document.URL.includes("state=") && document.URL.includes("auth-mock")) {
      console.log("MicroWallet ************Redirected with state**************");
      MHR.gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    if (document.URL.includes("code=")) {
      console.log("MicroWallet ************Redirected with code**************");
      MHR.gotoPage("LoadAndSaveQRVC", document.URL);
      return;
    }
    let scope = params.get("scope");
    if (scope !== null) {
      console.log("detected scope");
      MHR.gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let request_uri = params.get("request_uri");
    if (request_uri !== null) {
      request_uri = decodeURIComponent(request_uri);
      console.log("MicroWallet request_uri", request_uri);
      console.log("Going to SIOPSelectCredential with", document.URL);
      MHR.gotoPage("SIOPSelectCredential", document.URL);
      return;
    }
    let credential_offer_uri = params.get("credential_offer_uri");
    if (credential_offer_uri) {
      console.log("MicroWallet", credential_offer_uri);
      await MHR.gotoPage("LoadAndSaveQRVC", document.location.href);
      return;
    }
    let command = params.get("command");
    if (command !== null) {
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
      MHR.gotoPage("ErrorPage", { "title": "Error", "msg": "Error getting recent credentials" });
      return;
    }
    console.log(credentials);
    const theDivs = [];
    for (const vcraw of credentials) {
      if (vcraw.type == "jwt_vc") {
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

                        <ion-button color="danger" @click=${() => this.presentActionSheet(currentId)}>
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
                <ion-card>
                    <ion-card-content>
                        <h2>Click here to scan a QR code</h2>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan QR")}
                        </ion-button>
                    </div>

                </ion-card>

                ${theDivs}

                <ion-action-sheet id="mw_actionSheet" @ionActionSheetDidDismiss=${(ev) => this.deleteVC(ev)}>
                </ion-action-sheet>

            `;
    } else {
      mylog("No credentials");
      theHtml = html`
                <ion-card>
                    <ion-card-header>
                        <ion-card-title>The wallet is empty</ion-card-title>
                    </ion-card-header>

                    <ion-card-content>
                    <div class="text-medium">You need to obtain a Verifiable Credential from an Issuer, by scanning the QR in the screen of the Issuer page</div>
                    </ion-card-content>

                    <div class="ion-margin-start ion-margin-bottom">
                        <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
                            <ion-icon slot="start" name="camera"></ion-icon>
                            ${T("Scan a QR")}
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
});
var rawIN2Header = "eyJhbGciOiJSUzI1NiIsImN0eSI6Impzb24iLCJraWQiOiJNSUhRTUlHM3BJRzBNSUd4TVNJd0lBWURWUVFEREJsRVNVZEpWRVZNSUZSVElFRkVWa0ZPUTBWRUlFTkJJRWN5TVJJd0VBWURWUVFGRXdsQ05EYzBORGMxTmpBeEt6QXBCZ05WQkFzTUlrUkpSMGxVUlV3Z1ZGTWdRMFZTVkVsR1NVTkJWRWxQVGlCQlZWUklUMUpKVkZreEtEQW1CZ05WQkFvTUgwUkpSMGxVUlV3Z1QwNGdWRkpWVTFSRlJDQlRSVkpXU1VORlV5QlRURlV4RXpBUkJnTlZCQWNNQ2xaaGJHeGhaRzlzYVdReEN6QUpCZ05WQkFZVEFrVlRBaFJraVFqbVlLNC95SzlIbGdrVURVNHoyZEo5OWc9PSIsIng1dCNTMjU2IjoidEZHZ19WWHVBdUc3NTZpUG52aWVTWjQ2ajl6S3VINW5TdmJKMHA5cFFaUSIsIng1YyI6WyJNSUlIL1RDQ0JlV2dBd0lCQWdJVVpJa0k1bUN1UDhpdlI1WUpGQTFPTTluU2ZmWXdEUVlKS29aSWh2Y05BUUVOQlFBd2diRXhJakFnQmdOVkJBTU1HVVJKUjBsVVJVd2dWRk1nUVVSV1FVNURSVVFnUTBFZ1J6SXhFakFRQmdOVkJBVVRDVUkwTnpRME56VTJNREVyTUNrR0ExVUVDd3dpUkVsSFNWUkZUQ0JVVXlCRFJWSlVTVVpKUTBGVVNVOU9JRUZWVkVoUFVrbFVXVEVvTUNZR0ExVUVDZ3dmUkVsSFNWUkZUQ0JQVGlCVVVsVlRWRVZFSUZORlVsWkpRMFZUSUZOTVZURVRNQkVHQTFVRUJ3d0tWbUZzYkdGa2IyeHBaREVMTUFrR0ExVUVCaE1DUlZNd0hoY05NalF3TmpJeE1EWTFOelUwV2hjTk1qY3dOakl4TURZMU56VXpXakNCcXpFVk1CTUdBMVVFQXd3TVdrVlZVeUJQVEVsTlVFOVRNUmd3RmdZRFZRUUZFdzlKUkVORlZTMDVPVGs1T1RrNU9WQXhEVEFMQmdOVkJDb01CRnBGVlZNeEVEQU9CZ05WQkFRTUIwOU1TVTFRVDFNeEh6QWRCZ05WQkFzTUZrUlBUVVVnUTNKbFpHVnVkR2xoYkNCSmMzTjFaWEl4R0RBV0JnTlZCR0VNRDFaQlZFVlZMVUk1T1RrNU9UazVPVEVQTUEwR0ExVUVDZ3dHVDB4SlRWQlBNUXN3Q1FZRFZRUUdFd0pGVlRDQ0FpSXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnSVBBRENDQWdvQ2dnSUJBTERkMGNGZ3A2dzdqV0dVNW9OU3hBWXVQejlodzMwWHdtQ3AxTldieTh4STBPN2I5blUwT0JwTTR1ZWRDKzdoSDd5Uk51ek9VTzF3S1IwZkpJcVkyc3picTExblZwNnNDTWl1eVlzb0d4NXJNQ3RMM3Y5TFBFdnU2MXhER0xRYVlBZnF0ZjVhTXdHL0QvOTQzdnUvTzJYZWQyc1VOYnIrZDFIYjZlUHVIRzU5ZS9YekRraTBuZUtPOHJSUllRakVlSzhDek50Z3N6NUN4cFBtZ3g5ZUVqMEYwZTEzRjErbzB5VGwzYUhET1FvVUErUWhjQzRYc2UzQkN0TXZnRTl1WTdWKzNlRUhFR2h5bUJjeldtbHVYeGpRMjJDZlREWFZvKzFEa0U3SWhkZU9pdGRBa2txT056VVRzVGwxa2gwTlByNDJaall3K1JaK3EybTI4QTYvbTVEbzBUdGlIaDFML2dHZkVaZjhBRzJUWWt6alhkSGEvdWRFY1hrTmlBeVpGZEo3RDlIYzZwZUhXdlFDZ2VES1dVakVtcExiMkx1c2pqVmRTYTdRc2hZbHZYS3I2b3FRcW5qZ0tOWTMwSXBvOTF2SUxZQ243MTJHRHlMR0x1ZEpxUXI0L0s5Y2cwR21sRUI1OGU4ZHdKRlhXK1o2c3lodW9CaEZESkRZNE9oZnFYeVQ2bnNPOEJ1WVl3YmFMQkFIZGprcmt5UUdpTFJDVk5oTDlBeHdBdXlhRkhjeU5ieXo5RDZ0ZUVXSThSWWFMN2JJNStpa0VBVkVJVWdnZlUxK1JCaFQwa3dDbmVTSk5BYUorSnN2WjA1czFNdTFhakZMWVhZMHI5clVlb1cyMkJDSmJuVXEyYjEzdS92dS9hRlZjTkpMdXE3OXp1YWZJUytybXQ2NUFqN3ZBZ01CQUFHamdnSVBNSUlDQ3pBTUJnTlZIUk1CQWY4RUFqQUFNQjhHQTFVZEl3UVlNQmFBRklJVG9hTUNsTTVpRGVBR3RqZFdRWEJjUmE0ck1IUUdDQ3NHQVFVRkJ3RUJCR2d3WmpBK0JnZ3JCZ0VGQlFjd0FvWXlhSFIwY0RvdkwzQnJhUzVrYVdkcGRHVnNkSE11WlhNdlJFbEhTVlJGVEZSVFVWVkJURWxHU1VWRVEwRkhNUzVqY25Rd0pBWUlLd1lCQlFVSE1BR0dHR2gwZEhBNkx5OXZZM053TG1ScFoybDBaV3gwY3k1bGN6Q0J3QVlEVlIwZ0JJRzRNSUcxTUlHeUJnc3JCZ0VFQVlPblVRb0RDekNCb2pBL0JnZ3JCZ0VGQlFjQ0FSWXphSFIwY0hNNkx5OXdhMmt1WkdsbmFYUmxiSFJ6TG1WekwyUndZeTlFU1VkSlZFVk1WRk5mUkZCRExuWXlMakV1Y0dSbU1GOEdDQ3NHQVFVRkJ3SUNNRk1NVVVObGNuUnBabWxqWVdSdklHTjFZV3hwWm1sallXUnZJR1JsSUdacGNtMWhJR1ZzWldOMGNtOXVhV05oSUdGMllXNTZZV1JoSUdSbElIQmxjbk52Ym1FZ1ptbHphV05oSUhacGJtTjFiR0ZrWVRBUEJna3JCZ0VGQlFjd0FRVUVBZ1VBTUIwR0ExVWRKUVFXTUJRR0NDc0dBUVVGQndNQ0JnZ3JCZ0VGQlFjREJEQkNCZ05WSFI4RU96QTVNRGVnTmFBemhqRm9kSFJ3T2k4dlkzSnNNUzV3YTJrdVpHbG5hWFJsYkhSekxtVnpMMFJVVTFGMVlXeHBabWxsWkVOQlJ6RXVZM0pzTUIwR0ExVWREZ1FXQkJSSnRva0hPWEYyMzVVSktZM0tPQVdhZ1NHZExEQU9CZ05WSFE4QkFmOEVCQU1DQnNBd0RRWUpLb1pJaHZjTkFRRU5CUUFEZ2dJQkFGME1nS1NHWXNiaURrUTVCQmZLc1VGWnpBd2xzTDhrRTYzUHlKMFBMajVzT2VUMEZMWTVJeTVmY0U2NmcwWEozSWsvUG0vYTFiK0hCd2l0bkx3ZGRKbVJwWm9ta09RSWxaYXRUQk9tQTlUd2M4OE5MdU5TdTdVM0F5cXV0akRSbFVDOFpGeWRDY1pUalF0bVVIM1FlU0d4RDYvRy82T0JGK2VVY3o1QTVkenJIMGtKNkQrYTQ3MjBjYitkZ01ycTA0OTBVbTVJcExReXRuOG5qSjNSWWtINnhVNmoxdEJpVmsrTVJ4TUZ6bUoxSlpLd1krd2pFdklidlZrVGt0eGRLWVFubFhGL1g2UlhnZjJ0MEJlK0YyRDU0R3pYcWlxeGMvRVVZM3k1Ni9rTUk1OW5ibGdia1ZPYTZHYVd3aUdPNnk1R3h2MVFlUmxVd2Z5TGZRRFR4Ykh6eXBrUysrcG55NXl2OU5kVytQR2loUVZubGFrdkFUS010M1B4WVZyYU91U3NWQVQyVVlVLy9sRGNJWU44Sk94NDB5amVubVVCci8yWE1yeDd2SzhpbkU1SzI0cmg4OXNZUVc3ZkZLM2RmQTRpeTEzblpRc1RzdWlEWVdBZWV6cTlMU3RObE9ncnFxd0RHRDdwLzRzbFh2RlhwTkxtcjlYaXVWRUtXQ0dmSXJnY0tPck5qV3hRREMwV1NsdGtNUFZTZzVrTlMwTW1GYmM0OHB3WXlmR3o2TkUvSmFVNVFzcXdBNnRtR3FLanhOUXJKRGptYXBheFltL3RYSjZhblhjY2sySWVudDRlc241UDhIdE1uK0wzQWQ0RFF4NWlkVWhPQmtsb1NWVlR2dWUvOXgrZTRQWXJDVHNiT3pBa1VtRTl3amFOSStLNW9jWmFvVEhDQTVDNyIsIk1JSUdWVENDQkQyZ0F3SUJBZ0lVRTZwM1hXYXFWOHdpZFQwR2dGZWNxOU1iSGw0d0RRWUpLb1pJaHZjTkFRRU5CUUF3Z2JFeElqQWdCZ05WQkFNTUdVUkpSMGxVUlV3Z1ZGTWdRVVJXUVU1RFJVUWdRMEVnUnpJeEVqQVFCZ05WQkFVVENVSTBOelEwTnpVMk1ERXJNQ2tHQTFVRUN3d2lSRWxIU1ZSRlRDQlVVeUJEUlZKVVNVWkpRMEZVU1U5T0lFRlZWRWhQVWtsVVdURW9NQ1lHQTFVRUNnd2ZSRWxIU1ZSRlRDQlBUaUJVVWxWVFZFVkVJRk5GVWxaSlEwVlRJRk5NVlRFVE1CRUdBMVVFQnd3S1ZtRnNiR0ZrYjJ4cFpERUxNQWtHQTFVRUJoTUNSVk13SGhjTk1qUXdOVEk1TVRJd01EUXdXaGNOTXpjd05USTJNVEl3TURNNVdqQ0JzVEVpTUNBR0ExVUVBd3daUkVsSFNWUkZUQ0JVVXlCQlJGWkJUa05GUkNCRFFTQkhNakVTTUJBR0ExVUVCUk1KUWpRM05EUTNOVFl3TVNzd0tRWURWUVFMRENKRVNVZEpWRVZNSUZSVElFTkZVbFJKUmtsRFFWUkpUMDRnUVZWVVNFOVNTVlJaTVNnd0pnWURWUVFLREI5RVNVZEpWRVZNSUU5T0lGUlNWVk5VUlVRZ1UwVlNWa2xEUlZNZ1UweFZNUk13RVFZRFZRUUhEQXBXWVd4c1lXUnZiR2xrTVFzd0NRWURWUVFHRXdKRlV6Q0NBaUl3RFFZSktvWklodmNOQVFFQkJRQURnZ0lQQURDQ0Fnb0NnZ0lCQU1PUWFCSkdVbkt2eDQwS1pENkVldVlNU3hBQWNjc0h5TkpXNnFNbms2N25PUEhCOTdnalJnbnNKeGVoVThRUGd4aE9iaHE3a1djMDJ2VzhuUUlTMnF5NzBIalcreTZJTWFPdGx5a3NvTlhPY3pRb1pDblZxQklpL2tEc09oRlYxcmNFWGFpQkVUL051SXJTS3ZHWUVJZHpBOUphcVlkZmkvSlEvbHJZYXlEZlAzZDczaHN1cStsSWpOMGQ5aCtwS2NZd0wvbUlJYksvY1F3bGxBVW1kZHJBdzlXRW1xa2wrNVJ1RFdxcGxEV2hodnBHSkZQWHQ0UnFLZ2FhVk41VFV3UzJPR0pTTnFDczZaSSthU2RuZVRnQ3FxUS8vODNoTjlRc20wbUIwTjhOTzlscVNwQ21QT2pZR09UcDdJazhpQjd0ZXgxT055ZVhNSGw5ektEY2lxVjE2MlpScEd0Sm0ycnU4NklVQ1NqUGxzcVRYTW5XMTQyTUt1Z3NXM1g3MVkwcXgzRFJVKzNMd2djSnFhTzFZLzlEMmtRRVFKM3Y1WmVpR1FhdVJXcWZqakFrRVJnaCs4bTNXWFhMcm56QW9GaHJRZGxCYTFRNjFJMlVxYnF4YkEwZFM5TGRPdDUrbkZGVlptK0U3QUFlVnlyOFVqVldUZEpRdlROM3VxMFZrTDBuMnBxMDMrSGI0Z1BSOHZycEQ3OUp5bHlVY0lSMFFOSWdNdEVGZTRlRkoraUM5K21iZU9qekhRa2w4Wkc1NTFYMkt5NnNsM09PbmY5M1hlZFFEMHZHMHJDWXBSR1orNTBrMDVqbHVLelJqY2lxQUNnTEhDRlNwY0x5QlNLZ3JYY0EwcWxwWURUSWJleDg5VHZSR1kxbm93ckM1bG1HTlQ4akpyeENZT1lEQWdNQkFBR2pZekJoTUE4R0ExVWRFd0VCL3dRRk1BTUJBZjh3SHdZRFZSMGpCQmd3Rm9BVWdoT2hvd0tVem1JTjRBYTJOMVpCY0Z4RnJpc3dIUVlEVlIwT0JCWUVGSUlUb2FNQ2xNNWlEZUFHdGpkV1FYQmNSYTRyTUE0R0ExVWREd0VCL3dRRUF3SUJoakFOQmdrcWhraUc5dzBCQVEwRkFBT0NBZ0VBSkdRS3JaMlUzSi9TcEdoUDd6V2p2d2VCWHhqVzV1U2R4MFY3bXd2NG12QzJWbEMxVHZ4RW41eVZuZEVVQ3BsR3AvbTBTM0EwN0J0UFoyNFpTdVJ3K21JcHRCbUNoYm5VMXZqMkJGcEZGVGhwc1FKRzBrRGpEMjNIbzZwM1J0TXJpYjhJaTBSbm9VYndwUDVOMkxpZU9idW9kOU9TOXEzTWdDbGh5OUY5OW1PV3ZEL3E1dkNWbyt1TFdadVE0YWN1VFROeGE1REh5aWpnQitHR28yT2hIbGRyU3BwK0xSZ1U1ZmtOS0cwTHpobElFR2RFQmFsMHB1Wi8rUXF0U3JyTERNVDRYUEtXTUo2Z3BzcjNsWGZiYTBFbDdiYi83NTZ0TVlBYlh6bW5ra1VxZGlPSTU3clZERlQ5Rkp4alZnbzVvVzhYT0tHU0xxTUgzMVhpSkNOb0g1ckpZOFZRM1ptTVN1aDk3a0FBaFh1RkliUVo3RnJrRjJ5K0dzS3BiMGE5WlVxRkJySmx6SHhDS2w4U1NUd2ZHRGdjcGVQWnhVSUlnUFBjSTRvWHdSb0IwSGJ0NTRJclJvRzdrV2s2OGdYMmNqS1YwWXRIbVZoRUVGcjNkaVpmTzdtQVRBNTRzTFpYOW4xbG9zbmY5eHJlRXpkRVlXYnlHVGhVd2wzM01QNlhMYUZSUGRiblFzaGJyb2VwemcrbmtzVTVWVksyWlpGSVdWWTZnK1JoSUNYVmRocWtCcE5tK2VLMCt3VUNBMXRYWXlSS29TVVZwTUZTQVpobnN5VWVaemFtUEhEZTRHa1RhbU1LNHFmWEtRT2I3RXRXVVdoNWZvVlN6YXF5dkZwcFU0Vk1wL2dLclBZSEQ2YldySEo1dkMvQjdXci9hUHRoTmtnWEZNR01yUjA9Il0sInR5cCI6Impvc2UiLCJzaWdUIjoiMjAyNC0xMS0wOFQxMTozMTozN1oiLCJjcml0IjpbInNpZ1QiXX0";
var rawIN2Body = "eyJzdWIiOiJkaWQ6a2V5OnpEbmFlaHRzcmdoNGlGdlBuUnpyYVdtZmJkcEVwQjlBWndSNXF2QWZKMTI2dmExTjkiLCJuYmYiOjE3MzEwNTc4MzUsImlzcyI6ImRpZDplbHNpOlZBVEVVLUI5OTk5OTk5OSIsImV4cCI6MTc2MjU5MzgzNSwiaWF0IjoxNzMxMDU3ODM1LCJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvbnMvY3JlZGVudGlhbHMvdjIiLCJodHRwczovL3RydXN0LWZyYW1ld29yay5kb21lLW1hcmtldHBsYWNlLmV1L2NyZWRlbnRpYWxzL2xlYXJjcmVkZW50aWFsZW1wbG95ZWUvdjEiXSwiaWQiOiJjN2U3ZWJjMC1mZmIxLTRmOTYtYWJmOS0zZDE5NTU3ZTIxNTQiLCJ0eXBlIjpbIkxFQVJDcmVkZW50aWFsRW1wbG95ZWUiLCJWZXJpZmlhYmxlQ3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJtYW5kYXRlIjp7ImlkIjoiYzk1NDJhMTQtNDkyOC00ZWIwLWE4YjUtYjU0MTdkNmNhYzEwIiwibGlmZV9zcGFuIjp7ImVuZF9kYXRlX3RpbWUiOiIyMDI1LTExLTA4VDA5OjIzOjU1Ljk3NDAyMTc3MFoiLCJzdGFydF9kYXRlX3RpbWUiOiIyMDI0LTExLTA4VDA5OjIzOjU1Ljk3NDAyMTc3MFoifSwibWFuZGF0ZWUiOnsiaWQiOiJkaWQ6a2V5OnpEbmFlaHRzcmdoNGlGdlBuUnpyYVdtZmJkcEVwQjlBWndSNXF2QWZKMTI2dmExTjkiLCJlbWFpbCI6Implc3VzLnJ1aXpAaW4yLmVzIiwiZmlyc3RfbmFtZSI6Ikplc3VzIiwibGFzdF9uYW1lIjoiUnVpeiIsIm1vYmlsZV9waG9uZSI6IiszNCA2NDAwOTk5OTkifSwibWFuZGF0b3IiOnsiY29tbW9uTmFtZSI6IjU2NTY1NjU2UCBKZXN1cyBSdWl6IiwiY291bnRyeSI6IkVTIiwiZW1haWxBZGRyZXNzIjoiamVzdXMucnVpekBpbjIuZXMiLCJvcmdhbml6YXRpb24iOiJJTjIgSU5HRU5JRVJJQSBERSBMQSBJTkZPUk1BQ0lPTiIsIm9yZ2FuaXphdGlvbklkZW50aWZpZXIiOiJWQVRFUy1CNjA2NDU5MDAiLCJzZXJpYWxOdW1iZXIiOiJJRENFUy01NjU2NTY1NlAifSwicG93ZXIiOlt7ImlkIjoiYTBhMWFhMjQtN2ZmZi00ZTUyLWJkZDctNjViZWM4MjlkZTc1IiwidG1mX2FjdGlvbiI6IkV4ZWN1dGUiLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6Ik9uYm9hcmRpbmciLCJ0bWZfdHlwZSI6IkRvbWFpbiJ9LHsiaWQiOiI3OGJkMjI4NC02M2Y3LTQzZjctYmI3ZS1iMTBlZGZmNzdkNzAiLCJ0bWZfYWN0aW9uIjpbIkNyZWF0ZSIsIlVwZGF0ZSIsIkRlbGV0ZSJdLCJ0bWZfZG9tYWluIjoiRE9NRSIsInRtZl9mdW5jdGlvbiI6IlByb2R1Y3RPZmZlcmluZyIsInRtZl90eXBlIjoiRG9tYWluIn1dLCJzaWduZXIiOnsiY29tbW9uTmFtZSI6IlpFVVMgT0xJTVBPUyIsImNvdW50cnkiOiJFVSIsImVtYWlsQWRkcmVzcyI6ImRvbWVzdXBwb3J0QGluMi5lcyIsIm9yZ2FuaXphdGlvbiI6Ik9MSU1QTyIsIm9yZ2FuaXphdGlvbklkZW50aWZpZXIiOiJWQVRFVS1COTk5OTk5OTkiLCJzZXJpYWxOdW1iZXIiOiJJRENFVS05OTk5OTk5OVAifX19LCJleHBpcmF0aW9uRGF0ZSI6IjIwMjUtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiIsImlzc3VhbmNlRGF0ZSI6IjIwMjQtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiIsImlzc3VlciI6ImRpZDplbHNpOlZBVEVVLUI5OTk5OTk5OSIsInZhbGlkRnJvbSI6IjIwMjQtMTEtMDhUMDk6MjM6NTUuOTc0MDIxNzcwWiJ9LCJqdGkiOiJiODY5YmE0NS0wZjhlLTRiODgtOTQ4Yi1jZDYxMDlhYWU3ZjYifQ";
var rawIN2Signature = "A_-CkdPdD5LZr3kPFtNAbfG_sUsPbGeRMCBoGPCeCuB0f_Xdg5rDP-ryVUctmy3yWP_EUT7Pzone0JLaeQO-M09ES0X8xVjUJPzKTMJrNhzoD2pbS1VaaGEkJLMIx43kXIb7a47jsDXOKOv2BffOWuX1tM6_VGx5eT75UYbkaiPpPd2MmMfHOb41We5sn96BpSCAqOFf0fyxeKOb3XGzE9rZxswhzMN6_MHtilf3usya9zXM1vGhIDi_kAkAchIFkqr4v1Dt8u-GD_Pmv4wuCDDYu-Efd0vIwefMjfyffEHBgaChm_xCmAtHb3BJ1LS6Gnj8rPvYw2jqm7wCe46vnW5rax88aMED1rhT5fKoz-6NISSLijZ16n8pHTqO6bcr7oHDAhs1Uh806w08LPKugaGVi34haAcNmnXBzY5dG2QKrcHNG0Z_utRvkqD_HrLhCp0oTA_V7ceS1maNEXOJVB7SdgaifqhZKPeNOTA9skvo0URTLegiEjdE_NtriMemY8eGRPXmaMQnMhkInjBFPXxtN8cmiGl-XD-1S8kR-GBvSj22RMwqq5BzzJJAFRPgMG2X8aFrsSw6WdnkTsyMeyeauc-vvAB7tP82G6b7P8VFy8JZPUoQy8t-WMVWVU-h2wWeYrM0RtJx8uO_o-OLHrMyVSqgJkMNu38-hYykTTI";
MHR.register("SaveIN2Credential", class extends MHR.AbstractPage {
  /**
   * @param {string} id
   */
  constructor(id) {
    super(id);
  }
  async enter() {
    var decodedBody;
    try {
      decodedBody = JSON.parse(atobUrl(rawIN2Body));
    } catch (error) {
      console.log(error);
      return;
    }
    const mydid = await getOrCreateDidKey();
    decodedBody.sub = mydid.did;
    decodedBody.vc.credentialSubject.mandate.mandatee.id = mydid;
    var encodedBody = btoaUrl(JSON.stringify(decodedBody));
    console.log(encodedBody);
    var encodedCredential = rawIN2Header + "." + encodedBody + rawIN2Signature;
    var credStruct = {
      id: null,
      type: "jwt_vc",
      status: "signed",
      encoded: encodedCredential,
      decoded: decodedBody
    };
    var saved = await MHR.storage.credentialsSave(credStruct);
    if (!saved) {
      return;
    }
    MHR.cleanReload();
  }
});
function atobUrl(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  let bstr = decodeURIComponent(escape(atob(input)));
  return bstr;
}
function btoaUrl(input) {
  let astr = btoa(input);
  astr = astr.replace(/\+/g, "-").replace(/\//g, "_");
  return astr;
}
