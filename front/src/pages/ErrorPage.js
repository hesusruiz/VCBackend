let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome

window.MHR.register("ErrorPage", class ErrorPage extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter(pageData) {
        let html = this.html

        // We expect pageData to be an object with two fields:
        // - title: the string to be used for the title of the error page
        // - msg: the string with the details of the error

        // Provide a default title if the user did not set the title
        let title = T("Error")
        if (pageData && pageData.title) {
            title = T(pageData.title)
        }

        //Provide a defaul message if the user did not specify it
        let msg = T("An error has happened.")
        if (pageData && pageData.msg) {
            msg = T(pageData.msg)
        }

        // Display the title and message, with a button that reloads the whole application
        let theHtml = html`

        <ion-card>

            <ion-card-header>
                <ion-card-title>${title}</ion-card-title>
            </ion-card-header>

            <ion-card-content class="ion-padding-bottom">
                <div class="text-larger">${msg}</div>
                <div>${T("Please click Accept to refresh the page.")}</div>
            </ion-card-content>

            <div class="ion-margin-start ion-margin-bottom">

                <ion-button color="danger" @click=${()=> window.MHR.cleanReload()}>
                    ${T("Accept")}
                </ion-button>

            </div>
        </ion-card>
        `
        this.render(theHtml)
    }
})

