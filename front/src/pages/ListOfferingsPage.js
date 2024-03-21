import PocketBase from '../components/pocketbase.es.mjs'

console.log("Wallet served from:", window.location.origin)
const pb = new PocketBase(window.location.origin)

import { log } from '../log'

let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome
let storage = window.MHR.storage
let myerror = window.MHR.storage.myerror
let mylog = window.MHR.storage.mylog
let html = window.MHR.html

window.MHR.register("ListOfferingsPage", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter() {

        console.log("AuthStore is valid:", pb.authStore.isValid)
        console.log(pb.authStore.model)

        if (!pb.authStore.isValid || !pb.authStore.model.verified) {
            gotoPage("ErrorPage", {title: "User not verified"})
            return
        }

        // Get the list of credentials
        const records = await pb.collection('credentials').getFullList({
            sort: '-created',
        });

        var theHtml
        theHtml = listCredentialOffers(records)
        this.render(theHtml, false)

    }


})


function listCredentialOffers(records) {

    return html`
<ion-card>
    <ion-card-header>
        <ion-card-title>List of Offers</ion-card-title>
    </ion-card-header>

    <ion-card-content>

        ${records.length == 0 ? html`<h1>No records</h1>` : html`
            
            <ion-list>

                ${records.map((cred) => {console.log(cred.email); return html`
                <ion-item>
                    <ion-button slot="start" @click=${()=> gotoPage("DisplayOfferingQRCode", cred.id)}> View </ion-button>
                    <ion-label>
                        ${cred.id}
                    </ion-col>
    
                    <ion-note>
                        ${cred.email}
                    </ionnote>
                </ion-item>`
                })}
            </ion-list>
                
        `}

    </ion-card-content>

    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${()=> gotoPage("CreateOfferingPage")}>
            ${T("Create New Credential Offer")}
        </ion-button>
    </div>


</ion-card>
`

}


window.MHR.register("DisplayOfferingQRCode", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    async enter(id) {

        try {
            var record = await pb.send('/eidasapi/createqrcode/'+id)
            console.log(record)            
        } catch (error) {
            gotoPage("ErrorPage", {title: "Error retrieving credential "+id, msg: error.message})
            return
        }

        // https://wallet.mycredential.eu?command=getvc&vcid=https://issuer.mycredential.eu/issuer/api/v1/credential/fd34b1c1-96cb-49c5-92bc-b52c5b96f6f1
        
        var credentialHref = "https://wallet.mycredential.eu/?command=getvc&vcid=https://issuersec.mycredential.eu/eidasapi/retrievecredential/" + id
        var linkToCredential = "https://issuersec.mycredential.eu/eidasapi/retrievecredential/" + id
    
        const theHtml = html`
<ion-card>
    <ion-card-header>
        <ion-card-title>Scan this QR code to load credential in wallet</ion-card-title>
    </ion-card-header>

    <ion-card-content>

        <img src="${record.image}" alt="QR code">

        <h1><a href=${credentialHref} target="_blank">Or click here to use same-device wallet</a></h1>
        <h2><a href=${linkToCredential} target="_blank">Direct link to credential</a></h2>

    </ion-card-content>

    <div class="ion-margin-start ion-margin-bottom">
        <ion-button @click=${()=> window.MHR.cleanReload()}>
            ${T("Home")}
        </ion-button>
    </div>

</ion-card>

        `

        this.render(theHtml, false)

        // Re-run the highlighter for the VC display
        Prism.highlightAll()


    }


})

async function storeOfferingInServer(record) {
    const userEmail = record.credentialSubject.mandate.mandatee.email
    const learcred = JSON.stringify(record)

    var model = pb.authStore.model

    const data = {
        status: "tobesigned",
        email: userEmail,
        type: "jwt_vc",
        raw: learcred,
        creator_email: model.email
    };

    try {
        const record = await pb.collection('credentials').create(data);
        console.log(record)            
    } catch (error) {
        gotoPage("ErrorPage", {title: "Error saving credential", msg: error.message})
        return
    }

    alert("Credential saved!!")

}
