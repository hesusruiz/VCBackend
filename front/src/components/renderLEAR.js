// The logo in the header
import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'
import { log } from '../log'
// For rendering the HTML in the pages
import { html } from 'uhtml';


export function renderLEARCredential(vc) {

    const vcs = vc.credentialSubject
    const first_name = vc.credentialSubject.mandate.mandatee.first_name
    const last_name = vc.credentialSubject.mandate.mandatee.last_name
    var avatar = photo_man
    if (vcs.gender == "f") {
        avatar = photo_woman
    }
    const powers = vc.credentialSubject.mandate.power

    const learCard = html`
        <ion-card-header>
            <ion-card-title>${first_name} ${last_name}</ion-card-title>
            <ion-card-subtitle>Employee</ion-card-subtitle>
        </ion-card-header>

        <ion-card-content class="ion-padding-bottom">

            <ion-avatar>
                <img alt="Avatar" src=${avatar} />
            </ion-avatar>

            <div>
            <ion-list>
                ${powers.map(pow => {
                    return html`<ion-item><ion-label>${pow.tmf_domain[0]}: ${pow.tmf_function} [${pow.tmf_action}]</ion-label></ion-item>`
                })}
            </ion-list>
            </div>


        </ion-card-content>
        `
    return learCard

}