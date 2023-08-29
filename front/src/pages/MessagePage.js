let gotoPage = window.MHR.gotoPage
let goHome = window.MHR.goHome

window.MHR.register("MessagePage", class MessagePage extends window.MHR.AbstractPage {

    constructor(id) {
        super(id)
    }

    enter(pageData) {
        let html = this.html

        // We expect pageData to be an object with two fields:
        // - title: the string to be used for the title of the message
        // - msg: the string with the details

        // Provide a default title if the user did not set the title
        let title = T("Message")
        if (pageData && pageData.title) {
            title = T(pageData.title)
        }

        //Provide a defaul message if the user did not specify it
        let msg = ""
        if (pageData && pageData.msg) {
            msg = T(pageData.msg)
        }

        // Display the title and message, with a button that goes to the home page
        let theHtml = html`
        <div class="w3-container w3-padding-64">
            <div class="w3-card-4 w3-center">
        
                <header class="w3-container w3-center color-primary">
                    <h3>${title}</h3>
                </header>
        
                <div class="w3-container">
                    <p>${msg}</p>
                </div>
                
                <div class="w3-container w3-center w3-padding">
                    <btn-primary onclick=${()=>goHome()}>${T("Accept")}</btn-primary>        
                </div>

            </div>
        </div>
        `
        this.render(theHtml)
    }
})
