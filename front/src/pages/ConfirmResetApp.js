let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome

window.MHR.register("ConfirmResetApp", class extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter(pageData) {
        let html = this.html

        // We expect pageData to be an object with two fields:
        // - title: the string to be used for the title of the message
        // - msg: the string with the details

        // Provide a default title if the user did not set the title
        let title = T("Confirm Reset")

        // Provide a default message if the user did not specify it
        let msg = "Are you sure you want to RESET the app and delete everything?"

        // Display the title and message, with a button that goes to the home page
        let theHtml = html`
        <div class="w3-container w3-padding-64">
            <div class="w3-card-4 w3-center">
        
                <header class="w3-container w3-center color-error">
                    <h3>${title}</h3>
                </header>
        
                <div class="w3-container">
                    <p>${msg}</p>
                </div>
                
                <div class="w3-container w3-center w3-padding">
                    <btn-danger @click=${()=> this.resetApplication()}>${T("Delete")}</btn-danger>
                </div>

            </div>
        </div>
        `
        this.render(theHtml)
    }

    async resetApplication() {
        await window.MHR.storage.resetDatabase()
        // Reload the application
        window.MHR.cleanReload()
        return
    }


})

