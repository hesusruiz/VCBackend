// The logo in the header
import photo_man from '../img/photo_man.png'
import photo_woman from '../img/photo_woman.png'

// For rendering the HTML in the pages
import { html } from 'uhtml';

/**
 * renderLEARCredentialCard creates the HTML rendering the credential as a Card.
 * The result can be embedded in other HTML for presenting the credential.
 * @param {JSONObject}  vc - The Verifiable Credential.
 * @param {string}  status - One of 'offered', 'tobesigned' or 'signed'.
 * @returns {Tag<HTMLElement>} - The HTML representing the credential
 */
export function renderLEARCredentialCard(vc, status) {
    console.log("renderLEARCredentialCard with:", status, vc)

    // TODO: perform some verifications to make sure the credential is a LEARCredential

    const vcs = vc.credentialSubject
    const first_name = vcs.mandate.mandatee.first_name
    const last_name = vcs.mandate.mandatee.last_name

    // TODO: Gender will not be in the credential in the future
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
                    ${(status != "signed") ? html`<ion-label color="danger"><b>Status: signature pending</b></ion-label>` : null}
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