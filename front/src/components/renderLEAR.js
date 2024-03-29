// The logo in the header
import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'

// For rendering the HTML in the pages
import { html } from 'uhtml';


export function renderLEARCredentialCard(vc, status) {

    console.log("renderLEARCredentialCard with:", status, vc)

    const vcs = vc.credentialSubject
    const first_name = vcs.mandate.mandatee.first_name
    const last_name = vcs.mandate.mandatee.last_name
    var avatar = photo_man
    if (vcs.mandate.mandatee.gender.toUpperCase() == "F") {
        avatar = photo_woman
    }
    const powers = vcs.mandate.power

    const learCard = html`
        <ion-card-header>
            <ion-card-title>${first_name} ${last_name}</ion-card-title>
            <ion-card-subtitle>Employee</ion-card-subtitle>
        </ion-card-header>

        <ion-card-content class="ion-padding-bottom">

            <div>
            <ion-list>
            
                <ion-item>
                    <ion-thumbnail slot="start">
                        <img alt="Avatar" src=${avatar} />
                    </ion-thumbnail>
                    ${(status == "offered") ? html`<ion-label color="danger"><b>Status: signature pending</b></ion-label>` : null}
                </ion-item>
            
                ${powers.map(pow => {
                return html`<ion-item><ion-label>${pow.tmf_domain[0]}: ${pow.tmf_function} [${pow.tmf_action}]</ion-label></ion-item>`
                })}
            </ion-list>
            </div>


        </ion-card-content>
        `
    return learCard

}