// @ts-check

import { renderAnyCredentialCard } from '../components/renderAnyCredential'
import { getOrCreateDidKey } from '../components/crypto'
import { decodeJWT } from '../components/jwt'

// @ts-ignore
const MHR = window.MHR

// Copy some globals to make code less verbose
let gotoPage = MHR.gotoPage
let goHome = MHR.goHome
let storage = MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = MHR.html


MHR.register("SettingsPage", class extends MHR.AbstractPage {

    /**
     * @param {string} id
     */
    constructor(id) {
        super(id)
    }

    async enter() {

        this.render(mainPage)
    }
})

var mainPage = html`
<ion-card>

    <ion-item>
        <ion-toggle @ionChange=${(e) => {
        MHR.debug = e.target.checked
        window.localStorage.setItem("MHRdebug", e.target.checked)
        console.log("DEBUG", MHR.debug)
    }} 
            id="Debug" name="Debug" label-placement="end" justify="start" checked>Debug
        </ion-toggle>
    </ion-item>


    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${() => MHR.gotoPage("ScanQrPage")}>
            <ion-icon slot="start" name="camera"></ion-icon>
            ${T("Scan QR")}
        </ion-button>
    </div>

</ion-card>

`